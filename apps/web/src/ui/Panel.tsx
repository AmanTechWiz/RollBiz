import type { HTMLAttributes } from "react";

/** Soft glossy white card with rounded corners, the base surface of the Wii U / Switch look. */
export function Panel({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass-card rounded-[1.75rem] p-5 ${className}`} {...rest} />;
}
