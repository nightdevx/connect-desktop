package main

import (
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestEstimatorFollowsTheInstall(t *testing.T) {
	e := estimator{baseline: 1000}
	near := func(name string, got, want float64) {
		t.Helper()
		if math.Abs(got-want) > 0.05 {
			t.Fatalf("%s: got %.2f, want %.2f", name, got, want)
		}
	}
	near("Connect just closed", e.installing(-1, 1000, 0), closingPercent)
	// Nothing on disk changes while the installer checks for Connect and
	// moves the old version out: the bar still moves.
	near("15 s of preparing", e.installing(-1, 1000, 15), 2+28*(1-math.Exp(-15.0/8)))
	near("old files moved out", e.installing(-1, 4, 15), 2+28*(1-math.Exp(-15.0/8)))
	near("half unpacked", e.installing(500, 4, 16), 47.5)
	near("unpacked", e.installing(1000, 4, 17), unpackedPercent)
	near("half copied", e.installing(1000, 502, 18), 75)
	near("copied", e.installing(1000, 1000, 19), copiedPercent)
	near("finishing", e.installing(1000, 1000, 25), 85+12*(1-math.Exp(-2)))
	near("never full on its own", e.installing(1000, 1000, 500), finishingPercent)
}

func TestEstimatorNeverGoesBack(t *testing.T) {
	e := estimator{baseline: 1000}
	e.installing(-1, 0, 0)
	high := e.installing(800, 0, 1)
	// The installer removes its staging folder when it is done.
	if got := e.installing(0, 0, 2); got != high {
		t.Fatalf("went back from %.2f to %.2f", high, got)
	}
}

func TestEstimatorWithoutStagingUsesTheInstallFolder(t *testing.T) {
	e := estimator{baseline: 1000}
	e.installing(-1, 0, 0)
	if got := e.installing(-1, 500, 0); math.Abs(got-57.5) > 0.05 {
		t.Fatalf("got %.2f, want 57.5", got)
	}
}

func TestEstimatorWithoutBaselineEasesOverTime(t *testing.T) {
	e := estimator{}
	early := e.installing(-1, 0, 1)
	late := e.installing(-1, 0, 120)
	if !(early > closingPercent && early < late && late <= finishingPercent) {
		t.Fatalf("early %.2f, late %.2f", early, late)
	}
}

func TestFindStagingDir(t *testing.T) {
	temp := t.TempDir()
	since := time.Now().Add(-time.Minute)
	if got := findStagingDir(temp, since); got != "" {
		t.Fatalf("found %q in an empty folder", got)
	}
	// An older installer's leftovers do not count.
	old := filepath.Join(temp, "nsOLD.tmp", "7z-out")
	must(t, os.MkdirAll(old, 0o755))
	stale := time.Now().Add(-time.Hour)
	must(t, os.Chtimes(filepath.Dir(old), stale, stale))
	if got := findStagingDir(temp, since); got != "" {
		t.Fatalf("found the stale %q", got)
	}
	current := filepath.Join(temp, "nsA1B2.tmp", "7z-out")
	must(t, os.MkdirAll(current, 0o755))
	if got := findStagingDir(temp, since); got != current {
		t.Fatalf("got %q, want %q", got, current)
	}
}

func TestDirSize(t *testing.T) {
	root := t.TempDir()
	must(t, os.MkdirAll(filepath.Join(root, "resources"), 0o755))
	must(t, os.WriteFile(filepath.Join(root, "a.bin"), make([]byte, 300), 0o644))
	must(t, os.WriteFile(filepath.Join(root, "resources", "b.bin"), make([]byte, 700), 0o644))
	if got := dirSize(root); got != 1000 {
		t.Fatalf("got %d, want 1000", got)
	}
	if got := dirSize(filepath.Join(root, "missing")); got != 0 {
		t.Fatalf("missing folder: got %d", got)
	}
}

func TestParseOptions(t *testing.T) {
	o, err := parseOptions([]string{
		"--parent-pid=42", `--app=C:\Apps\Connect\Connect.exe`,
		`--installer=C:\Temp\Connect-Setup-0.3.2.exe`, "--version=0.3.2",
		"--center=-1200,540", "--release-url=https://github.com/nightdevx/connect-desktop/releases",
	})
	must(t, err)
	if o.parentPID != 42 || o.version != "0.3.2" || o.center == nil || *o.center != (point{-1200, 540}) {
		t.Fatalf("parsed %+v", o)
	}

	if _, err := parseOptions([]string{"--demo=ok"}); err != nil {
		t.Fatalf("demo needs nothing else: %v", err)
	}
	bad := [][]string{
		{`--app=C:\Connect.exe`},
		{"--parent-pid=1", "--app=Connect.exe"},
		{"--parent-pid=1", `--app=C:\Connect.exe`, "--center=1"},
		{"--parent-pid=1", `--app=C:\Connect.exe`, "--release-url=file:///C:/x"},
		{"--demo=maybe"},
	}
	for _, args := range bad {
		if _, err := parseOptions(args); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
