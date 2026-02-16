# neth4ck-monorepo

NetHack compiled to WebAssembly — a monorepo containing the shim and WASM packages.

## Packages

| Package                                     | Description                                                    |
| ------------------------------------------- | -------------------------------------------------------------- |
| [`@neth4ck/neth4ck`](./packages/neth4ck/)   | Version-agnostic shim — callback bridge and module initializer |
| [`@neth4ck/wasm-367`](./packages/wasm-367/) | NetHack 3.6.7 WebAssembly build                                |
| [`@neth4ck/wasm-37`](./packages/wasm-37/)   | NetHack 3.7 WebAssembly build                                  |

## Quick Start

```js
import nethackStart from "@neth4ck/neth4ck";
import createModule from "@neth4ck/wasm-367";

await nethackStart(createModule, myCallback, {
    nethackOptions: { name: "Bubba" },
});
```

## Development

This is a [pnpm](https://pnpm.io/) + [Nx](https://nx.dev/) monorepo.

```bash
pnpm install
pnpm build
pnpm test
```

## WASM Build

The WASM artifacts are built from NetHack source via git submodules:

- `NetHack/` — NetHack 3.7 source (for `@neth4ck/wasm-37`)
- `NetHack-3.6/` — NetHack 3.6.7 source (for `@neth4ck/wasm-367`)

Built `.js`/`.wasm` files are gitignored but included in npm packages via `"files"` in each package.json.

## License

[NetHack General Public License](./LICENSE.md)
