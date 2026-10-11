import type { ButtonHTMLAttributes } from "react";

type Tone = "plain" | "go" | "danger";

const TONES: Record<Tone, string> = {
  plain: "bg-white",
  go: "bg-go text-white",
  danger: "bg-berry text-white",
};

/** Small secondary button for dense lists. Keeps a 44px tap target. */
export function MiniButton({
  tone = "plain",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-xl border-2 border-brand-ink px-3 text-sm font-semibold active:translate-y-px disabled:opacity-40 ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}
