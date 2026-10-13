import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

type Variant = "primary" | "go" | "sun" | "danger" | "ghost" | "surface";

// Glossy pill styles: [gradient face, text colour, rim colour]
const VARIANTS: Record<Variant, { face: string; text: string; rim: string }> = {
  primary: { face: "linear-gradient(180deg, #6fd0ff 0%, #1ea4e8 55%, #0f8ad3 100%)", text: "text-white", rim: "#0b78ba" },
  go: { face: "linear-gradient(180deg, #2bd35f 0%, #12b347 55%, #0a9a3b 100%)", text: "text-white [text-shadow:0_2px_0_rgb(0_70_25_/_0.6)]", rim: "#07782e" },
  sun: { face: "linear-gradient(180deg, #ffe58a 0%, #ffc531 55%, #f2ad0f 100%)", text: "text-brand-ink", rim: "#d79a00" },
  danger: { face: "linear-gradient(180deg, #ff9aab 0%, #ff5470 55%, #ec3a58 100%)", text: "text-white", rim: "#cc2643" },
  ghost: { face: "linear-gradient(180deg, #ffffff 0%, #f1f6fa 100%)", text: "text-brand-ink", rim: "#cfdce7" },
  surface: { face: "linear-gradient(180deg, #34407a 0%, #29336a 100%)", text: "text-white", rim: "#121838" },
};

const SPRING = { type: "spring", stiffness: 520, damping: 20 } as const;

type Props = Omit<HTMLMotionProps<"button">, "children"> & {
  variant?: Variant;
  /** Small icon before the label; it wiggles on hover. */
  icon?: ReactNode;
  children: ReactNode;
};

/**
 * Wii/Switch-style glossy pill: a bright gradient face with a soft top highlight, a rim below,
 * a springy lift on hover and a squish on press.
 */
export function GameButton({ variant = "primary", icon, className = "", disabled, children, ...rest }: Props) {
  const v = VARIANTS[variant];
  return (
    <motion.button
      type="button"
      disabled={disabled}
      initial="rest"
      whileHover={disabled ? undefined : "hover"}
      whileTap={disabled ? undefined : "pressed"}
      variants={{ rest: { scale: 1, y: 0 }, hover: { scale: 1.02, y: -2 }, pressed: { scale: 0.96, y: 3 } }}
      transition={SPRING}
      className={`relative block overflow-hidden rounded-full px-6 py-3 text-lg font-semibold outline-none focus-visible:ring-4 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-50 ${v.text} ${className}`}
      style={{
        background: v.face,
        boxShadow: `0 4px 0 ${v.rim}, 0 6px 10px -4px rgb(0 0 0 / 0.35), inset 0 1px 0 rgb(255 255 255 / 0.7)`,
      }}
      {...rest}
    >
      {/* glossy highlight on the top half */}
      {variant !== "surface" && (
        <span className="pointer-events-none absolute inset-x-4 top-1 h-[30%] rounded-full bg-gradient-to-b from-white/30 to-white/0" />
      )}
      <span className="relative inline-flex items-center justify-center gap-2 whitespace-nowrap">
        {icon && (
          <motion.span
            className="inline-flex shrink-0"
            variants={{ rest: { rotate: 0, scale: 1 }, hover: { rotate: [0, -14, 10, 0], scale: 1.15 }, pressed: { scale: 0.9 } }}
            transition={{ duration: 0.5 }}
          >
            {icon}
          </motion.span>
        )}
        {children}
      </span>
    </motion.button>
  );
}
