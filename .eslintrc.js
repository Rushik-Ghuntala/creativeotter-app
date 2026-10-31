module.exports = {
  plugins: ["prettier", "@typescript-eslint"],
  extends: ["next/core-web-vitals", "prettier"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    sourceType: "module",
    createDefaultProgram: true,
  },
  rules: {
    "react/jsx-filename-extension": "off",
    "no-param-reassign": "off",
    "react/prop-types": "off",
    "react/require-default-props": "off",
    "react/react-in-jsx-scope": "off",
    "react/jsx-props-no-spreading": "off",
    "no-shadow": "off",
    "react-hooks/exhaustive-deps": "off",
    "import/no-cycle": "off",
    "prefer-destructuring": "off",
    "import/no-extraneous-dependencies": "off",
    "react/display-name": "off",
    "import/no-unresolved": ["off", { caseSensitive: false }],
    "no-restricted-imports": [
      "error",
      {
        patterns: ["@mui/*/*/*", "!@mui/material/test-utils/*"],
      },
    ],
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        vars: "all",
        args: "none",
      },
    ],
    "no-unused-vars": "error",
    "no-console": "error",
    "no-warning-comments": "error",
    "comma-dangle": ["error", "never"],
    "@typescript-eslint/no-explicit-any": "off",
  },
}
