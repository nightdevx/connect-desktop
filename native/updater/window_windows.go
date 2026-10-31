package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unsafe"

	"github.com/jchv/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

var (
	user32  = windows.NewLazySystemDLL("user32.dll")
	gdi32   = windows.NewLazySystemDLL("gdi32.dll")
	shcore  = windows.NewLazySystemDLL("shcore.dll")
	shell32 = windows.NewLazySystemDLL("shell32.dll")
	dwmapi  = windows.NewLazySystemDLL("dwmapi.dll")

	procCreateWindowExW               = user32.NewProc("CreateWindowExW")
	procDefWindowProcW                = user32.NewProc("DefWindowProcW")
	procDestroyWindow                 = user32.NewProc("DestroyWindow")
	procDispatchMessageW              = user32.NewProc("DispatchMessageW")
	procGetClientRect                 = user32.NewProc("GetClientRect")
	procGetMessageW                   = user32.NewProc("GetMessageW")
	procGetMonitorInfoW               = user32.NewProc("GetMonitorInfoW")
	procLoadCursorW                   = user32.NewProc("LoadCursorW")
	procMonitorFromPoint              = user32.NewProc("MonitorFromPoint")
	procPostMessageW                  = user32.NewProc("PostMessageW")
	procPostQuitMessage               = user32.NewProc("PostQuitMessage")
	procRegisterClassExW              = user32.NewProc("RegisterClassExW")
	procSetForegroundWindow           = user32.NewProc("SetForegroundWindow")
	procSetProcessDpiAwarenessContext = user32.NewProc("SetProcessDpiAwarenessContext")
	procSetWindowPos                  = user32.NewProc("SetWindowPos")
	procShowWindow                    = user32.NewProc("ShowWindow")
	procTranslateMessage              = user32.NewProc("TranslateMessage")
	procCreateSolidBrush              = gdi32.NewProc("CreateSolidBrush")
	procGetDpiForMonitor              = shcore.NewProc("GetDpiForMonitor")
	procExtractIconExW                = shell32.NewProc("ExtractIconExW")
	procDwmSetWindowAttribute         = dwmapi.NewProc("DwmSetWindowAttribute")
)

const (
	wmDestroy    = 0x0002
	wmSize       = 0x0005
	wmClose      = 0x0010
	wmNCCalcSize = 0x0083
	wmDPIChanged = 0x02E0
	wmState      = 0x8000 + 1 // WM_APP+1: the follower has a new state
	wmFinish     = 0x8000 + 2 // WM_APP+2: the new Connect is on screen

	wsPopup        = 0x80000000
	wsCaption      = 0x00C00000
	wsSysMenu      = 0x00080000
	wsMinimizeBox  = 0x00020000
	wsClipChildren = 0x02000000
	wsExAppWindow  = 0x00040000
	wsExToolWindow = 0x00000080
	wsExNoActivate = 0x08000000

	swHide           = 0
	swShowNormal     = 1
	swShowNoActivate = 4

	// The window, in device-independent pixels.
	windowWidth  = 340
	windowHeight = 280
)

// The page's background, #0e0f11 (Odak --odak-bg), as a COLORREF (0x00BBGGRR).
// The window is filled with it before the page has drawn anything, so it never
// flashes white.
const graphite = 0x00110F0E

type rect struct{ Left, Top, Right, Bottom int32 }

type monitorInfo struct {
	cbSize    uint32
	rcMonitor rect
	rcWork    rect
	dwFlags   uint32
}

type wndClassEx struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     windows.Handle
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}

type msg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
	private uint32
}

// state is what the page draws (page/index.html, connectUpdater.update).
type state struct {
	Phase    string  `json:"phase"` // closing, installing, opening, error
	Percent  float64 `json:"percent"`
	Version  string  `json:"version,omitempty"`
	Error    string  `json:"error,omitempty"` // failed, stalled, not-opened
	CanOpen  bool    `json:"canOpen"`         // Connect.exe is there to open
	Download bool    `json:"download"`        // there is a download page to offer
}

