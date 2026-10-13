import { motion } from "motion/react";

// Pip positions on a 3x3 grid (cell indexes 0-8) for faces 1-6.
const FACES: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** Placeholder die face; pops in whenever the value changes. */
export function Die({ value }: { value: number }) {
  const pips = FACES[value] ?? [];
  return (
    <motion.div
      key={value}
      initial={{ scale: 0.4, rotate: -30 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 15 }}
      className="glass-card grid size-16 grid-cols-3 grid-rows-3 gap-1 rounded-2xl p-2.5"
      aria-label={`Die showing ${value}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`rounded-full ${pips.includes(i) ? "bg-gradient-to-b from-[#ff6b81] to-[#e0294a] shadow-inner" : ""}`} />
      ))}
    </motion.div>
  );
}
