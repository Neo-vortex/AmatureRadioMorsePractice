#!/usr/bin/env bash
# Builds ggmorse + wrapper.cpp into a single-file ES module (WASM embedded) for the decoder
# worker and Node tests. Needs Docker; the output is committed, so only run after changes.
set -euo pipefail
cd "$(dirname "$0")/../.."
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD":/src -w /src emscripten/emsdk:4.0.15 \
  em++ -O3 -std=c++17 \
  -Ivendor/ggmorse/include -Ivendor/ggmorse/src \
  wasm/ggmorse/wrapper.cpp vendor/ggmorse/src/ggmorse.cpp vendor/ggmorse/src/resampler.cpp \
  -sMODULARIZE -sEXPORT_ES6 -sSINGLE_FILE -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH -sFILESYSTEM=0 \
  -sEXPORTED_FUNCTIONS=_gm_create,_gm_input,_gm_push,_gm_take_text,_gm_pitch,_gm_wpm,_gm_destroy \
  -sEXPORTED_RUNTIME_METHODS=HEAPF32,UTF8ToString \
  -o src/decoder/ggmorse/ggmorse.mjs
