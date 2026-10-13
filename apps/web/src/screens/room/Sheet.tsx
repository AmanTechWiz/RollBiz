import { useEffect, type ReactNode } from "react";
import { GameButton } from "../../ui";

/** Bottom sheet over a dimmed backdrop. Closes on backdrop tap or Escape. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-brand-ink/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="mx-auto flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border border-b-0 border-line shadow-[0_-10px_30px_-10px_rgb(30_80_130_/_0.3)] bg-cream"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 p-4 pb-2">
          <h2 className="text-xl font-bold">{title}</h2>
          <button className="min-h-11 px-2 text-sm font-medium underline" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto overscroll-contain p-4 pt-2">{children}</div>
        <div className="p-4 pt-0 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <GameButton variant="ghost" className="w-full" onClick={onClose}>
            Done
          </GameButton>
        </div>
      </div>
    </div>
  );
}
