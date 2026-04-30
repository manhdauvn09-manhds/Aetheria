// Aetheria — ESLint config for apps/web. Layers React preset + Next plugin.
// Next's flat-config wrapper isn't first-class yet, so we skip eslint-config-next
// and rely on the React preset + the rules baked into typescript-eslint.

import reactPreset from "@aetheria/config/eslint/react";

export default [
  ...reactPreset,
  {
    ignores: [".next/**", "next-env.d.ts"],
  },
];
