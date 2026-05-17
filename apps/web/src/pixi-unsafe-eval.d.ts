// Pixi.js ships a CSP-safe variant under `pixi.js/unsafe-eval` (misnamed —
// see https://pixijs.com/8.x/guides/migrations/v7#unsafe-eval). It exposes
// the same surface as the main entry point but with shader compilation
// rewritten to avoid `Function()` / `eval()`. The package's package.json
// declares the subpath but ships no .d.ts for it, so TS can't find a
// declaration. We mirror the main entry's types since the runtime shapes
// are identical.

declare module "pixi.js/unsafe-eval" {
  export * from "pixi.js";
}
