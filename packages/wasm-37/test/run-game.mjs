// Standalone game initialization script for @neth4ck/wasm-37
// Run via: node run-game.mjs
// Outputs JSON results to stdout, then exits

import createModule from "@neth4ck/wasm-37";

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
    process.stdout.write(`${JSON.stringify(results)  }\n`);
    process.exit(0);
}

async function main() {
    const Module = await createModule({
        noInitialRun: true,
        print: () => {},
        printErr: () => {},
    });

    globalThis.nethackGlobal = globalThis.nethackGlobal || {};

    globalThis.nethackCallback = async (name) => {
        results.callbackCount++;
        callbackNameSet.add(name);
        results.lastCallback = name;

        if (results.callbackCount >= MAX_CALLBACKS) {
            outputAndExit();
        }

        switch (name) {
            case "shim_player_selection_cb": return false;
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
