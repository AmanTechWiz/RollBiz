import type { Toast as ToastData } from "../../hooks/useRoomState";

/** Error toast pinned to the top; the feed hook clears it after a few seconds. */
export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <button
      type="button"
      role="alert"
      onClick={onDismiss}
      className="fixed inset-x-4 top-[max(env(safe-area-inset-top),1rem)] z-50 mx-auto max-w-md rounded-2xl border-4 border-brand-ink bg-berry px-4 py-3 text-left font-semibold text-white shadow-[0_4px_0_var(--color-brand-ink)]"
    >
      {toast.message}
    </button>
  );
}
