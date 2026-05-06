"use client";

// Aetheria — service-worker registrar.
//
// Mounted once in the root layout; registers `/sw.js` after page load
// when the browser supports service workers. Failures are logged, not
// thrown — the app must work fine without PWA support.

import { useEffect } from "react";

export const SwRegister = (): null => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const onLoad = (): void => {
      navigator.serviceWorker.register("/sw.js").catch((e: unknown) => {
        console.warn("[pwa] sw register failed", e);
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      window.removeEventListener("load", onLoad);
    };
  }, []);
  return null;
};
