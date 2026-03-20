# nhlib Library Refactor -- Design Document

## Background

The original nhlib port (see `~/Projects/nethack-wasm/*.md` for history) included a C library
build. The current monorepo has two WASM implementations:

- **wasm-37** (NetHack 3.7) -- `packages/wasm-37/`
- **wasm-367** (NetHack 3.6.7) -- `packages/wasm-367/`

Both include the `sys/libnh/` directory with the library entry point, but the library story is
incomplete. This document captures the current state, desired library targets, API improvements,
and packaging options.

---

## Current State

### wasm-37 (NetHack 3.7)

**Static library (.a) -- already builds** via `WANT_LIBNH=1` in `src/Makefile`.

Build rule (src/Makefile ~line 3091):

```makefile
$(TARGETPFX)libnh.a: $(HOBJ) $(LIBNHSYSOBJ) ../lib/lua/liblua-$(LUA_VERSION).a
    $(AR) rcs $@ $(HOBJ) $(LIBNHSYSOBJ) ../lib/lua/liblua-$(LUA_VERSION).a
```

When `WANT_LIBNH=1` is set (src/Makefile ~line 1022-1036):

```makefile
CFLAGS += -DSHIM_GRAPHICS -DNOTTYGRAPHICS -DNOSHELL -DLIBNH -fpic
```

Objects included:

- `$(HOBJ)` -- all core NetHack game objects (200+ .o files)
- `$(LIBNHSYSOBJ)` -- libnhmain.o, ioctl.o, unixtty.o, unixunix.o, unixres.o, winshim.o, date.o
- Lua library: `../lib/lua/liblua-$(LUA_VERSION).a`

**WASM build** via `CROSS_TO_WASM=1`. Outputs `targets/wasm/nethack.{js,wasm}`.

WASM explicitly exports 6 functions (src/Makefile ~line 1404):

```
["_main", "_shim_graphics_set_callback", "_repopulate_perminvent", "_malloc", "_free", "_map_glyphinfo"]
```

WASM build flags (src/Makefile ~lines 1384-1475):

```makefile
WASM_CFLAGS += -DDEFAULT_WINDOW_SYS="shim"
WASM_CFLAGS += -DNOTTYGRAPHICS -DSHIM_GRAPHICS -DLIBNH
WASM_CFLAGS += -DCROSSCOMPILE -DCROSS_TO_WASM
EMCC_LFLAGS += -s ASYNCIFY -s ASYNCIFY_IMPORTS='["local_callback"]'
EMCC_LFLAGS += -s MODULARIZE -s EXPORT_ES6=1
```

### wasm-367 (NetHack 3.6.7)

**No native library build.** There is no `WANT_LIBNH` path in the build system. The `sys/libnh/`
directory exists (ported from 3.7) but is used only as the WASM entry point.

**WASM build** via `build-wasm.sh`. Three-phase process:

1. Build native utilities (makedefs, lev_comp, dgn_comp, dlb) with `CC=cc` override
2. Prepare WASM data directory
3. Build game with `emcc`

WASM exports (sys/unix/hints/linux-wasm):

```
["_main", "_shim_graphics_set_callback", "_malloc", "_free", "_mapglyph"]
```

Key difference: 3.6.7 does not use Lua, so the library would be simpler (no Lua dependency).

### Documented API

Per `packages/wasm-37/NetHack/sys/libnh/README.md`, the documented API is "two functions":

```c
int nhmain(int argc, char *argv[]);

typedef void(*shim_callback_t)(const char *name, void *ret_ptr, const char *fmt, ...);
void shim_graphics_set_callback(shim_callback_t cb);
```

The README explicitly notes: "Where is the header file for the API you ask? There isn't one."

### Undocumented but Public Symbols

These are non-static functions included in `libnh.a` and explicitly exported in the WASM build,
but not documented as part of the library API:

- **`map_glyphinfo(x, y, glyph, flags, glyphinfo *)`** -- defined in `src/display.c` (~line 2582),
  declared in `include/extern.h` (~line 626). Maps a glyph to detailed glyph information including
  symbols, colors, flags, and accessibility overrides.