// ui is the one window. Its methods other than run are safe to call from
// any goroutine: they hand the change to the window's thread.
type ui struct {
	opts options
	hwnd uintptr
	web  *edge.Chromium

	mu     sync.Mutex
	latest state
	ready  sync.Once
}

// The window procedure is a plain function, so it reaches the window through
// this. There is only ever one.
var theUI *ui

func newUI(o options, initial state, page string) (*ui, error) {
	w := &ui{opts: o, latest: initial}
	theUI = w

	// Per-monitor DPI aware, so the window is sharp and the centre Connect
	// passes (physical pixels) means the same thing here. Fails harmlessly
	// before Windows 10 1703.
	_, _, _ = procSetProcessDpiAwarenessContext.Call(^uintptr(3)) // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 (-4)

	var instance windows.Handle
	if err := windows.GetModuleHandleEx(0, nil, &instance); err != nil {
		return nil, err
	}
	className := windows.StringToUTF16Ptr("ConnectUpdater")
	brush, _, _ := procCreateSolidBrush.Call(graphite)
	cursor, _, _ := procLoadCursorW.Call(0, 32512) // IDC_ARROW
	wc := wndClassEx{
		style:         0x0003, // CS_HREDRAW | CS_VREDRAW
		lpfnWndProc:   windows.NewCallback(wndProc),
		hInstance:     instance,
		hCursor:       cursor,
		hbrBackground: brush,
		lpszClassName: className,
	}
	wc.cbSize = uint32(unsafe.Sizeof(wc))
	// Connect's own icon, for the taskbar and Alt+Tab. Read now: the
	// installer is about to move Connect.exe away.
	if o.appExe != "" {
		_, _, _ = procExtractIconExW.Call(uintptr(unsafe.Pointer(windows.StringToUTF16Ptr(o.appExe))), 0,
			uintptr(unsafe.Pointer(&wc.hIcon)), uintptr(unsafe.Pointer(&wc.hIconSm)), 1)
	}
	if r, _, err := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc))); r == 0 {
		return nil, fmt.Errorf("RegisterClassEx: %w", err)
	}

	x, y, width, height := placement(o)
	style := uintptr(wsPopup | wsCaption | wsSysMenu | wsMinimizeBox | wsClipChildren)
	exStyle := uintptr(wsExAppWindow)
	show := uintptr(swShowNormal)
	if o.offscreen {
		// Kept out of the taskbar and never focused: nothing of a test run
		// shows on the screen.
		exStyle = wsExToolWindow | wsExNoActivate
		show = swShowNoActivate
	}
	title := windows.StringToUTF16Ptr("Connect güncelleniyor")
	hwnd, _, err := procCreateWindowExW.Call(exStyle, uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(title)),
		style, uintptr(x), uintptr(y), uintptr(width), uintptr(height), 0, 0, uintptr(instance), 0)
	if hwnd == 0 {
		return nil, fmt.Errorf("CreateWindowEx: %w", err)
	}
	w.hwnd = hwnd
	var client rect
	_, _, _ = procGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&client)))
	log.Printf("window %dx%d at %d,%d, client %dx%d", width, height, x, y, client.Right, client.Bottom)

	// A dark frame with round corners and a border in Odak's line colour on
	// Windows 11; Windows 10 ignores all three.
	setDwmAttribute(hwnd, 20, 1)          // DWMWA_USE_IMMERSIVE_DARK_MODE
	setDwmAttribute(hwnd, 33, 2)          // DWMWA_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND
	setDwmAttribute(hwnd, 34, 0x002B2522) // DWMWA_BORDER_COLOR = #22252b

	// Shown before the page loads: a graphite card at once, the page within
	// half a second. Connect waits for "ready" before it closes, so there is
	// never a moment with neither on screen.
	_, _, _ = procShowWindow.Call(hwnd, show)
	if !o.offscreen {
		_, _, _ = procSetForegroundWindow.Call(hwnd)
	}

	if err := w.embed(initial, page); err != nil {
		return nil, err
	}
	return w, nil
}

