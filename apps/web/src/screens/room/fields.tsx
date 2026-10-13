import { useEffect, useRef, useState, type ReactNode } from "react";

export function Field({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="font-semibold">{label}</p>
      {children}
      {note && <p className="text-sm opacity-70">{note}</p>}
    </div>
  );
}

/** Row of preset buttons; the selected one is highlighted. */
export function Chips<T extends string | number>({
  options,
  value,
  onPick,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onPick: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          aria-pressed={o.value === value}
          onClick={() => onPick(o.value)}
          className={`min-h-11 rounded-xl border-2 border-line px-3 text-sm font-semibold disabled:opacity-60 ${
            o.value === value ? "bg-brand text-white" : "bg-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Number input that sends the value ~300 ms after the last valid keystroke.
 * Shows the server value unless the user is typing in it.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onCommit,
  debounceMs = 300,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
  debounceMs?: number;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The latest callback, so a pending timer never calls a stale closure.
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const n = Number(text);
  const valid = text.trim() !== "" && Number.isInteger(n) && n >= min && n <= max;

  function onChange(next: string) {
    setText(next);
    clearTimeout(timer.current);
    const parsed = Number(next);
    if (next.trim() !== "" && Number.isInteger(parsed) && parsed >= min && parsed <= max && parsed !== value) {
      timer.current = setTimeout(() => commit.current(parsed), debounceMs);
    }
  }

  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <input
        inputMode="numeric"
        value={text}
        disabled={disabled}
        aria-invalid={!valid}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          if (!valid) setText(String(value));
        }}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        className={`min-h-11 w-32 rounded-xl border-2 bg-white px-3 text-right tabular-nums disabled:opacity-60 ${
          valid ? "border-line" : "border-berry"
        }`}
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-left disabled:opacity-60"
    >
      <span className="font-medium">{label}</span>
      <span
        className={`flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-line px-0.5 ${
          checked ? "justify-end bg-go" : "justify-start bg-white"
        }`}
      >
        <span className="size-5 rounded-full bg-brand-ink" />
      </span>
    </button>
  );
}