- **`repopulate_perminvent()`** -- defined in `src/invent.c` (~line 3455), declared in
  `include/extern.h` (~line 1371). Refreshes permanent inventory display window.

Additionally, the .a contains every non-static function in NetHack (hundreds of symbols), but
these two are the only ones deliberately exported from WASM.

### Glyph Helper

There is a convenience wrapper `mapGlyphInfoHelper()` implemented as an `EM_JS` JavaScript
function in `sys/libnh/libnhmain.c` (~lines 895-914). It:

- Allocates memory for `glyph_info` (36 bytes on WASM32)
- Calls `_map_glyphinfo()`
- Extracts and returns a JavaScript object
- Frees memory

This helper exists **only in the WASM build**. It is not available in `libnh.a`. Native consumers
would need to call `map_glyphinfo()` directly and manage the `glyph_info` struct themselves.

### Shim Graphics Callback Architecture

Both packages use a shim window system (`win/shim/winshim.c`) that routes all NetHack window
operations through a single callback function.

**WASM interface:**

```c
void shim_graphics_set_callback(char *cbName);  // JS function name
```

**Native (libnh.a) interface:**

```c
typedef void(*shim_callback_t)(const char *name, void *ret_ptr, const char *fmt, ...);
void shim_graphics_set_callback(shim_callback_t cb);
```

Window operations are dispatched by string name with varargs encoded via format strings:

- First char of fmt = return type (v=void, i=int, b=boolean, c=char, s=string)
- Remaining chars = argument types
- Example: `shim_putstr(winid, int, const char*)` uses fmt `"viis"`

Both packages use Asyncify (`-s ASYNCIFY`) to enable async JavaScript callbacks from synchronous
C code.

### Window Operations Exposed Through Callbacks

~40 functions including (wasm-37 versions):

- `shim_init_nhwindows`, `shim_player_selection_cb`, `shim_askname`
- `shim_create_nhwindow`, `shim_clear_nhwindow`, `shim_display_nhwindow`, `shim_destroy_nhwindow`
- `shim_putstr`, `shim_display_file`, `shim_start_menu`, `shim_add_menu`, `shim_end_menu`, `shim_select_menu`
- `shim_print_glyph`, `shim_nhgetch`, `shim_nh_poskey`
- `shim_yn_function`, `shim_getlin`, `shim_get_ext_cmd`
- `shim_raw_print`, `shim_raw_print_bold`, `shim_nhbell`
- `shim_status_init`, `shim_status_enablefield`, `shim_status_update`
- Full list in `win/shim/winshim.c`

Notable differences between 3.7 and 3.6.7:

- 3.7 uses `glyph_info *` in `shim_add_menu` and `shim_print_glyph`; 3.6.7 uses `int glyph`
- 3.7 has `shim_player_selection_cb` (returns boolean); 3.6.7 has `shim_player_selection` (void)
- 3.6.7 has extra functions: `shim_start_screen`, `shim_end_screen`, `shim_outrip`

### Test Infrastructure

- **wasm-37:** `sys/libnh/test/libtest.c` (C test), `sys/libnh/test/run.sh` -- minimal, demonstrates
  callback setup and `nhmain()` call only
- **wasm-367:** `sys/libnh/test/test.mjs` (JavaScript/WASM test)

---

## Desired Library Targets

### Target Matrix

| Target              | Format             | wasm-37 Status           | wasm-367 Status                  |
| ------------------- | ------------------ | ------------------------ | -------------------------------- |
| WASM (browser/Node) | .wasm + .js        | Working                  | Working                          |
| Static (Linux)      | .a                 | Working (`WANT_LIBNH=1`) | Needs WANT_LIBNH port            |
| Shared (Linux)      | .so                | Not yet                  | Needs WANT_LIBNH port + .so rule |
| Shared (macOS)      | .dylib             | Not yet                  | Same                             |
| Shared (Windows)    | .dll               | Not yet (hardest)        | Same                             |
| WASI                | .wasm (standalone) | Not yet                  | Not yet                          |

### Static Library (.a)

