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
    "@aetheria/schema-api",
    "@aetheria/shared-types",
  ],
  // Outputs to `.next/standalone` later if we deploy via container — not
  // needed for dev. Wire here when Phase 4-K (deploy dry-run) lands.
};

export default config;
