// Flat config, because ESLint 9 reads nothing else.
//
// The repo carried a legacy .eslintrc.js under an ESLint 9 runtime, so `eslint`
// hard-errored with "couldn't find an eslint.config file" before reading a
// single source file — and nothing invoked it anyway (no lint script, not in
// the pre-commit hook, not in CI). react-hooks/exhaustive-deps was configured
// and never once enforced, which is how the stale-dependency bugs in the lobby
// reconnect and call-room effects shipped.
//
// Built from the packages already in devDependencies (@typescript-eslint/parser
// and /eslint-plugin), not the newer unified `typescript-eslint` helper, so
// this needs no new install.
const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = [
  {
    ignores: [
      "dist/**",
      "release/**",
      "native/**",
      "node_modules/**",
      "public/**",
      "scripts/**",
      "*.config.js",
      "*.config.cjs",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        console: "readonly",
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        queueMicrotask: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        process: "readonly",
        __dirname: "readonly",
        require: "readonly",
        module: "writable",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      // The two that matter here. Everything below is noise control.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // TypeScript already reports these, and its version is more accurate.
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",

      // `try { ... } catch {}` is used deliberately throughout for
      // best-effort cleanup. An empty block anywhere else is still an error.
      "no-empty": ["error", { allowEmptyCatch: true }],

      // `any` survives at a handful of IPC/bridge boundaries where the payload
      // is genuinely untyped until zod parses it. Warn, don't block.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // AudioWorklet code runs in the worklet global scope, which has neither the
    // window nor the worker globals.
    files: ["src/renderer/src/features/screen-share/loopback-worklet.js"],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: "readonly",
        registerProcessor: "readonly",
        sampleRate: "readonly",
        currentTime: "readonly",
      },
    },
  },
];
