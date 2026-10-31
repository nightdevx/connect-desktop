package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"
)

// options are what Connect passes (src/main/update/updater-window.ts).
type options struct {
	parentPID  int    // the Connect that is closing
	appExe     string // Connect.exe, in the folder the installer rewrites
	installer  string // the downloaded Connect-Setup-<version>.exe
	version    string // the version being installed, for the window
	center     *point // centre of Connect's window, in physical pixels
	releaseURL string // the download page, offered when the install fails
	demo       string // "ok" or "error": play the window without an install
	offscreen  bool   // tests: draw the window off screen, out of the taskbar
}

type point struct{ x, y int32 }

func parseOptions(args []string) (options, error) {
	var o options
	var center string
	fs := flag.NewFlagSet("connect-updater", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.IntVar(&o.parentPID, "parent-pid", 0, "")
	fs.StringVar(&o.appExe, "app", "", "")
	fs.StringVar(&o.installer, "installer", "", "")
	fs.StringVar(&o.version, "version", "", "")
	fs.StringVar(&center, "center", "", "")
	fs.StringVar(&o.releaseURL, "release-url", "", "")
	fs.StringVar(&o.demo, "demo", "", "")
	fs.BoolVar(&o.offscreen, "offscreen", false, "")
	if err := fs.Parse(args); err != nil {
		return o, err
	}

	if center != "" {
		x, y, ok := strings.Cut(center, ",")
		cx, errX := strconv.ParseInt(x, 10, 32)
		cy, errY := strconv.ParseInt(y, 10, 32)
		if !ok || errX != nil || errY != nil {
			return o, fmt.Errorf("bad -center %q", center)
		}
		o.center = &point{int32(cx), int32(cy)}
	}
	// The page opens it with the shell: nothing but a web page.
	if o.releaseURL != "" && !strings.HasPrefix(o.releaseURL, "https://") {
		return o, fmt.Errorf("bad -release-url %q", o.releaseURL)
	}
	switch o.demo {
	case "", "ok", "error":
	default:
		return o, fmt.Errorf("bad -demo %q", o.demo)
	}
	if o.demo != "" {
		return o, nil
	}
	if o.parentPID <= 0 {
		return o, errors.New("missing -parent-pid")
	}
	if !filepath.IsAbs(o.appExe) {
		return o, fmt.Errorf("-app must be an absolute path, got %q", o.appExe)
	}
	if o.installer != "" && !filepath.IsAbs(o.installer) {
		return o, fmt.Errorf("-installer must be an absolute path, got %q", o.installer)
	}
	return o, nil
}
