# @neth4ck/wasm-37

NetHack 3.7 compiled to WebAssembly via Emscripten.

## Installation

```bash
npm install @neth4ck/wasm-37
```

## Usage

### With the shim

```js
import nethackStart from "@neth4ck/neth4ck";
import createModule from "@neth4ck/wasm-37";

await nethackStart(createModule, myCallback, {
    nethackOptions: { name: "Bubba" },
});
```

### Direct usage

```js
import createModule from "@neth4ck/wasm-37";

const Module = await createModule({
    noInitialRun: true,
});
```

### Copying raw files

If you need the raw `.js` and `.wasm` files (e.g., for bundler copying):

```
node_modules/@neth4ck/wasm-37/build/nethack.js
node_modules/@neth4ck/wasm-37/build/nethack.wasm
```

## License

See [LICENSE.md](./LICENSE.md) — NetHack General Public License.
