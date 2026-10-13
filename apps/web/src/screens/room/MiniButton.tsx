import type { ButtonHTMLAttributes } from "react";

type Tone = "plain" | "go" | "danger";

const TONES: Record<Tone, string> = {
  plain: "bg-gradient-to-b from-white to-[#eef4f9] text-brand-ink border-line",
  go: "bg-gradient-to-b from-[#6fdc94] to-go text-white border-go-dark",
  danger: "bg-gradient-to-b from-[#ff8a9c] to-berry text-white border-berry-dark",
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
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold shadow-sm transition active:scale-95 disabled:opacity-40 ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}
