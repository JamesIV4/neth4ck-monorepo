import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

describe("@neth4ck/neth4ck", () => {
    let nethackStart;

    beforeAll(async () => {
        const mod = await import("@neth4ck/neth4ck");
        nethackStart = mod.default;
    });

    it("exports nethackStart as default", () => {
        expect(typeof nethackStart).toBe("function");
    });

    it("throws if first argument is not a function", async () => {
        await expect(nethackStart("not a function", () => {})).rejects.toThrow(
            "expected first argument to be a WASM factory function",
        );
    });

    it("throws if second argument is not a function or string", async () => {
        await expect(nethackStart(() => {}, 123)).rejects.toThrow(
            "expected second argument to be 'Function' or 'String' representing callback",
        );
    });

    it("throws if third argument is not an object", async () => {
        await expect(nethackStart(() => {}, () => {}, "bad")).rejects.toThrow(
            "expected third argument to be object",
        );
    });
});

// ---------------------------------------------------------------------------
// Helper: run the subprocess and parse JSON results
// ---------------------------------------------------------------------------
function runGame(version, extraArgs = []) {
    return execFileAsync(
        "node",
        [join(__dirname, "run-game-shim.mjs"), version, ...extraArgs],
        { timeout: 15000 },
    ).then(({ stdout }) => JSON.parse(stdout.trim()));
}

// Expected callbacks that both versions MUST fire during init
const SHARED_INIT_CALLBACKS = [
    "shim_init_nhwindows",
    "shim_create_nhwindow",
    "shim_status_init",
    "shim_display_nhwindow",
    "shim_print_glyph",
    "shim_putstr",
    "shim_status_update",
    "shim_raw_print",
];

// The first callbacks must always be init → create windows → status_init
const EXPECTED_INIT_SEQUENCE = [
    "shim_init_nhwindows",
    "shim_create_nhwindow",
    "shim_status_init",
    "shim_create_nhwindow",
    "shim_create_nhwindow",
];

