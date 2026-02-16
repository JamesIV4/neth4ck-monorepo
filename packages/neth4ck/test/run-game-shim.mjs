// Subprocess helper for integration tests
// Usage: node run-game-shim.mjs <367|37> [--nethack-options=name:Tester]
// Outputs JSON results to stdout, then exits
//
// Runs the full nethackStart → _main pipeline and captures detailed
// information about callbacks, module state, and decoded arguments.

import nethackStart from "@neth4ck/neth4ck";

const version = process.argv[2];
if (!version || !["367", "37"].includes(version)) {
    process.stderr.write("Usage: node run-game-shim.mjs <367|37> [--nethack-options=...]\n");
    process.exit(1);
}

const nethackOptionsArg = process.argv.find((a) => a.startsWith("--nethack-options="));
const nethackOptionsStr = nethackOptionsArg ? nethackOptionsArg.split("=").slice(1).join("=") : null;
let nethackOptions = null;
if (nethackOptionsStr) {
    nethackOptions = {};
    for (const part of nethackOptionsStr.split(",")) {
        if (part.startsWith("!")) {
            nethackOptions[part.slice(1)] = false;
        } else if (part.includes(":")) {
            const [k, ...v] = part.split(":");
            nethackOptions[k] = v.join(":");
        } else {
            nethackOptions[part] = true;
        }
    }
}

const MAX_CALLBACKS = 500;
const CALLBACK_ORDER_LIMIT = 100;

const results = {
    version,
    callbackCount: 0,
    callbackNames: [],
    callbackOrder: [],
    lastCallback: null,
    // Sampled decoded args for key callbacks
    decodedArgs: {
        "shim_create_nhwindow": [],
        "shim_display_nhwindow": [],
        "shim_putstr": [],
        "shim_status_update": [],
        "shim_print_glyph": [],
        "shim_select_menu": [],
    },
    // Module capabilities
    moduleExports: {},
    runtimeMethods: {},
    fsFiles: [],
    nhdatSize: 0,
    // Environment
    envNethackOptions: null,
    // Errors
    error: null,
};

const callbackNameSet = new Set();

function outputAndExit() {
    results.callbackNames = [...callbackNameSet].sort();
    process.stdout.write(`${JSON.stringify(results)}\n`);
    process.exit(0);
}

function sampleArgs(name, args) {
    const bucket = results.decodedArgs[name];
    if (!bucket || bucket.length >= 5) {
        return;
    }

    // Capture a serializable snapshot of the first few args
    const sample = [];
    for (let i = 0; i < Math.min(args.length, 4); i++) {
        const val = args[i];
        if (val === undefined) {
            sample.push({ type: "undefined" });
        } else if (val === null) {
            sample.push({ type: "null" });
        } else if (typeof val === "string") {
            sample.push({ type: "string", value: val.slice(0, 200) });
        } else if (typeof val === "number") {
            sample.push({ type: "number", value: val });
        } else if (typeof val === "boolean") {
            sample.push({ type: "boolean", value: val });
        } else {
            sample.push({ type: typeof val });
        }
    }
    bucket.push(sample);
}

const callback = async (name, ...args) => {
    results.callbackCount++;
    callbackNameSet.add(name);
    results.lastCallback = name;

    if (results.callbackOrder.length < CALLBACK_ORDER_LIMIT) {
        results.callbackOrder.push(name);
    }

    // Sample decoded args for key callbacks
    sampleArgs(name, args);

    if (results.callbackCount >= MAX_CALLBACKS) {
        outputAndExit();
    }

    switch (name) {
        case "shim_player_selection_or_tty": return false;
        case "shim_create_nhwindow": return 1;
        case "shim_select_menu": return 0;
        case "shim_nhgetch": return 32;
        case "shim_nh_poskey": return 32;
        case "shim_yn_function": return 121;
        case "shim_message_menu": return 0;
        case "shim_getmsghistory": return "";
        case "shim_doprev_message": return 0;
        case "shim_get_ext_cmd": return -1;
        case "shim_ctrl_nhwindow": return 0;
        default: return 0;
    }
};

async function main() {
    const createModule = version === "367"
        ? (await import("@neth4ck/wasm-367")).default
        : (await import("@neth4ck/wasm-37")).default;

    const moduleConfig = {
        noInitialRun: true,
        print: () => {},
        printErr: () => {},
    };
    if (nethackOptions) {
        moduleConfig.nethackOptions = nethackOptions;
    }

    const Module = await nethackStart(createModule, callback, moduleConfig);

    // Capture module state after initialization
    results.moduleExports = {
        _main: typeof Module._main === "function",
        _malloc: typeof Module._malloc === "function",
        _free: typeof Module._free === "function",
    };

    for (const m of ["cwrap", "ccall", "UTF8ToString", "stringToUTF8", "getValue", "setValue", "FS", "ENV"]) {
        results.runtimeMethods[m] = Module[m] !== undefined;
    }

    try {
        results.fsFiles = Module.FS.readdir("/").filter((f) => f !== "." && f !== "..");
        const stat = Module.FS.stat("/nhdat");
        results.nhdatSize = stat.size;
    } catch (e) {
        results.error = `FS error: ${e.message}`;
    }

    // Check if NETHACKOPTIONS was set in ENV
    results.envNethackOptions = Module.ENV.NETHACKOPTIONS || null;

    setTimeout(() => outputAndExit(), 10000);

    try {
        Module._main(0, 0);
    } catch (e) {
        results.error = `main() threw: ${e.message || e}`;
    }
}

main().catch((e) => {
    results.error = `Fatal: ${e.message || e}`;
    outputAndExit();
});
