package main

import (
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Where each stage of the install lands on the bar. Closing Connect and moving
// the old files out take a moment; unpacking the new files is most of the
// wait; copying them into place is the rest. What is left after that (the
// installer's bookkeeping, Connect starting) shows as installedPercent.
const (
	closingPercent   = 2.0
	emptiedPercent   = 5.0
	unpackedPercent  = 70.0
	copiedPercent    = 95.0
	installedPercent = 98.0
)

// estimator turns what the installer leaves on disk into a percentage.
//
// The NSIS installer electron-builder makes (app-builder-lib
// templates/nsis) first moves the old files out of the install folder
// (uninstaller.nsh, atomicRMDir), then unpacks the new ones into a staging
// folder, <its plugins folder in %TEMP%>\7z-out, then copies them into the
// install folder (extractAppPackage.nsh). Both folders end up the size of the
// install, and the old install's size is close enough to the new one's to
// measure them against.
type estimator struct {
	baseline int64 // bytes in the install folder before the update
	emptied  bool  // the old files have been moved out
	leftover int64 // bytes still in the install folder when it emptied
	staged   bool  // the staging folder has been found
	shown    float64
}

// installing takes the bytes in the staging folder (-1 while it has not been
// found), the bytes in the install folder, and the seconds since Connect
// closed. The result never goes down and stops at copiedPercent: only the
// installer exiting moves the bar past it.
func (e *estimator) installing(staged, installed int64, elapsed float64) float64 {
	if e.baseline <= 0 {
		// Nothing to measure against: ease towards the copy mark instead.
		return e.show(emptiedPercent + (copiedPercent-emptiedPercent)*(1-math.Exp(-elapsed/25)))
	}
	if !e.emptied {
		if installed >= e.baseline/10 {
			return e.show(closingPercent)
		}
		e.emptied = true
		e.leftover = installed
	}
	if staged >= 0 {
		e.staged = true
	}

	copied := clamp01(float64(installed-e.leftover) / float64(e.baseline-e.leftover))
	if !e.staged {
		return e.show(emptiedPercent + (copiedPercent-emptiedPercent)*copied)
	}
	p := emptiedPercent + (unpackedPercent-emptiedPercent)*clamp01(float64(staged)/float64(e.baseline))
	if copied > 0.01 {
		p = math.Max(p, unpackedPercent+(copiedPercent-unpackedPercent)*copied)
	}
	return e.show(p)
}

func (e *estimator) show(p float64) float64 {
	e.shown = math.Max(e.shown, math.Min(p, copiedPercent))
	return e.shown
}

func clamp01(v float64) float64 {
	return math.Max(0, math.Min(1, v))
}

// dirSize is the bytes in every file under root. Files that vanish or are
// locked while it walks are skipped: the installer is busy in there.
func dirSize(root string) int64 {
	var total int64
	_ = filepath.WalkDir(root, func(_ string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if info, err := d.Info(); err == nil {
			total += info.Size()
		}
		return nil
	})
	return total
}

// findStagingDir looks in temp for the folder an installer started after since
// unpacks into: NSIS names its plugins folder ns<random>.tmp.
func findStagingDir(temp string, since time.Time) string {
	entries, err := os.ReadDir(temp)
	if err != nil {
		return ""
	}
	for _, entry := range entries {
		name := strings.ToLower(entry.Name())
		if !entry.IsDir() || !strings.HasPrefix(name, "ns") || !strings.HasSuffix(name, ".tmp") {
			continue
		}
		info, err := entry.Info()
		if err != nil || info.ModTime().Before(since) {
			continue
		}
		staging := filepath.Join(temp, entry.Name(), "7z-out")
		if st, err := os.Stat(staging); err == nil && st.IsDir() {
			return staging
		}
	}
	return ""
}
