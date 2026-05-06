"use client";

// Aetheria — minimal i18n hook.
//
// `useT()` returns a `t(key)` function bound to the active locale. The
// locale lives in localStorage (`aetheria.lang`) so reloads keep the
// player's preference. Unknown keys fall back to the English bundle and
// finally to the literal key string.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import {
  DEFAULT_LOCALE,
  LOCALES,
  messages,
  type Locale,
  type MessageBundle,
  type MessageKey,
} from "./messages.js";

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => {
        set({ locale });
      },
    }),
    {
      name: "aetheria.lang",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

const lookup = (bundle: MessageBundle, key: string): string | undefined => {
  const [ns, leaf] = key.split(".") as [keyof MessageBundle, string];
  if (!ns || !leaf) return undefined;
  const inner = bundle[ns] as Record<string, string> | undefined;
  return inner?.[leaf];
};

export const useT = (): { t: (key: MessageKey) => string; locale: Locale } => {
  const locale = useI18n((s) => s.locale);
  const t = (key: MessageKey): string => {
    const v = lookup(messages[locale], key);
    if (v !== undefined) return v;
    const fallback = lookup(messages[DEFAULT_LOCALE], key);
    return fallback ?? key;
  };
  return { t, locale };
};

export { LOCALES, type Locale };