**wasm-37:** Already works. No changes needed.

**wasm-367:** Needs the `WANT_LIBNH=1` Makefile logic ported from wasm-37. Since 3.6.7 has no
Lua dependency, the build would be simpler. The `libnhmain.c` non-WASM code path was ported from
3.7 but may not have been tested natively.

### Shared Library (.so / .dylib)

**Effort: Low-moderate for Linux/macOS.** The `-fpic` flag is already set when `WANT_LIBNH=1`.
Needed:

- Add linker rules producing shared libraries from the same objects
- Define symbol visibility (currently all non-static symbols are exported; should restrict to
  public API using `__attribute__((visibility("default")))` or a version script)
- Platform conditionals:
    - Linux: `$(CC) -shared -o libnh.so.1.0 $(OBJECTS) -Wl,-soname,libnh.so.1`
    - macOS: `$(CC) -dynamiclib -o libnh.dylib -install_name @rpath/libnh.dylib $(OBJECTS)`

### Windows DLL (.dll)

**Effort: High.** NetHack's build system is Unix-oriented.

- Needs `__declspec(dllexport)` annotations or a `.def` file for exported symbols
- Requires either cross-compilation (MinGW) or MSVC build support
- Unix-specific code in `$(LIBNHSYSOBJ)` (ioctl.o, unixtty.o, unixunix.o) would need
  Windows alternatives
- Consider deferring this unless there is concrete demand

### WASI Build

**Effort: Moderate-high.**

Would use `clang --target=wasm32-wasi` via wasi-sdk. Main challenges:

- Replace all Emscripten-specific code (`EM_JS`, `ASYNCIFY`, `IDBFS`)
- WASI provides POSIX-like file I/O and stdio, so much of NetHack's Unix system code would work
- **Critical problem:** No async callback mechanism like Emscripten's Asyncify. The entire shim
  graphics interface relies on synchronous C code calling into async JavaScript. WASI has no
  equivalent. Options:
    - Blocking/polling interface (fundamentally different architecture)
    - WASI Preview 2 component model (still maturing as of early 2026)

**Use cases for WASI:**

- Sandboxed server-side execution in WASM runtimes (wasmtime, wasmer) without JS
- Language-agnostic embedding via any WASM runtime (Rust, Go, Python, etc.)
- Edge/serverless (Cloudflare Workers, Fastly Compute)

**Assessment:** Significant effort for little practical gain. A native shared library gives
language-agnostic embedding with better performance and simpler FFI. The Emscripten WASM build
already covers browser contexts. WASI would only make sense if a specific deployment target
requires it. **Recommend deferring.**

---

## API Improvements

### Problem

The current callback interface is untyped and requires format-string parsing:

```c
typedef void(*shim_callback_t)(const char *name, void *ret_ptr, const char *fmt, ...);
```

Consumers receive a single callback for all ~40 window operations, with the operation name as a
string and arguments encoded via varargs format strings. This is error-prone, undiscoverable, and
impossible to type-check at compile time.

### Option A: Vtable / Struct of Function Pointers (Recommended)

The classic C approach for plugin/driver APIs:

```c
typedef struct {
    void (*init_nhwindows)(int *argc, char **argv);
    int  (*player_selection)(void);
    void (*askname)(void);
    int  (*create_nhwindow)(int type);
    void (*clear_nhwindow)(int window);
    void (*display_nhwindow)(int window, int blocking);
    void (*destroy_nhwindow)(int window);
    void (*putstr)(int window, int attr, const char *str);
    int  (*nhgetch)(void);
    // ... ~40 functions total
} nhcallbacks_t;

void shim_graphics_set_callbacks(nhcallbacks_t *callbacks);
```

**Pros:**

- Type-safe at compile time
- Consumer implements only the functions they care about (NULL = no-op)
- Zero parsing overhead
- This mirrors what NetHack already does internally with `struct window_procs` -- we would be
  exposing that pattern to library consumers

**Cons:**

- ABI-breaking if functions are added/removed (can mitigate with a version field and reserved
  slots)
- Larger surface area to document

### Option B: Individual Registration Functions

