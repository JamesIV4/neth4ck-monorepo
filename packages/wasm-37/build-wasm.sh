#!/bin/bash
# Build NetHack 3.7 for WebAssembly (WASM) using Emscripten.
#
# This keeps the 3.7 CROSS_TO_WASM flow, but mirrors the 3.6.7 staged build:
#   Phase 1: native utilities + generated data/tile.c
#   Phase 2: explicit wasm data directory population
#   Phase 3: wasm build

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NH="$SCRIPT_DIR/NetHack"

# Check for emscripten
if ! command -v emcc &>/dev/null; then
    echo "Error: emcc not found. Please install and activate the Emscripten SDK."
    echo "  https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

# Check for submodule
if [ ! -f "$NH/sys/unix/setup.sh" ]; then
    echo "Error: NetHack submodule not initialized."
    echo "  Run: git submodule update --init packages/wasm-37/NetHack"
    exit 1
fi

echo "=== NetHack 3.7 WASM Build ==="
echo "Source: $NH"
echo ""

# ------------------------------------------------------------------
# Setup: Generate Makefiles from hints
# ------------------------------------------------------------------
echo "--- Setup: Generating Makefiles ---"
cd "$NH"
cd sys/unix && ./setup.sh hints/linux.370 && cd ../..
echo "  done."

# ------------------------------------------------------------------
# Fetch Lua dependency (required for NetHack 3.7)
# ------------------------------------------------------------------
echo ""
echo "--- Fetching Lua ---"
make fetch-lua
echo "  done."

# ------------------------------------------------------------------
# Phase 1: Build native utilities and generate data files.
# ------------------------------------------------------------------
echo ""
echo "--- Phase 1: Building native utilities and data ---"
NATIVE_OVERRIDES="CC=cc LINK=cc LFLAGS="

echo "  Cleaning stale object files..."
rm -f "$NH/src/"*.o "$NH/util/"*.o "$NH/src/Sysunix" "$NH/src/nethack" 2>/dev/null || true

echo "  Building utilities..."
# NetHack 3.7 removed lev_comp and dgn_comp as standalone utility targets.
make -C util $NATIVE_OVERRIDES makedefs dlb tilemap

echo "  Generating tile.c..."
make -C util $NATIVE_OVERRIDES ../src/tile.c
if [ ! -f "$NH/src/tile.c" ]; then
    echo "Error: src/tile.c was not generated."
    exit 1
fi

echo "  Generating data files..."
make -C dat $NATIVE_OVERRIDES

echo "  Building DLB archive..."
make dlb $NATIVE_OVERRIDES

echo "  Native generation complete."

# ------------------------------------------------------------------
# Phase 2: Prepare WASM data directory
# ------------------------------------------------------------------
echo ""
echo "--- Phase 2: Preparing WASM data directory ---"

WASM_DATA="$NH/targets/wasm/wasm-data"
rm -rf "$WASM_DATA"
mkdir -p "$WASM_DATA"

if [ -f "$NH/dat/nhdat" ]; then
    cp "$NH/dat/nhdat" "$WASM_DATA/nhdat"
    echo "  nhdat: $(wc -c < "$WASM_DATA/nhdat") bytes"
else
    echo "Error: nhdat not found in dat/. DLB build may have failed."
    exit 1
fi

cp "$NH/sys/libnh/sysconf" "$WASM_DATA/sysconf"
touch "$WASM_DATA/perm"
touch "$WASM_DATA/record"
touch "$WASM_DATA/logfile"
touch "$WASM_DATA/xlogfile"

echo "  WASM data directory ready: $WASM_DATA"

# ------------------------------------------------------------------
# Phase 3: Build the WASM game
# ------------------------------------------------------------------
echo ""
echo "--- Phase 3: Building WASM ---"
make CROSS_TO_WASM=1 all

echo ""
echo "=== Build complete ==="

# Copy output to package build/ directory
if [ -f "$NH/targets/wasm/nethack.js" ] && [ -f "$NH/targets/wasm/nethack.wasm" ]; then
    mkdir -p "$SCRIPT_DIR/build"
    cp "$NH/targets/wasm/nethack.js" "$SCRIPT_DIR/build/nethack.js"
    cp "$NH/targets/wasm/nethack.wasm" "$SCRIPT_DIR/build/nethack.wasm"
    echo "Output copied to $SCRIPT_DIR/build/"
    ls -lh "$SCRIPT_DIR/build/nethack.js" "$SCRIPT_DIR/build/nethack.wasm"
else
    echo "Error: Expected output files not found in $NH/targets/wasm/"
    ls -lh "$NH/targets/wasm/"*.js "$NH/targets/wasm/"*.wasm 2>/dev/null || true
    exit 1
fi
