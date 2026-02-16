// Root ESLint configuration for neth4ck-monorepo
// This config focuses on ERROR PREVENTION, not stylistic rules
// Formatting is handled by Prettier (.prettierrc)

import eslint from "@eslint/js";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";

export default [
    // ============================================
    // IGNORE PATTERNS
    // ============================================
    {
        ignores: [
            "**/dist/**",
            "**/node_modules/**",
            "**/coverage/**",
            "**/tmp/**",
            // Config files
            "**/*.config.js",
            // Build artifacts (Emscripten-generated WASM JS)
            "packages/*/build/**",
            // NetHack submodules
            "packages/*/NetHack/**",
            // Nx cache
            ".nx/**",
        ],
    },

    // ============================================
    // BASE JAVASCRIPT RULES
    // ============================================
    eslint.configs.recommended,

    // ============================================
    // SOURCE FILES
    // ============================================
    {
        files: ["**/*.js", "**/*.mjs"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.es2022,
                ...globals.node,
            },
        },
        plugins: {
            "simple-import-sort": simpleImportSort,
        },
        rules: {
            // ==========================================
            // ERROR PREVENTION - Logic Safety
            // ==========================================
            eqeqeq: ["error", "always"],
            curly: "error",
            "no-var": "error",
            "prefer-const": "error",
            "no-template-curly-in-string": "error",
            "no-nested-ternary": "error",
            "no-unneeded-ternary": "error",
            "prefer-template": "error",
            "default-param-last": "error",
            yoda: ["error", "never"],

            // ==========================================
            // CODE QUALITY
            // ==========================================
            "no-console": ["error", { allow: ["warn", "error"] }],
            "no-duplicate-imports": "error",
            "no-useless-rename": "error",
            "no-useless-computed-key": "error",
            "prefer-rest-params": "error",
            "prefer-spread": "error",
            camelcase: ["error", { properties: "always" }],

            // ==========================================
            // IMPORT SORTING
            // ==========================================
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
        },
    },

    // ============================================
    // RELAXED RULES FOR TEST FILES
    // ============================================
    {
        files: ["**/*.test.js", "**/*.spec.js", "**/test/**/*.js", "**/__tests__/**/*.js"],
        rules: {
            "no-console": "off",
        },
    },
];
