#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const read = (relative) =>
  fs.readFileSync(path.join(projectRoot, relative), "utf8");

const streamManager = read(
  "src/renderer/src/features/livekit/services/stream/stream-manager.ts",
);
const lobbyRoom = read(
  "src/renderer/src/features/workspace/hooks/lobby/use-lobby-room.ts",
);
const screenShare = read(
  "src/renderer/src/features/workspace/hooks/media/use-screen-share-controls.ts",
);

const bodyOf = (source, signature) => {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} bulunamadi`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`${signature} govdesi kapanmadi`);
};

const recoverySetter = bodyOf(
  streamManager,
  "public setEncoderRecoveryHandler(",
);
assert.ok(
  !/healthyTicks/.test(recoverySetter),
  "setEncoderRecoveryHandler healthyTicks'i sifirlamamali: handler her render'da yeniden kaydediliyor, sayaci sifirlamak QUALITY_RECOVERY_TICKS'e ulasilmasini imkansiz kiliyor ve dusen yayin kalitesi bir daha yukselmiyor",
);

const overloadSetter = bodyOf(
  streamManager,
  "public setEncoderOverloadHandler(",
);
assert.ok(
  !/healthyTicks|limitedTicks/.test(overloadSetter),
  "setEncoderOverloadHandler sayac sifirlamamali: kayit, encoder sagligindan bagimsiz",
);

const overloadReset = bodyOf(streamManager, "public resetEncoderOverloadNotice(");
assert.ok(
  /this\.healthyTicks = 0/.test(overloadReset),
  "resetEncoderOverloadNotice healthyTicks'i sifirlamali: yeniden yayimlanan track'in saglik gecmisi sifirdan baslar",
);

const evaluate = bodyOf(
  streamManager,
  "private evaluateQualityLimitation(",
);
assert.ok(
  /this\.healthyTicks \+= 1/.test(evaluate) &&
    /this\.healthyTicks = 0/.test(evaluate),
  "evaluateQualityLimitation healthyTicks'i hem artirmali hem kisitli ornekte sifirlamali",
);

assert.ok(
  /const patchLobbyMemberState = useCallback\(/.test(lobbyRoom),
  "patchLobbyMemberState useCallback ile sabitlenmeli: her render'da yeni kimlik almasi, ona bagli tum medya callback'lerini ve onlari kaydeden effect'i her render'da yeniden calistiriyor",
);

const recoveryRegistration = screenShare.indexOf("setEncoderRecoveryHandler(() =>");
assert.notEqual(
  recoveryRegistration,
  -1,
  "recovery handler kaydi use-screen-share-controls.ts icinde bulunamadi",
);
assert.ok(
  /qualityCeilingRef\.current = quality;/.test(screenShare),
  "tavani yalnizca kullanicinin acik secimi tasimali",
);
assert.ok(
  !/qualityCeilingRef\.current = quality;[\s\S]{0,400}?applyLiveScreenShareChange\(\{ quality: lower \}\)/.test(
    screenShare,
  ),
  "otomatik dusurme tavani indirmemeli, yoksa yayin kaybettigi kaliteyi geri alamaz",
);

console.log("check-encoder-recovery: ok");
