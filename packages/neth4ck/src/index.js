import { decodeArgs, setModule } from "./decodeArgs.js";
import { createNethackOptions } from "./nethackOptions.js";

let userCallback;

function nethackCallback(name, ...args) {
    decodeArgs(name, args);
    return userCallback(name, ...args);
}

export default async function nethackStart(createModule, cb, inputModule = {}) {
    if (typeof createModule !== "function") {
        throw new TypeError(
            "expected first argument to be a WASM factory function (e.g. import from '@neth4ck/wasm-367')",
        );
    }

    if (typeof cb !== "string" && typeof cb !== "function") {
        throw new TypeError("expected second argument to be 'Function' or 'String' representing callback");
    }

    if (typeof inputModule !== "object") {
        throw new TypeError("expected third argument to be object");
    }

    globalThis.nethackCallback = nethackCallback;
    userCallback = cb;

    // Extract nethackOptions before passing the rest as Module config
    const { nethackOptions, ...moduleConfig } = inputModule;
    const Module = moduleConfig;

    // Save any user-provided onRuntimeInitialized
    const savedOnRuntimeInitialized = Module.onRuntimeInitialized;
    Module.onRuntimeInitialized = function (...args) {
        // After the WASM is loaded, set up the shim graphics callback
        Module.ccall("shim_graphics_set_callback", null, ["string"], ["nethackCallback"], { async: true });

        if (savedOnRuntimeInitialized) {
            savedOnRuntimeInitialized(...args);
        }
    };

    // Append NETHACKOPTIONS setup to preRun (preserve any user-provided hooks)
    const existingPreRun = Module.preRun || [];
    const preRunArray = Array.isArray(existingPreRun) ? existingPreRun : [existingPreRun];
    preRunArray.push(function setupNethackOptions() {
        if (nethackOptions) {
            Module.ENV.NETHACKOPTIONS = createNethackOptions(nethackOptions);
        }
    });
    Module.preRun = preRunArray;

    // Store module reference for decodeArgs pointer reading
    setModule(Module);

    // Load and run the WASM module
    const result = await createModule(Module);

    // Update module reference with the initialized result (Emscripten may return
    // the same object or a new one depending on build settings)
    setModule(result);

    return result;
}
