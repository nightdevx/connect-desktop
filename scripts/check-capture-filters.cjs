#!/usr/bin/env node
// Self-check for resolveCaptureFilters in
// src/renderer/src/features/rnnoise/capture-filters.ts.
//
// This decides which noise suppressor runs on the microphone, and the failure it
// guards is the one that produced "when I first join a lobby everyone's voice
// sounds like it has an effect on it".
//
// The decision used to be made twice from two different questions: the capture
// constraints from "does a processor object exist", and the graph from "is
// suppression enabled and can WASM compile". Both ways of disagreeing are
// audible and neither throws — a microphone with NO denoiser sounds raw and
// ungated, and one with TWO in series pumps. So the invariant is exactly one,
// and it is asserted over the whole input matrix rather than case by case.
//
// The module imports nothing but a type, so it bundles with no DOM, no worklet
// and no WASM. Output goes under node_modules/.cache for the same reason
// check-publish-plan.cjs does: bare specifiers cannot resolve from a system temp
// directory.
//
//   node scripts/check-capture-filters.cjs

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const projectRoot = path.join(__dirname, "..");

// Every preset the settings screen can produce. Read from the source rather than
// hardcoded, so a new preset is covered the day it is added.
const readPresets = () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "src/renderer/src/features/rnnoise/types.ts"),
    "utf8",
  );
  const match = source.match(
    /export type NoiseSuppressionPreset\s*=\s*([^;]+);/,
  );
  assert.ok(match, "could not find the NoiseSuppressionPreset union in types.ts");
  const presets = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(presets.length > 0, "NoiseSuppressionPreset has no members");
  return presets;
};

const main = async () => {
  const { build } = await import("vite");

  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(cacheRoot, "ct-capture-filters-"));

  await build({
    root: projectRoot,
    logLevel: "error",
    // Not vite.config.ts: it carries the Sentry plugin, which would upload a
    // source map for this throwaway bundle on every check run.
    configFile: false,
    build: {
      outDir,
      emptyOutDir: true,
      ssr: true,
      lib: {
        entry: path.join(
          projectRoot,
          "src/renderer/src/features/rnnoise/capture-filters.ts",
        ),
        formats: ["es"],
        fileName: () => "capture-filters.mjs",
      },
      rollupOptions: { external: ["electron"] },
    },
  });

  const bundle = path.join(outDir, "capture-filters.mjs");
  const { resolveCaptureFilters } = await import(pathToFileURL(bundle).href);

  const presets = readPresets();
  let cases = 0;

  for (const wantsEnhanced of [true, false]) {
    for (const rnnoiseReady of [true, false]) {
      for (const preset of presets) {
        const label = `wants=${wantsEnhanced} ready=${rnnoiseReady} preset=${preset}`;
        const decision = resolveCaptureFilters(
          wantsEnhanced,
          rnnoiseReady,
          preset,
        );
        cases++;

        // --- the invariant ---------------------------------------------------
        assert.notEqual(
          decision.browserNoiseSuppression,
          decision.rnnoise,
          `${label}: exactly one denoiser must be active, got browser=${decision.browserNoiseSuppression} rnnoise=${decision.rnnoise}`,
        );

        // --- RNNoise is never claimed when it is not loaded -------------------
        // This is the first-join case: the worklets and the WASM are still
        // loading, so the browser's suppressor is all there is and it has to
        // stay on.
        if (!rnnoiseReady) {
          assert.equal(
            decision.rnnoise,
            false,
            `${label}: RNNoise must not be used before it is loaded`,
          );
          assert.equal(
            decision.browserNoiseSuppression,
            true,
            `${label}: the browser suppressor is the only one left`,
          );
        }

        // --- the user's setting is honoured ----------------------------------
        if (!wantsEnhanced) {
          assert.equal(
            decision.rnnoise,
            false,
            `${label}: RNNoise must not run when it was not asked for`,
          );
        }

        // --- gain control is never left to nobody ----------------------------
        // Browser AGC is only switched off when RNNoise's own gate takes over
        // the level; off with nothing replacing it is a microphone at raw
        // hardware level, which is half of what the room heard.
        if (!decision.browserAutoGainControl) {
          assert.equal(
            decision.rnnoise,
            true,
            `${label}: browser AGC was switched off with no RNNoise to replace it`,
          );
        }
      }
    }
  }

  // --- the presets really do differ ----------------------------------------
  // Without this the whole matrix above would still pass if every preset
  // collapsed to the same answer, which would silently drop "natural"'s gentler
  // level handling.
  if (presets.includes("natural")) {
    const natural = resolveCaptureFilters(true, true, "natural");
    assert.equal(
      natural.browserAutoGainControl,
      true,
      "the natural preset keeps the browser's gain control",
    );
    const stronger = presets.find((preset) => preset !== "natural");
    if (stronger) {
      assert.equal(
        resolveCaptureFilters(true, true, stronger).browserAutoGainControl,
        false,
        `the ${stronger} preset leaves gain to RNNoise's gate`,
      );
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(
    `capture-filters self-check passed (${cases} combinations, ${presets.length} presets)`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
