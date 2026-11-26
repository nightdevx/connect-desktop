#!/usr/bin/env node
// Acceptance check: the playback bus wakes itself up.
//
// Remote voices play through one WebAudio context (remote-media-handler.ts).
// Chromium can stop that context under a running call: Windows switches the
// default device, a Bluetooth headset reconnects, the machine wakes from
// sleep, another app takes exclusive mode. The context then reports
// "suspended" (or "interrupted") and everyone goes silent for this user,
// while their own microphone keeps working, so nobody notices why.
// Before this check the bus only resumed when a NEW track was attached.
//
//   WAKE     a context that stops on its own is resumed at once.
//   RETRY    a resume that does not take is retried, and after 3 tries the
//            output device is reopened (the path the "error" event uses).
//   QUIET    a closed context (dispose) is left alone; nothing loops.
//   ONCE     one stall makes one recovery, not one per event.
//
// remote-media-handler.ts is bundled with livekit-client and the debug log
// replaced by stubs, and run against a fake AudioContext.
//   node scripts/check-playback-wake.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");
const entry = path.join(projectRoot, "src/renderer/src/features/livekit/services/stream/remote-media-handler.ts");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- a fake AudioContext that can be told to stall ---------------------------
const contexts = [];
const debugEvents = [];
class FakeNode {
  constructor() { this.gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }; }
  connect() {}
  disconnect() {}
}
class FakeCompressor extends FakeNode {
  constructor() {
    super();
    for (const k of ["threshold", "knee", "ratio", "attack", "release"]) this[k] = { value: 0 };
  }
}
class FakeAudioContext {
  constructor(options) {
    this.options = options;
    this.state = "running";
    this.sampleRate = options?.sampleRate ?? 48000;
    this.currentTime = 0;
    this.destination = new FakeNode();
    this.listeners = {};
    this.onstatechange = null;
    this.resumeCalls = 0;
    this.sinkCalls = [];
    this.resumeWorks = true; // set false to make resume() leave it suspended
    contexts.push(this);
  }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); }
  dispatch(type) {
    const event = { type, target: this };
    for (const fn of this.listeners[type] ?? []) fn(event);
    if (type === "statechange" && typeof this.onstatechange === "function") this.onstatechange(event);
  }
  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.dispatch("statechange");
  }
  createGain() { return new FakeNode(); }
  createDynamicsCompressor() { return new FakeCompressor(); }
  async resume() {
    this.resumeCalls += 1;
    if (this.state === "closed") throw new Error("InvalidStateError: closed");
    if (this.resumeWorks) this.setState("running");
  }
  async suspend() { this.setState("suspended"); }
  async close() { this.setState("closed"); }
  async setSinkId(id) { this.sinkCalls.push(id); }
}

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ style: {}, play: async () => {}, setSinkId: async () => {} }), body: { appendChild() {} } };
globalThis.AudioContext = FakeAudioContext;

