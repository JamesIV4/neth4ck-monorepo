# @neth4ck/neth4ck

Version-agnostic shim for running NetHack WASM builds. Handles module initialization, callback registration, NETHACKOPTIONS configuration, and friendly window-name decoding.

## Installation

```bash
npm install @neth4ck/neth4ck
```

You also need a WASM package:

```bash
npm install @neth4ck/wasm-367   # NetHack 3.6.7
# or
npm install @neth4ck/wasm-37    # NetHack 3.7
```

## Usage

```js
import nethackStart from "@neth4ck/neth4ck";
import createModule from "@neth4ck/wasm-367";

const Module = await nethackStart(createModule, myCallback, {
    nethackOptions: { name: "Bubba" },
});

async function myCallback(name, ...args) {
    switch (name) {
        case "shim_nhgetch":
            return 32; // space key
        // ... handle other callbacks
    }
}
```

## API

### `nethackStart(createModule, callback, options?) → Promise<Module>`

- **createModule** — WASM factory function (default export from a `@neth4ck/wasm-*` package)
- **callback** — Function called for every NetHack window-port callback. Receives `(name, ...args)`.
- **options** — Optional object:
    - **nethackOptions** — Object of NetHack options (e.g., `{ name: 'Bubba', autoquiver: true }`)
    - Any other properties are passed through as Emscripten Module config

Returns the initialized Emscripten Module.

## Migration from v1

```js
// v1.0.4
const nethackStart = require("@neth4ck/neth4ck");
nethackStart(myCallback, moduleOptions);

// v2.0.0
import nethackStart from "@neth4ck/neth4ck";
import createModule from "@neth4ck/wasm-367";
await nethackStart(createModule, myCallback, moduleOptions);
```

## License

See [LICENSE.md](./LICENSE.md) — NetHack General Public License.
