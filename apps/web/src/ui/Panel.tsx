import type { HTMLAttributes } from "react";

/** Rounded card with a thick outline and a hard drop shadow. */
export function Panel({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-3xl border-4 border-brand-ink bg-white p-5 shadow-[0_6px_0_var(--color-brand-ink)] ${className}`}
      {...rest}
    />
  );
}
