// Aetheria — ESLint preset for React/Next.js workspaces (apps/web, packages/ui-kit).

import tseslint from "typescript-eslint";
import baseConfig from "../../../eslint.config.mjs";

export default tseslint.config(...baseConfig, {
  languageOptions: {
    globals: {
      window: "readonly",
      document: "readonly",
      navigator: "readonly",
      fetch: "readonly",
      console: "readonly",
      localStorage: "readonly",
      sessionStorage: "readonly",
      indexedDB: "readonly"
    }
  },
  rules: {
    // React projects accept JSX-implicit children typing.
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } }
    ]
  }
});