const main = async () => {
  const { build } = await import("vite");
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-playback-wake-"));
  const stubs = path.join(outDir, "stubs");
  fs.mkdirSync(stubs);
  fs.writeFileSync(path.join(stubs, "livekit-client.mjs"),
    "export const Track = { Kind: { Audio: 'audio', Video: 'video' }, Source: { Microphone: 'microphone', ScreenShare: 'screen_share', ScreenShareAudio: 'screen_share_audio', Camera: 'camera' } };\n" +
    "export class Participant {}\nexport class Room {}\nexport class RemoteTrackPublication {}\nexport class RemoteTrack {}\nexport class RemoteParticipant {}\n" +
    "export const RoomEvent = {}; export const ConnectionState = {};\n");
  fs.writeFileSync(path.join(stubs, "debug-log.mjs"),
    "export const logLiveKitDebug = (scope, name, data) => { globalThis.__debug?.push({ scope, name, data }); };\nexport const logDebug = () => {};\n");
  globalThis.__debug = debugEvents;

  await build({
    root: projectRoot,
    logLevel: "error",
    configFile: false,
    resolve: {
      alias: [
        { find: /^livekit-client$/, replacement: path.join(stubs, "livekit-client.mjs") },
        { find: /^@\/services\/debug-log$/, replacement: path.join(stubs, "debug-log.mjs") },
        { find: /^@shared\//, replacement: `${path.join(projectRoot, "src/shared")}/` },
        { find: /^@\//, replacement: `${path.join(projectRoot, "src/renderer/src")}/` },
      ],
    },
    build: {
      outDir,
      emptyOutDir: false,
      ssr: true,
      lib: { entry, formats: ["es"], fileName: () => "remote-media-handler.mjs" },
      rollupOptions: { external: ["electron"] },
    },
  });
  const built = fs.readdirSync(outDir).find((f) => f.endsWith(".mjs"));
  const { RemoteMediaHandler } = await import(pathToFileURL(path.join(outDir, built)).href);
  assert.ok(RemoteMediaHandler, "remote-media-handler.ts no longer exports RemoteMediaHandler");

  const newBus = async (deviceId = "dev-1") => {
    const handler = new RemoteMediaHandler({ remoteParticipants: new Map() }, () => false);
    await handler.setAudioOutputDevice(deviceId);
    const bus = handler["ensureBus"]();
    assert.ok(bus, "the bus must be created");
    await sleep(20);
    const context = contexts[contexts.length - 1];
    context.sinkCalls.length = 0;
    return { handler, context };
  };

  // --- WAKE: the context stops on its own, nothing else happens ----------------
  {
    const { handler, context } = await newBus();
    const before = context.resumeCalls;
    context.setState("suspended");
    await sleep(1000);
    assert.ok(context.resumeCalls > before, "WAKE: a context that stopped on its own was never resumed");
    assert.equal(context.state, "running", "WAKE: the context must be running again within 1 s");
    assert.deepEqual(context.sinkCalls, [], "a resume that worked must not reopen the device");
    handler.dispose();
  }

  // --- WAKE: Chromium's "interrupted" state (newer builds) is handled the same --
  {
    const { handler, context } = await newBus();
    context.setState("interrupted");
    await sleep(1000);
    assert.equal(context.state, "running", "WAKE: an interrupted context must be resumed too");
    handler.dispose();
  }

  // --- ONCE: many stalls in a row, each answered, no pile-up ---------------------
  {
    const { handler, context } = await newBus();
    for (let i = 0; i < 5; i += 1) {
      context.setState("suspended");
      await sleep(50);
    }
    await sleep(500);
    assert.equal(context.state, "running");
    assert.ok(context.resumeCalls <= 12, `ONCE: ${context.resumeCalls} resume calls for 5 stalls`);
    handler.dispose();
  }

  // --- RETRY: resume does not take, then the device is reopened -----------------
  {
    const { handler, context } = await newBus("headset-7");
    context.resumeWorks = false;
    const before = context.resumeCalls;
    context.setState("suspended");
    await sleep(6000);
    const tries = context.resumeCalls - before;
    assert.ok(tries >= 3, `RETRY: a resume that did not take was tried ${tries} time(s), want at least 3`);
    assert.ok(tries <= 10, `RETRY: ${tries} resume calls in 6 s: it must not spin`);
    const none = context.sinkCalls.findIndex((id) => typeof id === "object" && id?.type === "none");
    assert.ok(none >= 0, "RETRY: after 3 failed resumes the output device must be reopened (parked on none first)");
    assert.equal(context.sinkCalls[none + 1], "headset-7", "RETRY: and then pointed back at the chosen device");
    assert.ok(
      debugEvents.some((e) => e.scope === "remote-media" && /wake|resume|suspend/i.test(e.name)),
      "the diagnostics must record that playback had stopped and was woken",
    );
    // Once the device is back the context runs again and the retries stop.
    context.resumeWorks = true;
    await sleep(2500);
    const settled = context.resumeCalls;
    await sleep(2500);
    assert.equal(context.resumeCalls, settled, "RETRY: retries must stop once the context runs");
    assert.equal(context.state, "running");
    handler.dispose();
  }

  // --- QUIET: dispose closes the context; nothing tries to bring it back --------
  {
    const { handler, context } = await newBus();
    handler.dispose();
    await sleep(50);
    const calls = context.resumeCalls;
    const sinks = context.sinkCalls.length;
    context.setState("suspended");
    await sleep(1500);
    assert.equal(context.resumeCalls, calls, "QUIET: a disposed bus must not resume its old context");
    assert.equal(context.sinkCalls.length, sinks, "QUIET: a disposed bus must not reopen a device");
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("playback-wake check passed (a stopped or interrupted bus resumes within 1 s; failed resumes retried 3 times, then the device is reopened; disposed buses are left alone)");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
