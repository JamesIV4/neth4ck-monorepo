export default {
    extends: ["@commitlint/config-conventional"],
    rules: {
        "scope-enum": [2, "always", ["neth4ck", "wasm-367", "wasm-37", "deps", "release", "ci", "workspace"]],
    },
};
