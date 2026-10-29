#!/usr/bin/env node
// Self-check for the stage fit in
// src/renderer/src/features/workspace/components/lobby/lobby-stage-layout.ts.
//
// The fit fills a row exactly, so it is only as good as the size it was fitted
// to. A shrink the resize threshold swallowed left three tiles fitted to a
// 1089px stage that was really 1086px: two no longer fit in a row, they wrapped
// into one column, and the column overflowed under the room header. The
// sequence below is the one the ResizeObserver reported in that room while the
// grid's column transition ran.
//
// The hook itself is run too, against a stand-in for React and the three
// browser APIs it touches, because the size it fits to is only right if it is
// watching the box that is actually on screen:
//
//   REMOUNT     a text room unmounts the stage; coming back mounts a new box,
//               and the fit follows that box, not the one that was removed.
//   LATE MOUNT  a stage that appears after the hook first ran (a 1:1 call
//               starting in an open conversation) is measured as it mounts.
//   LATEST      two sizes reported before the next frame: the second wins.
//
//   node scripts/check-stage-resize.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

// Just enough of React to run one hook: state, refs, memos and effects, with a
// render loop that repeats until no state changed. Effects run after every
// render whose dependencies changed, cleanups first, as React does.
const FAKE_REACT = `
// On globalThis: the bundle inlines its own copy of this file, and the check
// drives the copy it imports, so the two have to share one state.
const state = (globalThis.__fakeReact ??= { slots: [], index: 0, effects: [], dirty: false });
const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
export function useState(initial) {
  const i = state.index++;
  if (!(i in state.slots)) {
    const slot = { value: typeof initial === "function" ? initial() : initial };
    slot.set = (next) => {
      const value = typeof next === "function" ? next(slot.value) : next;
      if (!Object.is(value, slot.value)) { slot.value = value; state.dirty = true; }
    };
    state.slots[i] = slot;
  }
  return [state.slots[i].value, state.slots[i].set];
}
export function useRef(initial) {
  const i = state.index++;
  if (!(i in state.slots)) state.slots[i] = { current: initial };
  return state.slots[i];
}
export function useMemo(compute, deps) {
  const i = state.index++;
  const slot = state.slots[i];
  if (!slot || changed(slot.deps, deps)) state.slots[i] = { value: compute(), deps };
  return state.slots[i].value;
}
export function useCallback(fn, deps) { return useMemo(() => fn, deps); }
export function useEffect(effect, deps) {
  const i = state.index++;
  const slot = state.slots[i] ?? (state.slots[i] = { deps: null, cleanup: null });
  if (slot.deps === null || changed(slot.deps, deps)) state.effects.push({ slot, effect, deps });
}
export function __render(hook) {
  let result;
  for (let pass = 0; pass < 20; pass += 1) {
    state.index = 0;
    state.dirty = false;
    result = hook();
    const effects = state.effects.splice(0);
    for (const { slot } of effects) { slot.cleanup?.(); slot.cleanup = null; }
    for (const { slot, effect, deps } of effects) { slot.cleanup = effect() ?? null; slot.deps = deps; }
    if (!state.dirty) return result;
  }
  throw new Error("the hook never settled");
}
export function __reset() { state.slots = []; state.effects = []; state.index = 0; }
`;

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-stage-resize-"));
  const fakeReact = path.join(outDir, "fake-react.mjs");
  fs.writeFileSync(fakeReact, FAKE_REACT);

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    resolve: { alias: { react: fakeReact } },
    build: {
      outDir: path.join(outDir, "out"),
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/workspace/components/lobby/lobby-stage-layout.ts",
        ),
        formats: ["es"],
        fileName: () => "lobby-stage-layout.mjs",
      },
    },
  });

  // The browser side: a ResizeObserver the test reports sizes through, a frame
  // queue the test runs, and boxes whose padding getComputedStyle reads.
  const observers = new Set();
  let frames = [];
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      observers.add(this);
    }
    observe(target) {
      this.targets.add(target);
    }
    disconnect() {
      this.targets.clear();
      observers.delete(this);
    }
  };
  globalThis.window = {
    getComputedStyle: (box) => ({
      paddingLeft: `${box.pad}px`,
      paddingRight: `${box.pad}px`,
      paddingTop: `${box.pad}px`,
      paddingBottom: `${box.pad}px`,
    }),
    requestAnimationFrame: (callback) => frames.push(callback),
    cancelAnimationFrame: (id) => {
      frames[id - 1] = null;
    },
  };
  // A box whose content area is width x height, inside 18px of padding.
  const box = (width, height) => ({ pad: 18, clientWidth: width + 36, clientHeight: height + 36 });
  const report = (target, width, height) => {
    for (const observer of observers) {
      if (observer.targets.has(target)) {
        observer.callback([{ target, contentRect: { width, height } }]);
      }
    }
  };
  const runFrame = () => {
    const due = frames;
    frames = [];
    for (const callback of due) callback?.();
  };

  const layout = await import(
    pathToFileURL(path.join(outDir, "out", "lobby-stage-layout.mjs")).href
  );
  const { __render, __reset } = await import(pathToFileURL(fakeReact).href);
  const { nextStageSize, resolveGridFit, useLobbyStageLayout } = layout;

  const HEIGHT = 846;
  const GAP = 12;

  // --- a transition that ends in small steps lands on the final size --------
  let size = nextStageSize({ width: 0, height: 0 }, { width: 1160, height: HEIGHT }, true);
  for (const width of [1125, 1106, 1097, 1092, 1089, 1087, 1086]) {
    size = nextStageSize(size, { width, height: HEIGHT }, false);
  }
  assert.equal(size.width, 1086, "every shrink is applied, however small");

  // --- the fit for that room keeps two tiles on a row -------------------------
  const fit = resolveGridFit(3, size, true, GAP);
  assert.equal(fit.columns, 2);
  assert.ok(
    fit.columns * fit.tileWidth + (fit.columns - 1) * GAP <= size.width,
    `a row of ${fit.columns} x ${fit.tileWidth}px must fit in ${size.width}px`,
  );
  const rows = Math.ceil(3 / fit.columns);
  assert.ok(
    rows * (fit.tileWidth / (16 / 9)) + (rows - 1) * GAP <= size.height,
    "the rows must fit the height",
  );

  // --- growth still waits for the threshold ------------------------------------
  assert.equal(
    nextStageSize(size, { width: 1090, height: HEIGHT }, false),
    size,
    "a few pixels of growth does not reflow the tiles",
  );
  assert.equal(nextStageSize(size, { width: 1100, height: HEIGHT }, false).width, 1100);

  // --- a shrink in either axis counts ------------------------------------------
  assert.equal(nextStageSize(size, { width: 1088, height: HEIGHT - 2 }, false).height, HEIGHT - 2);

  // --- an identical size is the same object (no re-render) ----------------------
  assert.equal(nextStageSize(size, { width: 1086, height: HEIGHT }, false), size);

  // --- the hook: what it fits is the box on screen -------------------------------
  // Four people with the chat open, the room the owner reported.
  const PEOPLE = 4;
  const fitted = (style) => ({
    columns: Number(style["--ct-stage-columns"]),
    tileWidth: parseFloat(style["--ct-stage-tile-width"]),
  });
  const expectFit = (width, height, message) => {
    const want = resolveGridFit(PEOPLE, { width, height }, true, GAP);
    assert.deepEqual(fitted(current.stageLayoutStyle), want, `${message}: fitted to ${width}x${height}`);
  };

  // `mounted` is the box React would have on screen. Refs are attached in the
  // commit, before that commit's effects, so the stand-in attaches it inside
  // the render pass; a callback ref is only called when the box changes. Either
  // shape of ref works, so the check reads the same against both.
  let current;
  let mounted = null;
  let attachedTo = null;
  const render = () => {
    current = __render(() => {
      const result = useLobbyStageLayout(PEOPLE, true);
      const ref = result.stageAreaRef;
      if (typeof ref === "function") {
        if (attachedTo !== mounted) {
          attachedTo = mounted;
          ref(mounted);
        }
      } else {
        ref.current = mounted;
      }
      return result;
    });
  };
  const frame = () => {
    runFrame();
    render();
  };
  const start = (stage) => {
    __reset();
    observers.clear();
    frames = [];
    mounted = stage;
    attachedTo = null;
    render();
  };

  const cases = {
    // The room at 1040x560; a text room unmounts the stage; back on a window
    // that is now 520x430.
    REMOUNT: () => {
      const firstStage = box(1040, 560);
      start(firstStage);
      expectFit(1040, 560, "the first stage");
      mounted = null;
      render();
      report(firstStage, 0, 0); // what an observer says about a removed box
      frame();
      const returnedStage = box(520, 430);
      mounted = returnedStage;
      render();
      frame();
      expectFit(520, 430, "back from a text room");
      report(returnedStage, 500, 430);
      frame();
      expectFit(500, 430, "a resize after coming back");
    },
    // No stage at first (an open conversation), then a call starts.
    "LATE MOUNT": () => {
      start(null);
      mounted = box(610, 470);
      render();
      frame();
      expectFit(610, 470, "a stage mounted after the hook ran");
    },
    // The window resized and the room grid's column moved before one frame.
    LATEST: () => {
      const stage = box(610, 470);
      start(stage);
      report(stage, 592, 470);
      report(stage, 578, 470);
      frame();
      expectFit(578, 470, "the last size before the frame");
    },
  };
  const failures = [];
  for (const [name, run] of Object.entries(cases)) {
    try {
      run();
    } catch (error) {
      failures.push(`${name}: ${error.message.split("\n")[0]} (got ${JSON.stringify(error.actual)}, want ${JSON.stringify(error.expected)})`);
    }
  }
  assert.deepEqual(failures, [], "the hook must fit the box that is on screen");

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    "stage-resize self-check passed (shrinks always land, growth waits, fit holds, the box on screen is the one measured)",
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
