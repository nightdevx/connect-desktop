package main

import (
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Where each stage of the install lands on the bar, set from a real update
// of the 350 MB app (connect/planlar/masaustu/GUNCELLEME-PENCERESI-PLANI.md,
// F4.3): about 15 s of the installer making sure Connect is closed and moving
// the old version out, 2-3 s unpacking, 3 s copying, then 5-6 s of
// bookkeeping and Connect starting. The first and last stretches leave
// nothing to measure on disk, so the bar eases through them on time; the
// middle is measured.
const (
	closingPercent   = 2.0
	preparedPercent  = 30.0 // the eased start heads here
	unpackedPercent  = 65.0
	copiedPercent    = 85.0
	finishingPercent = 97.0 // the eased end never passes it
	installedPercent = 100.0
)

// estimator turns what the installer leaves on disk into a percentage.
//
// The NSIS installer electron-builder makes (app-builder-lib
// templates/nsis) moves the old files out of the install folder
// (uninstaller.nsh, atomicRMDir), unpacks the new ones into a staging folder,
// <its plugins folder in %TEMP%>z-out, then copies them into the install
// folder (extractAppPackage.nsh). Both folders end up the size of the
// install, and the old install's size is close enough to the new one's to
// measure them against.
type estimator struct {
	baseline int64 // bytes in the install folder before the update
	emptied  bool  // the old files have been moved out
	leftover int64 // bytes still in the install folder when it emptied
	staged   bool  // the staging folder has been found
	copied   bool  // the new files are all in place
	copiedAt float64
	shown    float64
}

// installing takes the bytes in the staging folder (-1 while it has not been
// found), the bytes in the install folder, and the seconds since Connect
// closed. The result never goes down and never passes finishingPercent: only
// the installer exiting fills the bar.
func (e *estimator) installing(staged, installed int64, elapsed float64) float64 {
	if e.baseline <= 0 {
		// Nothing to measure against: time alone.
		return e.show(closingPercent + (finishingPercent-closingPercent)*(1-math.Exp(-elapsed/25)))
	}
	p := closingPercent + (preparedPercent-closingPercent)*(1-math.Exp(-elapsed/8))

	if !e.emptied && installed < e.baseline/10 {
		e.emptied, e.leftover = true, installed
	}
	if staged >= 0 {
		e.staged = true
	}
	if e.staged {
		p = math.Max(p, preparedPercent+(unpackedPercent-preparedPercent)*clamp01(float64(staged)/float64(e.baseline)))
	}
	if e.emptied {
		copied := clamp01(float64(installed-e.leftover) / float64(e.baseline-e.leftover))
		from := preparedPercent
		if e.staged {
			from = unpackedPercent
		}
		if copied > 0.01 {
			p = math.Max(p, from+(copiedPercent-from)*copied)
		}
		if copied >= 0.99 {
			if !e.copied {
				e.copied, e.copiedAt = true, elapsed
			}
			p = math.Max(p, copiedPercent+(finishingPercent-copiedPercent)*(1-math.Exp(-(elapsed-e.copiedAt)/3)))
		}
	}
	return e.show(p)
}

func (e *estimator) show(p float64) float64 {
	e.shown = math.Max(e.shown, math.Min(p, finishingPercent))
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
