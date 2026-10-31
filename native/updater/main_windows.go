// Command connect-updater is the window Connect shows while an update
// installs (connect/planlar/masaustu/GUNCELLEME-PENCERESI-PLANI.md).
//
// The installer moves Connect's files out and writes new ones, so neither
// Connect nor anything started from its folder can stay open. Connect copies
// this program to %TEMP%, starts it, and waits for it to say "ready" before
// electron-updater runs the installer. The window then follows the install
// from the outside and closes once the new Connect has a window on screen.
package main

import (
	_ "embed"
	"encoding/base64"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

//go:embed page/index.html
var pageHTML string

// Copies of the app's Space Grotesk (src/renderer/src/assets/fonts), with
// global.css's unicode ranges: Turkish needs the latin-ext half.
var (
	//go:embed page/space-grotesk-latin.woff2
	fontLatin []byte
	//go:embed page/space-grotesk-latin-ext.woff2
	fontLatinExt []byte
)

func init() {
	// The window, WebView2 and COM all belong to the main thread.
	runtime.LockOSThread()
}

func main() {
	started := time.Now()
	logDir := filepath.Join(os.TempDir(), "connect-updater")
	_ = os.MkdirAll(logDir, 0o755)
	if f, err := os.Create(filepath.Join(logDir, "updater.log")); err == nil {
		defer f.Close()
		log.SetOutput(f)
	}
	log.SetFlags(log.Ltime | log.Lmicroseconds)

	o, err := parseOptions(os.Args[1:])
	if err != nil {
		log.Printf("options: %v", err)
		os.Exit(2)
	}
	log.Printf("args %q", os.Args[1:])

	// Measured before anything else: once Connect stops waiting the installer
	// starts moving these files out.
	var baseline int64
	if o.demo == "" {
		baseline = dirSize(filepath.Dir(o.appExe))
		log.Printf("install folder holds %d bytes", baseline)
	}

	initial := state{Phase: "closing", Percent: closingPercent, Version: o.version, Download: o.releaseURL != ""}
	w, err := newUI(o, initial, page())
	if err != nil {
		// Connect sees the exit before "ready" and installs without a window.
		log.Printf("window: %v", err)
		os.Exit(3)
	}

	if o.demo != "" {
		go playDemo(o, w)
	} else {
		go follow(o, w, baseline, started)
	}
	w.run()
	log.Printf("done")
}

func page() string {
	fonts := fontFace(fontLatinExt, "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF") +
		fontFace(fontLatin, "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD")
	return strings.Replace(pageHTML, "/*FONTS*/", fonts, 1)
}

func fontFace(woff2 []byte, unicodeRange string) string {
	return `@font-face{font-family:"Space Grotesk";font-style:normal;font-weight:400 700;font-display:block;` +
		`src:url(data:font/woff2;base64,` + base64.StdEncoding.EncodeToString(woff2) + `) format("woff2");` +
		`unicode-range:` + unicodeRange + `;}`
}
