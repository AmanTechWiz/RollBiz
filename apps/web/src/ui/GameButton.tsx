import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

type Variant = "primary" | "go" | "sun" | "danger" | "ghost";

// [base (the "3D" side), face]
const VARIANTS: Record<Variant, [string, string]> = {
  primary: ["bg-brand-dark", "bg-brand text-white"],
  go: ["bg-go-dark", "bg-go text-white"],
  sun: ["bg-sun-dark", "bg-sun text-brand-ink"],
  danger: ["bg-berry-dark", "bg-berry text-white"],
  ghost: ["bg-brand-ink/20", "bg-white text-brand-ink"],
};

const SPRING = { type: "spring", stiffness: 600, damping: 22 } as const;

type Props = Omit<HTMLMotionProps<"button">, "children"> & {
  variant?: Variant;
  children: ReactNode;
};

/** Chunky button: a darker base with the face sitting on top; the face presses down on tap. */
export function GameButton({ variant = "primary", className = "", disabled, children, ...rest }: Props) {
  const [base, face] = VARIANTS[variant];
  return (
    <motion.button
      type="button"
      disabled={disabled}
      initial="rest"
      whileHover={disabled ? undefined : "hover"}
      whileTap={disabled ? undefined : "pressed"}
      className={`relative block rounded-chunky pb-1.5 text-lg font-semibold outline-none focus-visible:ring-4 focus-visible:ring-sun disabled:opacity-50 ${base} ${className}`}
      {...rest}
    >
      <motion.span
        variants={{
          rest: { y: 0, scale: 1 },
          hover: { y: -2, scale: 1.01 },
          pressed: { y: 6, scale: 0.99 },
        }}
        transition={SPRING}
        className={`block rounded-chunky px-6 py-3 ${face}`}
      >
        {children}
      </motion.span>
    </motion.button>
  );
}
