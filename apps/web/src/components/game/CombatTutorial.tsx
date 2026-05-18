"use client";

// Aetheria — first-visit combat tutorial overlay.
//
// 4 lightweight steps shown on the first /play/[N] visit. Stores
// "aetheria.tutorial.combat.v1" in localStorage so it doesn't reappear.
// Keeps a "Skip" button + "Don't show again" toggle for replay viewers.

import { useEffect, useState } from "react";

const STORAGE_KEY = "aetheria.tutorial.combat.v1";

interface Step {
  readonly title: string;
  readonly body: readonly string[];
}

const STEPS: readonly Step[] = [
  {
    title: "Bước 1 · Khám phá map",
    body: [
      "Đây là bàn hex 6×4. Hero của bạn (chấm xanh) đứng bên trái, enemy (chấm đỏ) bên phải.",
      "Drag để pan, scroll để zoom. Click ô bất kỳ để xem toạ độ (q, r).",
      "Sao vàng = exit. Tile tím = shrine (FX). Mỗi terrain có movement cost khác nhau.",
    ],
  },
  {
    title: "Bước 2 · Engage combat",
    body: [
      "Click nút \"Engage combat\" ở góc phải để bắt đầu trận chiến.",
      "Hero sẽ xuất hiện trên map với HP / AP / tên (Aevra, Kyo, …). Element-tinted glow quanh sprite.",
      "Bạn có 3 AP/turn. Mỗi action tốn 1 AP. Hết AP → End turn.",
    ],
  },
  {
    title: "Bước 3 · Hành động trong turn",
    body: [
      "• Click ô hex kế hero → di chuyển 1 bước (tốn 1 AP, phải adjacent).",
      "• Click enemy trên map → chọn làm target. Khi target adjacent + đã chọn, nút \"Attack\" sáng lên.",
      "• \"Defend\" = tăng phòng thủ 1 turn. \"End turn\" = nhường lượt, AP hồi về 3.",
    ],
  },
  {
    title: "Bước 4 · Element wheel + Win",
    body: [
      "Hero/enemy có element: Verdant > Tide > Ember > Frost > Sky > Void > Verdant (counter cycle).",
      "Tấn công element strong-against target → +50% dmg. Cùng element → 1.0×. Yếu hơn → 0.5×.",
      "Diệt hết enemy = Victory → next level. Tất cả hero HP=0 = Defeat → run abandoned.",
    ],
  },
];

export const CombatTutorial = (): JSX.Element | null => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setOpen(true);
  }, []);

  if (!open) return null;

  const cur = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  const close = (persist: boolean): void => {
    if (persist && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    }
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="tutorial-title" className="font-display text-xl text-realm-aetheric">
            {cur.title}
          </h2>
          <span className="text-xs text-zinc-500">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        <ul className="mb-5 space-y-2 text-sm leading-relaxed text-zinc-200">
          {cur.body.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        <label className="mb-4 flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800"
          />
          Không hiển thị lần sau (xoá cache trình duyệt để bật lại)
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => close(dontShow)}
            className="rounded-md border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Skip
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="rounded-md border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (isLast) {
                  close(dontShow);
                } else {
                  setStep((s) => Math.min(STEPS.length - 1, s + 1));
                }
              }}
              className="rounded-md border border-realm-aetheric bg-realm-aetheric/20 px-4 py-1 text-sm text-zinc-100 hover:bg-realm-aetheric/30"
            >
              {isLast ? "Bắt đầu chơi" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