```c
typedef void (*init_nhwindows_fn)(int *argc, char **argv);
typedef int  (*create_nhwindow_fn)(int type);
// ... per-function typedefs

void shim_register_init_nhwindows(init_nhwindows_fn fn);
void shim_register_create_nhwindow(create_nhwindow_fn fn);
// ... ~40 registration functions
```

**Pros:**

- Most type-safe option
- Easy to version (add new registration functions without breaking old ones)

**Cons:**

- Verbose -- ~40 registration calls at setup time
- More boilerplate for both library and consumer

### Option C: Keep Single Callback, Add Typed Wrapper Macros

```c
// In nhlib.h:
#define NH_CB_PUTSTR(cb, window, attr, str) \
    cb("shim_putstr", NULL, "viis", (window), (attr), (str))

#define NH_CB_CREATE_NHWINDOW(cb, type, ret) \
    cb("shim_create_nhwindow", (ret), "ii", (type))
```

**Pros:**

- Least invasive change to existing code
- Single callback mechanism stays the same underneath
- Consumers get some type checking via macros

**Cons:**

- Errors are still runtime, not compile-time
- Macros can be fragile and hard to debug
- Does not help consumers implementing the callback (they still parse format strings)

### Recommendation

**Option A** is the clear winner. NetHack's internal `window_procs` struct already defines the
exact interface. The shim layer would translate between the consumer's vtable and NetHack's
internal dispatch. This is the most natural C API and the one experienced C developers will expect.

---

## Header File

### What is Needed

A public header (`nhlib.h` or `libnethack.h`) must provide:

1. **Entry points:**

    ```c
    int nhmain(int argc, char *argv[]);
    void shim_graphics_set_callback(...);  // signature depends on API choice above
    void map_glyphinfo(int x, int y, int glyph, unsigned flags, nhlib_glyph_info *gi);
    void repopulate_perminvent(void);
    ```

2. **Callback type** -- either the current `shim_callback_t` or a vtable struct (Option A).

3. **Types used in the API** -- primarily `glyph_info`. Options:

    **Option 1: Opaque pointer with accessor functions (cleanest)**

    ```c
    typedef struct nhlib_glyph_info nhlib_glyph_info;
    nhlib_glyph_info *nhlib_glyph_info_alloc(void);
    void nhlib_glyph_info_free(nhlib_glyph_info *gi);
    int nhlib_glyph_info_glyph(const nhlib_glyph_info *gi);
    int nhlib_glyph_info_color(const nhlib_glyph_info *gi);
    const char *nhlib_glyph_info_symname(const nhlib_glyph_info *gi);
    // ...
    ```

    - ABI-stable: internal layout can change without recompiling consumers
    - More work to implement (accessor function per field)

    **Option 2: Flattened public struct**

    ```c
    typedef struct {
        int glyph;
        int color;
        int ttychar;
        unsigned frameflags;
        // ... only fields consumers need
    } nhlib_glyph_info;
    ```

    - Simpler to use (direct field access)
    - ABI-breaking if struct layout changes

    **Option 3: Re-export internal headers**
    - Ship `display.h` and transitive dependencies
    - Quick but ugly -- exposes NetHack internals, high coupling

4. **Constants** -- glyph offsets (`GLYPH_MON_OFF`, `MAX_GLYPH`, `NO_GLYPH`, etc.). Currently
   injected as JS globals in WASM build (`js_constants_init()` in `libnhmain.c` ~lines 1047-1067).
   For a C header, these would be `#define` constants or query functions.

### Effort Estimate

- Minimal header (current API, no type improvements): a few hours
- Clean header with vtable API (Option A) + opaque glyph types (Option 1): a couple days

---

## Packaging and Installation

### Option A: Basic Makefile Target

```makefile
PREFIX ?= /usr/local

install-libnh: libnh.a
    install -d $(DESTDIR)$(PREFIX)/lib
    install -d $(DESTDIR)$(PREFIX)/include
    install -m 644 libnh.a $(DESTDIR)$(PREFIX)/lib/
    install -m 644 ../sys/libnh/nhlib.h $(DESTDIR)$(PREFIX)/include/
```

