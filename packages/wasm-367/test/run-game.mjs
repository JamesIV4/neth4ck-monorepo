// Standalone game initialization script for @neth4ck/wasm-367
// Run via: node run-game.mjs
// Outputs JSON results to stdout, then exits

import createModule from "@neth4ck/wasm-367";

const MAX_CALLBACKS = 500;

const results = {
    callbackCount: 0,
    callbackNames: [],
    lastCallback: null,
    error: null,
};

const callbackNameSet = new Set();

function outputAndExit() {
    results.callbackNames = [...callbackNameSet].sort();
    process.stdout.write(`${JSON.stringify(results)}\n`);
    process.exit(0);
}

async function main() {
    const Module = await createModule({
        noInitialRun: true,
        print: () => {},
        printErr: () => {},
    });

    globalThis.nethackGlobal = globalThis.nethackGlobal || {};
    globalThis.nethackGlobal.helpers = {
        getPointerValue: (name, ptr, type) => {
            switch (type) {
                case "i":
                case "2":
                    return Module.getValue(ptr, "i32");
                case "0":
                    return Module.getValue(ptr, "i8");
                case "1":
                    return Module.getValue(ptr, "i16");
                case "s":
                    return Module.UTF8ToString(ptr);
                case "p":
                    return ptr;
                case "b":
                    return Module.getValue(ptr, "i8") !== 0;
                case "c":
                    return String.fromCharCode(Module.getValue(ptr, "i8"));
                default:
                    return ptr;
            }
        },
        setPointerValue: (name, ptr, type, val) => {
            if (!ptr) {
                return;
            }
            switch (type) {
                case "i":
                case "2":
                    Module.setValue(ptr, val | 0, "i32");
                    break;
                case "0":
                    Module.setValue(ptr, val | 0, "i8");
                    break;
                case "1":
                    Module.setValue(ptr, val | 0, "i16");
                    break;
                case "b":
                    Module.setValue(ptr, val ? 1 : 0, "i8");
                    break;
                case "c":
                    Module.setValue(ptr, typeof val === "string" ? val.charCodeAt(0) : val | 0, "i8");
                    break;
                case "v":
                    break;
                default:
                    Module.setValue(ptr, val | 0, "i32");
                    break;
            }
        },
    };

    globalThis.nethackCallback = async (name) => {
        results.callbackCount++;
        callbackNameSet.add(name);
        results.lastCallback = name;

        if (results.callbackCount >= MAX_CALLBACKS) {
            outputAndExit();
        }

        switch (name) {
            case "shim_create_nhwindow":
                return 1;
            case "shim_select_menu":
                return 0;
            case "shim_nhgetch":
                return 32;
            case "shim_nh_poskey":
                return 32;
            case "shim_yn_function":
                return 121;
            case "shim_message_menu":
                return 0;
            case "shim_getmsghistory":
                return "";
            case "shim_doprev_message":
                return 0;
            case "shim_get_ext_cmd":
                return -1;
            default:
                return 0;
        }
    };

    const setCallback = Module.cwrap("shim_graphics_set_callback", null, ["string"]);
    setCallback("nethackCallback");

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
