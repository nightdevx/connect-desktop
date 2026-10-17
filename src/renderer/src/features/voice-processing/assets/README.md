# Voice processing models

## rnnoise.wasm

RNNoise 0.2 (Xiph, BSD-3-Clause, licence in `RNNOISE-COPYING.txt`), compiled as a bare WASI reactor with no imports. `voice-worklet.js` instantiates it.

The build:
- Source: `rnnoise-0.2.tar.gz` from <https://github.com/xiph/rnnoise/releases/tag/v0.2>, sha256 `90fce4b00b9ff24c08dbfe31b82ffd43bae383d85c5535676d28b0a2b11c0d37`. The model weights (`src/rnnoise_data.c`) ship in that tarball.
- Compiler: wasi-sdk 34 (`wasi-sdk-34.0-x86_64-windows.tar.gz`, sha256 `cccb5c323a9b34f0349a9b09e8804a0a7632c68c3310f4b5f437ed57d7e71d8f`).
- Output sha256: `c9341fefc4e79a38ed2801a4447bb0c1d25cdf2402934a3e14da0f0a51a05f90`.

The release tarball's generic (non-x86) `vec.h` path includes Opus's `os_support.h`, which the tarball does not ship. Upstream later replaced the macro with `RNN_CLEAR`. The build does the same through a one-line shim directory, `shim/os_support.h`:

```c
#include "common.h"
#define OPUS_CLEAR(dst, n) RNN_CLEAR(dst, n)
```

The command, run from the unpacked `rnnoise-0.2/`:

```sh
clang --target=wasm32-wasip1 --sysroot=$WASI_SDK/share/wasi-sysroot \
  -O3 -msimd128 -mexec-model=reactor -DNDEBUG -I../shim -Iinclude -Isrc \
  src/denoise.c src/rnn.c src/pitch.c src/kiss_fft.c src/celt_lpc.c src/nnet.c \
  src/nnet_default.c src/parse_lpcnet_weights.c src/rnnoise_data.c src/rnnoise_tables.c \
  -Wl,-z,stack-size=1048576 \
  -Wl,--export=rnnoise_create -Wl,--export=rnnoise_destroy \
  -Wl,--export=rnnoise_process_frame -Wl,--export=rnnoise_get_frame_size \
  -Wl,--export=malloc -Wl,--export=free -Wl,--strip-all -o rnnoise.wasm
```

Notes on the flags:
- `stack-size`: RNNoise 0.2 keeps large arrays on the stack. With wasm-ld's default 64 KB stack, the first `rnnoise_process_frame` fails with "memory access out of bounds".
- `reactor`: there is no `main`. The worklet calls `_initialize` once, then the exports.

On the noise test bench, this build's output was identical to `@timephy/rnnoise-wasm` 1.0.0 (an Emscripten build of the same release) on all 128 clips. `scripts/check-voice-worklet.cjs` runs it in Node.
