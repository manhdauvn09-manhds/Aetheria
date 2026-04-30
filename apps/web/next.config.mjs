// Aetheria — Next.js 15 config (App Router).
//
// `transpilePackages` lets Next bundle workspace packages whose exports
// point at TypeScript source (no precompiled dist). Mirrors the list in
// tsconfig.base.json#paths to keep things explicit.

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // AppRouter is `import type`-only, so domain/server packages are erased at
  // compile time and don't need transpiling. Schema-api + shared-types still
  // ship runtime values some day, so we keep them transpiled.
  transpilePackages: [
    "@aetheria/game-assets",
    "@aetheria/schema-api",
    "@aetheria/shared-types",
  ],
  // Webpack doesn't natively rewrite `.js` → `.ts` for source-pointed
  // workspace packages. Without this, `import "./levels.js"` from a
  // transpiled package's `.ts` file fails to resolve. tsx/tsc handle
  // this themselves; webpack needs a hint.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  // Outputs to `.next/standalone` later if we deploy via container — not
  // needed for dev. Wire here when Phase 4-K (deploy dry-run) lands.
};

export default config;
