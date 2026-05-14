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
  // Block legacy Adobe Flash / Acrobat / Silverlight from loading any
  // cross-domain policy file rooted on our origin. Modern browsers ignore
  // the header entirely; this only takes effect for the dwindling set of
  // installations that still have a plugin runtime, where it removes a
  // path attackers occasionally use to bypass same-origin via a stale
  // crossdomain.xml. Zero risk for everyone else.
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // Cross-Origin isolation. COOP severs `window.opener` for cross-origin
  // tabs (mitigates the tab-nabbing chain where an attacker-controlled
  // popup steers our origin via window.opener.location). CORP refuses
  // cross-site embedders from loading our HTML / API responses as a
  // subresource (e.g. <img src="our-private-page">). NextAuth uses full
  // redirects rather than popups, so COOP same-origin is safe here.
  { key: "Cross-Origin-Opener-Policy",   value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  // HSTS: 2 years is the minimum to qualify for the Chrome HSTS preload
  // list (hstspreload.org). `includeSubDomains` + `preload` are also
  // required by the submission policy. Only emit in production — dev needs
  // http://localhost to stay accessible after a single https visit.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  productionBrowserSourceMaps: false,
  // `output: standalone` produces a self-contained server bundle in
  // .next/standalone that the web Dockerfile copies into a minimal
  // node:alpine runtime. Without this the runtime image would have to
  // ship the full monorepo node_modules (~600 MB).
  output: "standalone",
  // Strip console.log/.debug/.info from production bundles via Next's SWC
  // pipeline. Keep `error` + `warn` so genuine operational messages still
  // surface in browser devtools for support / forum bug reports. This is a
  // defense-in-depth — even if a future PR slips `console.log(user)` past
  // review, the production bundle won't ship it to end users.
  compiler: isProd
    ? { removeConsole: { exclude: ["error", "warn"] } }
    : undefined,
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