**Pros:** Simple, familiar, universal. Supports `DESTDIR` for package builds.
**Cons:** No dependency metadata, no version discovery.

### Option B: pkg-config File

```
prefix=@PREFIX@
libdir=${prefix}/lib
includedir=${prefix}/include

Name: libnh
Description: NetHack as a library
Version: 3.7.0
Libs: -L${libdir} -lnh
Cflags: -I${includedir}
```

Consumers use: `pkg-config --cflags --libs libnh`

**Pros:** Standard discovery mechanism on Linux/macOS. Most build systems support it.
**Cons:** Not widely used on Windows.

### Option C: CMake Config File

Ship `libnh-config.cmake` so consumers can `find_package(libnh)`.

**Pros:** Standard for CMake projects.
**Cons:** More work to create. Overkill unless there is CMake-based consumer demand.

### Option D: npm Package with Native Addon

Ship the .a + header as part of an npm package using node-gyp or prebuild.

**Pros:** Fits the existing monorepo workflow.
**Cons:** Niche. Only useful for Node.js native addons.

### Recommendation

Start with **Option A + Option B**. A Makefile install target plus a pkg-config file covers the
vast majority of use cases with minimal effort. Add CMake config later if there is demand.

---

## Summary of Recommendations

| Decision               | Recommendation                                                  | Rationale                                                                                 |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Native library targets | .a + .so + .dylib                                               | .a already works; .so/.dylib are low effort with -fpic already set                        |
| Windows .dll           | Defer                                                           | High effort, Unix-oriented build system, unclear demand                                   |
| WASI                   | Defer                                                           | Moderate-high effort, no Asyncify equivalent, limited use case advantage over .so + .wasm |
| C API style            | Vtable (Option A)                                               | Type-safe, mirrors internal window_procs, standard C pattern                              |
| glyph_info exposure    | Opaque pointer (Option 1) or flattened struct (Option 2) -- TBD | Depends on ABI stability requirements                                                     |
| Header file            | Create nhlib.h                                                  | Essential for any real library distribution                                               |
| Packaging              | Makefile install + pkg-config                                   | Covers most use cases, minimal effort                                                     |

---

## Key File References

All paths relative to `packages/<wasm-37|wasm-367>/NetHack/`:

| File                        | Description                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ |
| `sys/libnh/libnhmain.c`     | Library entry point; JS helpers (WASM); `nhmain()` / `main()`                  |
| `sys/libnh/README.md`       | Current (minimal) API documentation (wasm-37 only)                             |
| `sys/libnh/sysconf`         | System configuration for library build                                         |
| `sys/libnh/test/libtest.c`  | Native library test (wasm-37)                                                  |
| `sys/libnh/test/test.mjs`   | WASM library test (wasm-367)                                                   |
| `sys/libnh/test/run.sh`     | Test runner script (wasm-37)                                                   |
| `win/shim/winshim.c`        | Shim window system; callback dispatch; ~40 window operations                   |
| `src/Makefile`              | Build rules for libnh.a and WASM (wasm-37)                                     |
| `src/display.c`             | `map_glyphinfo()` definition (~line 2582)                                      |
| `src/invent.c`              | `repopulate_perminvent()` definition (~line 3455)                              |
| `include/extern.h`          | Declarations for map_glyphinfo (~line 626), repopulate_perminvent (~line 1371) |
| `sys/unix/hints/linux-wasm` | WASM hints/build config (wasm-367)                                             |
| `build-wasm.sh`             | WASM build script (both packages, at package root)                             |

---

## Open Questions

- Should the vtable API be versioned (e.g., a `version` field or `sizeof` check)?
- Should we support partial callback implementations (NULL = default/no-op) or require all?
- For glyph_info, do we need ABI stability across NetHack versions, or is it acceptable to
  require recompilation?
- Should the native library expose any game-state query functions beyond the current API
  (e.g., dungeon level info, player stats)?
- Should wasm-367 get native library support at all, or focus only on wasm-37 going forward?
- What is the minimum set of glyph constants needed by consumers?
