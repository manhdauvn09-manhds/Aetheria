// Aetheria — ESLint preset for Node-only workspaces (api, realtime, worker, domain-*).
// Workspaces import this and re-export from their own eslint.config.mjs.

import tseslint from "typescript-eslint";
import baseConfig from "../../../eslint.config.mjs";

export default tseslint.config(...baseConfig, {
  languageOptions: {
    globals: {
      // explicit Node globals — keeps lint deterministic across Node versions.
      console: "readonly",
      process: "readonly",
      Buffer: "readonly",
      __dirname: "readonly",
      __filename: "readonly",
      global: "readonly",
      setTimeout: "readonly",
      clearTimeout: "readonly",
      setInterval: "readonly",
      clearInterval: "readonly",
      setImmediate: "readonly",
      clearImmediate: "readonly"
    }
  },
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          { group: ["react", "react-dom", "next/*"], message: "Node-only workspace — UI deps not allowed." }
        ]
      }
    ]
  }
});
