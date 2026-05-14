"use client";

// Aetheria — Ads Component.
//
// Displays fullscreen interstitial ads after level completion.
// Controlled by feature flag "ads.enabled" (JSON config).
// Ad remains visible for 10-20s, then auto-closes.

import { useEffect, useState } from "react";

export interface AdsConfig {
  readonly enabled: boolean;
  readonly provider?: string;
  readonly placementId?: string;
  readonly durationSec?: number;
}

interface AdComponentProps {
  readonly config: AdsConfig;
  readonly onClose?: () => void;
}

export const AdComponent = ({ config, onClose }: AdComponentProps): JSX.Element | null => {
  const [remainingSeconds, setRemainingSeconds] = useState(
    config.durationSec ?? 15,
  );
  const [isClosed, setIsClosed] = useState(false);

  useEffect(() => {
    if (isClosed) return;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          setIsClosed(true);
          onClose?.();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isClosed, onClose]);

  if (isClosed) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
      {/* Placeholder: Replace with actual ad SDK (Google AdMob, etc.) */}
      <div className="space-y-4 text-center">
        <div className="text-6xl">📺</div>
        <p className="text-lg text-zinc-300">Advertisement</p>
        <p className="text-sm text-zinc-500">
          {config.provider || "Ad"} — {config.placementId || "placement"}
        </p>
        <p className="mt-8 text-sm text-zinc-400">
          Ad closes in <span className="font-semibold text-amber-400">{remainingSeconds}s</span>
        </p>
        <button
          onClick={() => {
            setIsClosed(true);
            onClose?.();
          }}
          className="mt-4 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Close Ad (skip remaining)
        </button>
      </div>

      {/* Integration guide for actual ad SDKs:
          - Google AdMob: load interstitial via firebase config
          - Custom API: call your backend for ad creative
          - SECURITY: Wrap actual ad content in <iframe sandbox="allow-scripts allow-same-origin">
            to prevent cross-origin attacks and content injection.
          - See: apps/web/docs/ADS_INTEGRATION.html
      */}
    </div>
  );
};