func (w *ui) embed(initial state, page string) error {
	// The page's colour before it draws, and no pausing while covered: the
	// first frame is what tells Connect it may close.
	// Added to, not replaced: a debugging port set from outside still applies.
	_ = os.Setenv("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF0E0F11")
	_ = os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
		strings.TrimSpace(os.Getenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS")+" --disable-features=CalculateNativeWinOcclusion"))

	web := edge.NewChromium()
	web.DataPath = filepath.Join(os.TempDir(), "connect-updater", "webview")
	web.MessageCallback = w.onMessage
	if !web.Embed(w.hwnd) {
		return errors.New("WebView2 is not available")
	}
	w.web = web

	if settings, err := web.GetSettings(); err == nil {
		_ = settings.PutAreDefaultContextMenusEnabled(false)
		_ = settings.PutAreDevToolsEnabled(false)
		_ = settings.PutIsStatusBarEnabled(false)
		_ = settings.PutIsZoomControlEnabled(false)
		_ = settings.PutIsPinchZoomEnabled(false)
		_ = settings.PutAreBrowserAcceleratorKeysEnabled(false)
	}
	if c2 := web.GetController().GetICoreWebView2Controller2(); c2 != nil {
		_ = c2.PutDefaultBackgroundColor(edge.COREWEBVIEW2_COLOR{A: 255, R: 0x0e, G: 0x0f, B: 0x11})
	}
	w.resize()

	data, err := json.Marshal(initial)
	if err != nil {
		return err
	}
	web.Init("window.connectUpdaterInitial=" + string(data) + ";")
	web.NavigateToString(page)
	if !w.opts.offscreen {
		web.Focus()
	}
	return nil
}

// run pumps messages until the window is gone.
func (w *ui) run() {
	var m msg
	for {
		r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			return
		}
		_, _, _ = procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		_, _, _ = procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
}

func (w *ui) progress(phase string, percent float64) {
	w.mu.Lock()
	// Logged on each phase and every tenth of the way, not every poll.
	if phase != w.latest.Phase || int(percent)/10 != int(w.latest.Percent)/10 {
		log.Printf("%s %.0f%%", phase, percent)
	}
	w.latest.Phase, w.latest.Percent, w.latest.Error = phase, percent, ""
	w.mu.Unlock()
	_, _, _ = procPostMessageW.Call(w.hwnd, wmState, 0, 0)
}

func (w *ui) fail(kind string, canOpen bool) {
	log.Printf("error: %s (can open Connect: %v)", kind, canOpen)
	w.mu.Lock()
	w.latest.Phase, w.latest.Error, w.latest.CanOpen = "error", kind, canOpen
	w.mu.Unlock()
	_, _, _ = procPostMessageW.Call(w.hwnd, wmState, 0, 0)
}

// finish closes the window: the new Connect is on screen.
func (w *ui) finish() {
	_, _, _ = procPostMessageW.Call(w.hwnd, wmFinish, 0, 0)
}

func (w *ui) flush() {
	if w.web == nil {
		return
	}
	w.mu.Lock()
	data, _ := json.Marshal(w.latest)
	w.mu.Unlock()
	w.web.Eval("window.connectUpdater&&window.connectUpdater.update(" + string(data) + ")")
}

func (w *ui) resize() {
	if w.web == nil {
		return
	}
	controller := w.web.GetController()
	bounds, err := controller.GetBounds()
	if err != nil {
		return
	}
	var client rect
	_, _, _ = procGetClientRect.Call(w.hwnd, uintptr(unsafe.Pointer(&client)))
	bounds.Left, bounds.Top, bounds.Right, bounds.Bottom = client.Left, client.Top, client.Right, client.Bottom
	_ = controller.PutBounds(*bounds)
}

// onMessage takes the page's window.chrome.webview.postMessage calls. It runs
// on the window's thread.
func (w *ui) onMessage(message string) {
	switch message {
	case "ready":
		w.ready.Do(func() {
			w.flush()
			// Connect is waiting on this line before it closes.
			_, _ = fmt.Fprintln(os.Stdout, "ready")
			_ = os.Stdout.Close()
			log.Printf("ready")
		})
	case "open-app":
		launch(w.opts.appExe)
		w.close()
	case "open-download":
		if w.opts.releaseURL != "" {
			shellOpen(w.opts.releaseURL)
		}
		w.close()
	case "close":
		w.close()
	}
}

func (w *ui) close() {
	_, _, _ = procDestroyWindow.Call(w.hwnd)
}

func wndProc(hwnd, message, wParam, lParam uintptr) uintptr {
	switch message {
	case wmNCCalcSize:
		// The whole window is client area: no title bar, while Windows still
		// draws the frame's shadow and round corners. Both forms: creation
		// sends the one without wParam.
		return 0
	case wmSize:
		if theUI != nil {
			theUI.resize()
		}
		return 0
	case wmDPIChanged:
		// Moved to a monitor with another scale: take the size Windows offers.
		r := *(**rect)(unsafe.Pointer(&lParam))
		_, _, _ = procSetWindowPos.Call(hwnd, 0, uintptr(r.Left), uintptr(r.Top),
			uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top), 0x0014) // SWP_NOZORDER | SWP_NOACTIVATE
		return 0
	case wmState:
		if theUI != nil {
			theUI.flush()
		}
		return 0
	case wmFinish:
		_, _, _ = procShowWindow.Call(hwnd, swHide)
		_, _, _ = procDestroyWindow.Call(hwnd)
		return 0
	case wmClose:
		_, _, _ = procDestroyWindow.Call(hwnd)
		return 0
	case wmDestroy:
		_, _, _ = procPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := procDefWindowProcW.Call(hwnd, message, wParam, lParam)
	return r
}

// placement centres the window on Connect's window, scaled for that
// monitor and kept inside its work area. Without a centre it goes in the
// middle of the primary monitor.
func placement(o options) (x, y, width, height int32) {
	var at point
	if o.center != nil {
		at = *o.center
	}
	// MonitorFromPoint takes the POINT by value: both halves in one register.
	monitor, _, _ := procMonitorFromPoint.Call(uintptr(uint32(at.x))|uintptr(uint32(at.y))<<32, 2) // MONITOR_DEFAULTTONEAREST

	dpi := uint32(96)
	var dpiX, dpiY uint32
	r, _, _ := procGetDpiForMonitor.Call(monitor, 0, uintptr(unsafe.Pointer(&dpiX)), uintptr(unsafe.Pointer(&dpiY)))
	log.Printf("monitor %x dpi %d (result %x)", monitor, dpiX, r)
	if r == 0 && dpiX > 0 {
		dpi = dpiX
	}
	width = int32(windowWidth * dpi / 96)
	height = int32(windowHeight * dpi / 96)

	info := monitorInfo{}
	info.cbSize = uint32(unsafe.Sizeof(info))
	_, _, _ = procGetMonitorInfoW.Call(monitor, uintptr(unsafe.Pointer(&info)))
	work := info.rcWork
	if o.center == nil {
		at = point{(work.Left + work.Right) / 2, (work.Top + work.Bottom) / 2}
	}
	x = max(work.Left, min(at.x-width/2, work.Right-width))
	y = max(work.Top, min(at.y-height/2, work.Bottom-height))
	if o.offscreen {
		x, y = -20000, -20000
	}
	return x, y, width, height
}

func setDwmAttribute(hwnd uintptr, attribute, value uint32) {
	_, _, _ = procDwmSetWindowAttribute.Call(hwnd, uintptr(attribute), uintptr(unsafe.Pointer(&value)), 4)
}
