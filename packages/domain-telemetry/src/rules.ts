// Aetheria — pure telemetry helpers.
//
// Funnel keys are pinned so a bad client can't poison the analytics
// schema. Anything outside the allowlist is rejected by the service.

export const KNOWN_EVENTS = [
  "signup_complete",
  "tutorial_complete",
  "level_clear",
  "account_level_5",
  "account_level_25",
  "shop_purchase",
  "pvp_first_match",
  "guild_join",
  "page_view",
  "error",
] as const;

export type KnownEvent = (typeof KNOWN_EVENTS)[number];

export const isKnownEvent = (s: string): s is KnownEvent =>
  (KNOWN_EVENTS as readonly string[]).includes(s);

export const MAX_BATCH = 50;
export const MAX_PAYLOAD_BYTES = 4 * 1024;

export const isPayloadShallow = (p: unknown): boolean => {
  if (p === null || p === undefined) return true;
  if (typeof p !== "object") return false;
  for (const v of Object.values(p as Record<string, unknown>)) {
    if (v === null) continue;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") continue;
    return false;
  }
  return true;
};
