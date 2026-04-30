// Aetheria — i18n stub.
//
// MVP-grade: in-memory dictionaries keyed by dot-namespaced strings,
// `{var}` interpolation, fallback to default locale (then to the key
// itself). No plurals, gender, or RTL handling — those land with a real
// i18n library (i18next) in Step 4-J.

import { en } from "./locales/en.js";
import { vi } from "./locales/vi.js";

export type Locale = "en" | "vi";

export type Bundle = Readonly<Record<string, string>>;

const bundles: Record<Locale, Bundle> = {
  en,
  vi,
};

const DEFAULT_LOCALE: Locale = "en";
let currentLocale: Locale =
  (process.env.AETHERIA_LOCALE as Locale | undefined) ?? DEFAULT_LOCALE;

const interpolate = (template: string, vars?: Readonly<Record<string, string | number>>): string => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
};

export const i18n = {
  /** Lookup. Falls back to default locale, then to the raw key. */
  t(key: string, vars?: Readonly<Record<string, string | number>>, locale?: Locale): string {
    const effective = locale ?? currentLocale;
    const primary = bundles[effective]?.[key];
    if (primary !== undefined) return interpolate(primary, vars);
    const fallback = bundles[DEFAULT_LOCALE]?.[key];
    if (fallback !== undefined) return interpolate(fallback, vars);
    return interpolate(key, vars);
  },

  /** Switch the process-wide default locale. */
  setLocale(locale: Locale): void {
    currentLocale = locale;
  },

  getLocale(): Locale {
    return currentLocale;
  },

  /** Add or extend a bundle (used by tests / future hot-reload). */
  addBundle(locale: Locale, bundle: Bundle): void {
    bundles[locale] = { ...bundles[locale], ...bundle };
  },

  /** List loaded locales. */
  locales(): readonly Locale[] {
    return Object.keys(bundles) as Locale[];
  },
};
