package main

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	procEnumWindows              = user32.NewProc("EnumWindows")
	procGetWindowThreadProcessId = user32.NewProc("GetWindowThreadProcessId")
	procIsWindowVisible          = user32.NewProc("IsWindowVisible")
)

const pollEvery = 200 * time.Millisecond

// follow tracks the install from Connect closing to the new Connect's window,
// and keeps the window's state in step.
func follow(o options, w *ui, baseline int64, started time.Time) {
	installDir := filepath.Dir(o.appExe)

	if !waitForExit(uint32(o.parentPID), 30*time.Second) {
		// Connect stayed open, so the installer never started: Connect shows
		// that itself (modular-updater.ts handleUpdaterError).
		log.Printf("Connect (pid %d) still running after 30 s, leaving", o.parentPID)
		w.close()
		return
	}
	closed := time.Now()
	log.Printf("Connect closed")

	est := estimator{baseline: baseline}
	setupName := filepath.Base(o.installer)
	var setup *process
	staging := ""
	stalled := false
	for {
		if app := appWindow(o.appExe); app != 0 {
			log.Printf("new Connect window during the install")
			w.finish(app)
			return
		}
		if setup == nil && o.installer != "" {
			if setup = findProcess(setupName); setup != nil {
				log.Printf("installer running, pid %d", setup.pid)
			}
		}
		if staging == "" {
			if staging = findStagingDir(os.TempDir(), started); staging != "" {
				log.Printf("staging folder %s", staging)
			}
		}
		staged := int64(-1)
		if staging != "" {
			staged = dirSize(staging)
		}
		percent := est.installing(staged, dirSize(installDir), time.Since(closed).Seconds())
		if !stalled {
			w.progress("installing", percent)
		}

		if setup != nil {
			if code, done := setup.exitCode(); done {
				log.Printf("installer exited with %d", code)
				if code != 0 {
					w.fail("failed", fileExists(o.appExe))
					return
				}
				break
			}
		}
		// Nothing has happened at all, or something has taken far too long.
		// Said, not given up on: Connect is not offered while the installer
		// may still be writing it, and if the install finishes after all the
		// window carries on as usual.
		elapsed := time.Since(closed)
		if !stalled && ((setup == nil && staging == "" && elapsed > 2*time.Minute) || elapsed > 10*time.Minute) {
			stalled = true
			w.fail("stalled", false)
		}
		time.Sleep(pollEvery)
	}

	// The installer starts the new Connect itself (--force-run).
	w.progress("opening", installedPercent)
	if app := waitForAppWindow(o.appExe, 15*time.Second); app != 0 {
		w.finish(app)
		return
	}
	if fileExists(o.appExe) {
		log.Printf("Connect did not start, starting it")
		launch(o.appExe)
		if app := waitForAppWindow(o.appExe, 30*time.Second); app != 0 {
			w.finish(app)
			return
		}
	}
	w.fail("not-opened", fileExists(o.appExe))
}

// playDemo runs the window through an install without one: Connect's
// settings page shows it in development (--demo).
func playDemo(o options, w *ui) {
	time.Sleep(900 * time.Millisecond)
	est := estimator{baseline: 1000}
	for i := int64(0); i <= 40; i++ {
		w.progress("installing", est.installing(i*25, 0, 0))
		time.Sleep(80 * time.Millisecond)
	}
	for i := int64(0); i <= 20; i++ {
		w.progress("installing", est.installing(1000, i*50, 0))
		time.Sleep(70 * time.Millisecond)
	}
	w.progress("opening", installedPercent)
	time.Sleep(1200 * time.Millisecond)
	if o.demo == "error" {
		w.fail("failed", true)
		return
	}
	w.finish(0)
}

type process struct {
	pid    uint32
	handle windows.Handle
}

// findProcess finds a running process by its file name. The installer's name
// carries its version (Connect-Setup-0.3.2.exe), which is unique enough.
func findProcess(name string) *process {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil
	}
	defer windows.CloseHandle(snapshot)
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	for err = windows.Process32First(snapshot, &entry); err == nil; err = windows.Process32Next(snapshot, &entry) {
		if !strings.EqualFold(windows.UTF16ToString(entry.ExeFile[:]), name) {
			continue
		}
		handle, err := windows.OpenProcess(windows.SYNCHRONIZE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, entry.ProcessID)
		if err != nil {
			continue
		}
		return &process{pid: entry.ProcessID, handle: handle}
	}
	return nil
}

func (p *process) exitCode() (uint32, bool) {
	if event, _ := windows.WaitForSingleObject(p.handle, 0); event != windows.WAIT_OBJECT_0 {
		return 0, false
	}
	var code uint32
	if err := windows.GetExitCodeProcess(p.handle, &code); err != nil {
		return 0, true
	}
	return code, true
}

// waitForExit reports whether the process is gone within the timeout. One
// that cannot be opened is taken as gone.
func waitForExit(pid uint32, timeout time.Duration) bool {
	handle, err := windows.OpenProcess(windows.SYNCHRONIZE, false, pid)
	if err != nil {
		return true
	}
	defer windows.CloseHandle(handle)
	event, _ := windows.WaitForSingleObject(handle, uint32(timeout.Milliseconds()))
	return event == windows.WAIT_OBJECT_0
}

func waitForAppWindow(appExe string, timeout time.Duration) uintptr {
	for deadline := time.Now().Add(timeout); time.Now().Before(deadline); time.Sleep(pollEvery) {
		if app := appWindow(appExe); app != 0 {
			return app
		}
	}
	return 0
}

// The EnumWindows callback is made once: Go keeps every callback it makes
// for good, and polling would make one every 200 ms. Only follow's goroutine
// enumerates, so these are not shared.
var (
	enumWindowsProc = windows.NewCallback(enumWindow)
	enumTarget      string
	enumFound       uintptr
)

// appWindow returns a visible top-level window of a process started from
// appExe, or 0.
func appWindow(appExe string) uintptr {
	enumTarget, enumFound = appExe, 0
	_, _, _ = procEnumWindows.Call(enumWindowsProc, 0)
	return enumFound
}

func enumWindow(hwnd, _ uintptr) uintptr {
	if visible, _, _ := procIsWindowVisible.Call(hwnd); visible == 0 {
		return 1
	}
	var pid uint32
	_, _, _ = procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	if pid == 0 || pid == uint32(os.Getpid()) {
		return 1
	}
	if strings.EqualFold(processPath(pid), enumTarget) {
		enumFound = hwnd
		return 0
	}
	return 1
}

func processPath(pid uint32) string {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return ""
	}
	defer windows.CloseHandle(handle)
	buf := make([]uint16, windows.MAX_LONG_PATH)
	size := uint32(len(buf))
	if err := windows.QueryFullProcessImageName(handle, 0, &buf[0], &size); err != nil {
		return ""
	}
	return windows.UTF16ToString(buf[:size])
}

func launch(path string) {
	if path == "" {
		return
	}
	if err := windows.ShellExecute(0, windows.StringToUTF16Ptr("open"), windows.StringToUTF16Ptr(path), nil,
		windows.StringToUTF16Ptr(filepath.Dir(path)), swShowNormal); err != nil {
		log.Printf("starting %s: %v", path, err)
	}
}

func shellOpen(url string) {
	if err := windows.ShellExecute(0, windows.StringToUTF16Ptr("open"), windows.StringToUTF16Ptr(url), nil, nil, swShowNormal); err != nil {
		log.Printf("opening %s: %v", url, err)
	}
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
