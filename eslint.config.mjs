import globals from 'globals';
import pluginJs from '@eslint/js';
import pluginPromise from 'eslint-plugin-promise';
import stylisticJs from '@stylistic/eslint-plugin-js';

export default [
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        "DTRACE_HTTP_CLIENT_REQUEST": false,
        "LTTNG_HTTP_CLIENT_REQUEST": false,
        "COUNTER_HTTP_CLIENT_REQUEST": false,
        "DTRACE_HTTP_CLIENT_RESPONSE": false,
        "LTTNG_HTTP_CLIENT_RESPONSE": false,
        "COUNTER_HTTP_CLIENT_RESPONSE": false,
        "DTRACE_HTTP_SERVER_REQUEST": false,
        "LTTNG_HTTP_SERVER_REQUEST": false,
        "COUNTER_HTTP_SERVER_REQUEST": false,
        "DTRACE_HTTP_SERVER_RESPONSE": false,
        "LTTNG_HTTP_SERVER_RESPONSE": false,
        "COUNTER_HTTP_SERVER_RESPONSE": false,
        "DTRACE_NET_STREAM_END": false,
        "LTTNG_NET_STREAM_END": false,
        "COUNTER_NET_SERVER_CONNECTION_CLOSE": false,
        "DTRACE_NET_SERVER_CONNECTION": false,
        "LTTNG_NET_SERVER_CONNECTION": false,
        "COUNTER_NET_SERVER_CONNECTION": false
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: false,
          modules: false
        },
        ecmaVersion: 2020
      },
    }
  },
  {
    plugins: {
      '@stylistic/js': stylisticJs
    },
  },
  { ignores: ["test/**"] },
  pluginJs.configs.recommended,
  pluginPromise.configs['flat/recommended'],
  { rules: {
    "promise/always-return": "error",
    "promise/no-return-wrap": "error",
    "promise/param-names": "error",
    "promise/catch-or-return": "error",
    "promise/no-native": "off",
    "promise/no-nesting": "warn",
    "promise/no-promise-in-callback": "warn",
    "promise/no-callback-in-promise": "warn",
    "promise/no-return-in-finally": "warn",

    // Possible Errors
    "no-control-regex": 2,
    "no-debugger": 2,
    "no-dupe-args": 2,
    "no-dupe-keys": 2,
    "no-duplicate-case": 2,
    "no-empty-character-class": 2,
    "no-ex-assign": 2,
    "no-extra-boolean-cast": 2,
    "no-func-assign": 2,
    "no-invalid-regexp": 2,
    "no-irregular-whitespace": 2,
    "no-negated-in-lhs": 2,
    "no-obj-calls": 2,
    "no-proto": 2,
    "no-unexpected-multiline": 2,
    "no-unreachable": 2,
    "use-isnan": 2,
    "valid-typeof": 2,

    // Best Practices
    "no-fallthrough": 2,
    "no-octal": 2,
    "no-redeclare": 2,
    "no-self-assign": 2,
    "no-unused-labels": 2,

    // Strict Mode
    "strict": [2, "never"],

    // Variables
    "no-delete-var": 2,
    "no-undef": 2,
    "no-unused-vars": [2, { args: "none" }],

    // Node.js and CommonJS
    "no-mixed-requires": 2,
    "no-new-require": 2,
    "no-path-concat": 2,
    "no-restricted-modules": [2, "sys", "_linklist"],

    // Stylistic Issues
    "@stylistic/js/arrow-parens": [2, "always"],
    "@stylistic/js/arrow-spacing": [2, { before: true, after: true }],
    "@stylistic/js/comma-dangle": [2, "only-multiline"],
    "@stylistic/js/comma-spacing": 2,
    "@stylistic/js/eol-last": 2,
    "@stylistic/js/indent": [2, 2, { SwitchCase: 1 }],
    "@stylistic/js/keyword-spacing": 2,
    "@stylistic/js/max-len": [2, 120, 2],
    "@stylistic/js/new-parens": 2,
    "@stylistic/js/no-extra-parens": [2, "functions"],
    "@stylistic/js/no-extra-semi": 2,
    "@stylistic/js/no-mixed-spaces-and-tabs": 2,
    "@stylistic/js/no-multiple-empty-lines": [2, { max: 2 }],
    "@stylistic/js/no-trailing-spaces": [2, { skipBlankLines: false }],
    "@stylistic/js/quotes": [2, "single", "avoid-escape"],
    "@stylistic/js/semi": 2,
    "@stylistic/js/space-before-blocks": [2, "always"],
    "@stylistic/js/space-before-function-paren": [2, "never"],
    "@stylistic/js/space-in-parens": [2, "never"],
    "@stylistic/js/space-infix-ops": 2,
    "@stylistic/js/space-unary-ops": 2,

    // ECMAScript 6
    "constructor-super": 2,
    "no-class-assign": 2,
    "no-confusing-arrow": 2,
    "no-const-assign": 2,
    "no-dupe-class-members": 2,
    "no-new-symbol": 2,
    "no-this-before-super": 2,
    "prefer-const": 2
  } }
];