// ---------------------------------------------------------------------------
// Integration tests per WASM version
// ---------------------------------------------------------------------------
describe.each([
    {
        label: "wasm-367",
        version: "367",
        playerSelectionCallback: "shim_player_selection",
        minNhdatSize: 1_200_000,
        requiredFsFiles: ["nhdat", "sysconf", "record", "logfile", "xlogfile", "perm"],
    },
    {
        label: "wasm-37",
        version: "37",
        playerSelectionCallback: "shim_player_selection_cb",
        minNhdatSize: 1_400_000,
        requiredFsFiles: ["nhdat", "sysconf", "record", "logfile", "xlogfile", "perm", "symbols"],
    },
])("integration with $label", ({ version, playerSelectionCallback, minNhdatSize, requiredFsFiles }) => {
    let result;

    beforeAll(async () => {
        result = await runGame(version);
    }, 20000);

    // -- No errors ---------------------------------------------------------

    it("completes without errors", () => {
        expect(result.error).toBeNull();
    });

    // -- Module capabilities -----------------------------------------------

    describe("module returned by nethackStart", () => {
        it("has _main export", () => {
            expect(result.moduleExports._main).toBe(true);
        });

        it("has _malloc export", () => {
            expect(result.moduleExports._malloc).toBe(true);
        });

        it.each(["cwrap", "ccall", "UTF8ToString", "stringToUTF8", "getValue", "setValue", "FS", "ENV"])(
            "has runtime method %s",
            (method) => {
                expect(result.runtimeMethods[method]).toBe(true);
            },
        );
    });

    // -- Filesystem --------------------------------------------------------

    describe("embedded filesystem", () => {
        it.each(requiredFsFiles)("contains /%s", (file) => {
            expect(result.fsFiles).toContain(file);
        });

        it(`has nhdat archive larger than ${(minNhdatSize / 1_000_000).toFixed(1)}MB`, () => {
            expect(result.nhdatSize).toBeGreaterThan(minNhdatSize);
        });
    });

    // -- Callback system ---------------------------------------------------

    describe("callback system", () => {
        it("fires a large number of callbacks", () => {
            expect(result.callbackCount).toBe(500);
        });

        it.each(SHARED_INIT_CALLBACKS)("fires %s callback", (name) => {
            expect(result.callbackNames).toContain(name);
        });

        it(`fires ${playerSelectionCallback} (player selection)`, () => {
            expect(result.callbackNames).toContain(playerSelectionCallback);
        });

        it("fires callbacks in the correct initialization order", () => {
            expect(result.callbackOrder.slice(0, 5)).toEqual(EXPECTED_INIT_SEQUENCE);
        });

        it("fires shim_init_nhwindows first", () => {
            expect(result.callbackOrder[0]).toBe("shim_init_nhwindows");
        });

        it(`fires ${playerSelectionCallback} within the first 15 callbacks`, () => {
            const idx = result.callbackOrder.indexOf(playerSelectionCallback);
            expect(idx).toBeGreaterThan(-1);
            expect(idx).toBeLessThan(15);
        });
    });

    // -- Argument decoding (decodeArgs integration) ------------------------

    describe("argument decoding via decodeArgs", () => {
        it("decodes shim_create_nhwindow type to a string (e.g. NHW_MESSAGE)", () => {
            expect(result.decodedArgs.shim_create_nhwindow.length).toBeGreaterThan(0);
            const firstArg = result.decodedArgs.shim_create_nhwindow[0][0];
            expect(firstArg.type).toBe("string");
            expect(firstArg.value).toMatch(/^NHW_/);
        });

        it("creates NHW_MESSAGE, NHW_MAP, and NHW_MENU windows", () => {
            const types = result.decodedArgs.shim_create_nhwindow.map((s) => s[0].value);
            expect(types).toContain("NHW_MESSAGE");
            expect(types).toContain("NHW_MAP");
            expect(types).toContain("NHW_MENU");
        });

        it("decodes shim_display_nhwindow window id to a string", () => {
            expect(result.decodedArgs.shim_display_nhwindow.length).toBeGreaterThan(0);
            const firstArg = result.decodedArgs.shim_display_nhwindow[0][0];
            expect(firstArg.type).toBe("string");
            expect(firstArg.value).toMatch(/^WIN_/);
        });

        it("decodes shim_display_nhwindow blocking flag to boolean", () => {
            const secondArg = result.decodedArgs.shim_display_nhwindow[0][1];
            expect(secondArg.type).toBe("boolean");
        });

        it("decodes shim_putstr with window name and text content", () => {
            expect(result.decodedArgs.shim_putstr.length).toBeGreaterThan(0);
            const sample = result.decodedArgs.shim_putstr[0];
            // arg[0] = decoded window name
            expect(sample[0].type).toBe("string");
            expect(sample[0].value).toMatch(/^WIN_/);
            // arg[2] = text string
            expect(sample[2].type).toBe("string");
        });

        it("receives quest intro text via shim_putstr", () => {
            const texts = result.decodedArgs.shim_putstr
                .filter((s) => s[2] && s[2].type === "string")
                .map((s) => s[2].value);
            const hasIntro = texts.some((t) => t.includes("It is written in the Book of"));
            expect(hasIntro).toBe(true);
        });

        it("decodes shim_status_update field names to strings (e.g. BL_TITLE)", () => {
            expect(result.decodedArgs.shim_status_update.length).toBeGreaterThan(0);
            const firstArg = result.decodedArgs.shim_status_update[0][0];
            expect(firstArg.type).toBe("string");
            expect(firstArg.value).toMatch(/^BL_/);
        });

        it("receives multiple distinct status fields", () => {
            const fields = result.decodedArgs.shim_status_update.map((s) => s[0].value);
            const unique = new Set(fields);
            expect(unique.size).toBeGreaterThanOrEqual(3);
        });

        it("decodes shim_print_glyph with WIN_MAP and numeric coordinates", () => {
            expect(result.decodedArgs.shim_print_glyph.length).toBeGreaterThan(0);
            const sample = result.decodedArgs.shim_print_glyph[0];
            expect(sample[0]).toEqual({ type: "string", value: "WIN_MAP" });
            // x coordinate
            expect(sample[1].type).toBe("number");
            expect(sample[1].value).toBeGreaterThanOrEqual(0);
            expect(sample[1].value).toBeLessThanOrEqual(80);
            // y coordinate
            expect(sample[2].type).toBe("number");
            expect(sample[2].value).toBeGreaterThanOrEqual(0);
            expect(sample[2].value).toBeLessThanOrEqual(25);
        });
    });

    // -- NETHACKOPTIONS passthrough ----------------------------------------

    describe("NETHACKOPTIONS passthrough", () => {
        it("sets NETHACKOPTIONS in the WASM ENV when provided", async () => {
            const r = await runGame(version, ["--nethack-options=name:SmokeHero,autoquiver"]);
            expect(r.envNethackOptions).toBe("name:SmokeHero,autoquiver");
            expect(r.error).toBeNull();
        }, 20000);

        it("does not set NETHACKOPTIONS when not provided", () => {
            expect(result.envNethackOptions).toBeNull();
        });
    });
});
