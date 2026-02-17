import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

describe("@neth4ck/wasm-367", () => {
    let createModule;
    let nethackVersion;

    beforeAll(async () => {
        const mod = await import("@neth4ck/wasm-367");
        createModule = mod.default;
        nethackVersion = mod.nethackVersion;
    });

    it("exports a module factory function", () => {
        expect(typeof createModule).toBe("function");
    });

    it("exports nethack version 3.6.7", () => {
        expect(nethackVersion).toBe("3.6.7");
    });

    describe("module instantiation", () => {
        let Module;

        beforeAll(async () => {
            Module = await createModule({
                noInitialRun: true,
                print: () => {},
                printErr: () => {},
            });
        }, 30000);

        it("has _main function", () => {
            expect(typeof Module._main).toBe("function");
        });

        it("has _malloc function", () => {
            expect(typeof Module._malloc).toBe("function");
        });

        it("has cwrap function", () => {
            expect(typeof Module.cwrap).toBe("function");
        });

        it("has ccall function", () => {
            expect(typeof Module.ccall).toBe("function");
        });

        it("has UTF8ToString function", () => {
            expect(typeof Module.UTF8ToString).toBe("function");
        });

        it("has getValue/setValue functions", () => {
            expect(typeof Module.getValue).toBe("function");
            expect(typeof Module.setValue).toBe("function");
        });

        it("has FS module", () => {
            expect(Module.FS).toBeDefined();
        });

        it("has ENV object", () => {
            expect(Module.ENV).toBeDefined();
        });

        it("has embedded filesystem with expected files", () => {
            const files = Module.FS.readdir("/").filter((f) => f !== "." && f !== "..");
            expect(files).toContain("nhdat");
            expect(files).toContain("sysconf");
        });

        it("has nhdat archive larger than 1MB", () => {
            const stat = Module.FS.stat("/nhdat");
            expect(stat.size).toBeGreaterThan(1_000_000);
        });

        it("can create shim_graphics_set_callback wrapper", () => {
            const setCallback = Module.cwrap("shim_graphics_set_callback", null, ["string"]);
            expect(typeof setCallback).toBe("function");
        });
    });

    describe("game initialization", () => {
        it("reaches player selection via callbacks", async () => {
            const { stdout } = await execFileAsync("node", [join(__dirname, "run-game.mjs")], { timeout: 15000 });

            const result = JSON.parse(stdout.trim());
            expect(result.callbackCount).toBeGreaterThan(0);
            expect(result.callbackNames).toContain("shim_player_selection");
            expect(result.error).toBeNull();
        }, 20000);
    });
});
