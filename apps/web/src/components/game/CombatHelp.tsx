"use client";

// Aetheria — combat help button + modal.
//
// Floating "?" button in the header that opens a modal with full rules,
// controls reference, and the element wheel. Always available; orthogonal
// to the first-visit CombatTutorial.

import { useState } from "react";

const ELEMENT_CYCLE = [
  { name: "Verdant", color: "#6cd66c", strongVs: "Tide" },
  { name: "Tide",    color: "#4fb6c0", strongVs: "Ember" },
  { name: "Ember",   color: "#ff7a3a", strongVs: "Frost" },
  { name: "Frost",   color: "#a8d5e2", strongVs: "Sky" },
  { name: "Sky",     color: "#b6c7ff", strongVs: "Void" },
  { name: "Void",    color: "#c59cff", strongVs: "Verdant" },
];

export const CombatHelp = (): JSX.Element => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Cách chơi"
        aria-label="Hướng dẫn"
        className="rounded-md border border-zinc-700 px-3 py-1 text-zinc-300 hover:bg-zinc-800"
      >
        ?
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-2xl text-realm-aetheric">
                Hướng dẫn chơi
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Esc
              </button>
            </div>

            <section className="mb-5 space-y-2 text-sm leading-relaxed text-zinc-200">
              <h3 className="font-semibold text-zinc-100">Mục tiêu</h3>
              <p>
                Mỗi level là một trận chiến trên bàn hex. Diệt hết enemy ={" "}
                <span className="text-emerald-300">Victory</span>. Tất cả hero HP=0
                = <span className="text-rose-300">Defeat</span>.
              </p>
            </section>

            <section className="mb-5 space-y-2 text-sm leading-relaxed text-zinc-200">
              <h3 className="font-semibold text-zinc-100">Điều khiển trong combat</h3>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-zinc-800">
                  <tr>
                    <td className="py-1.5 pr-3 font-mono text-zinc-400">Click ô hex kế hero</td>
                    <td className="py-1.5">Move 1 bước (1 AP) — chỉ adjacent</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 font-mono text-zinc-400">Click enemy</td>
                    <td className="py-1.5">Chọn làm target</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 font-mono text-zinc-400">Attack</td>
                    <td className="py-1.5">Tấn công target adjacent (1 AP)</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 font-mono text-zinc-400">Defend</td>
                    <td className="py-1.5">+ phòng thủ 1 turn (1 AP)</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 font-mono text-zinc-400">End turn</td>
                    <td className="py-1.5">Nhường lượt → enemy AI di chuyển + tấn công, AP hồi về 3</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 font-mono text-zinc-400">Drag canvas</td>
                    <td className="py-1.5">Pan camera</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 font-mono text-zinc-400">Wheel</td>
                    <td className="py-1.5">Zoom in/out</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="mb-5 space-y-2 text-sm leading-relaxed text-zinc-200">
              <h3 className="font-semibold text-zinc-100">Action Points (AP)</h3>
              <p>
                Mỗi turn bắt đầu với <span className="font-mono text-zinc-100">AP=3</span>.
                Mọi action (move / attack / defend) tốn 1 AP. Khi không còn AP,
                bạn buộc phải End turn.
              </p>
            </section>

            <section className="mb-5 space-y-3 text-sm leading-relaxed text-zinc-200">
              <h3 className="font-semibold text-zinc-100">Element wheel</h3>
              <p>
                Mỗi hero/enemy có 1 element. Element A &quot;strong-vs&quot; element B →
                A đánh B nhận <span className="text-amber-300">+50% damage</span>.
                Cùng element = 1.0×. Bị counter = 0.5×.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ELEMENT_CYCLE.map((e) => (
                  <div
                    key={e.name}
                    className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ background: e.color }}
                      />
                      <span className="font-semibold">{e.name}</span>
                    </div>
                    <div className="mt-1 text-zinc-400">
                      Counter → <span className="text-zinc-300">{e.strongVs}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-5 space-y-2 text-sm leading-relaxed text-zinc-200">
              <h3 className="font-semibold text-zinc-100">Hero roster</h3>
              <p>
                Mỗi level hero khác nhau (rotate theo level number): Aevra (Ember),
                Kyo (Void), Lyra (Sky), Brann (Verdant). HP scale theo level —
                level càng cao, hero càng &quot;trâu&quot;.
              </p>
            </section>

            <section className="space-y-2 text-sm leading-relaxed text-zinc-200">
              <h3 className="font-semibold text-zinc-100">Save & Resume</h3>
              <p>
                Run state auto-save server-side sau mỗi action. Click{" "}
                <span className="font-mono">← Realms</span> bất kỳ lúc nào để
                tạm dừng — quay lại Resume từ menu chính.
              </p>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
};
