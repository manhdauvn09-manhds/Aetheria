// Aetheria — Next.js 15 config (App Router).
//
// `transpilePackages` lets Next bundle workspace packages whose exports
// point at TypeScript source (no precompiled dist). Mirrors the list in
// tsconfig.base.json#paths to keep things explicit.
//
// Bundle Analysis:
//   ANALYZE=true pnpm build    to generate bundle report in .next/analyze/
//   Open bundles.html in a browser to explore dependency tree.

import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const isProd = process.env.NODE_ENV === "production";

// CSP: tightened. `'unsafe-inline'` kept on style-src for Tailwind JIT and
// Next dev overlay; tighten when nonce strategy lands. Connect-src widened
// to API + realtime origins (wss + https).
const apiOrigin      = process.env.NEXT_PUBLIC_API_URL      ?? "http://localhost:3001";
const realtimeOrigin = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3002";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `script-src 'self'${isProd ? "" : " 'unsafe-eval'"} 'unsafe-inline'`,
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${apiOrigin} ${realtimeOrigin} ${realtimeOrigin.replace(/^http/, "ws")}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy",   value: csp },
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
    : []),
];

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  productionBrowserSourceMaps: false,
  // AppRouter is `import type`-only, so domain/server packages are erased at
  // compile time and don't need transpiling. Schema-api + shared-types still
  // ship runtime values some day, so we keep them transpiled.
  transpilePackages: [
    "@aetheria/game-assets",
    "@aetheria/schema-api",
    "@aetheria/shared-types",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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

export default withBundleAnalyzer(config);
