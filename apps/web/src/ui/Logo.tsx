import { motion } from "motion/react";

/** A small glossy die used as the RollBiz mark. */
function DieMark({ size }: { size: number }) {
  const pip = "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id="rb-die" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd25e" />
          <stop offset="1" stopColor="#ff8a1f" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="88" height="88" rx="24" fill="url(#rb-die)" stroke="#ffffff" strokeWidth="6" />
      <rect x="16" y="12" width="68" height="26" rx="13" fill="#ffffff" opacity="0.35" />
      {[
        [30, 30],
        [70, 30],
        [50, 50],
        [30, 70],
        [70, 70],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="8" fill={pip} />
      ))}
    </svg>
  );
}

/** RollBiz wordmark: bubbly rounded letters with a cyan gradient, white outline and a soft shadow. */
export function Logo({ size = 64, animate = true }: { size?: number; animate?: boolean }) {
  return (
    <motion.div
      className="flex select-none items-center gap-[0.18em]"
      style={{ fontSize: size }}
      initial={animate ? { scale: 0.6, opacity: 0, rotate: -6 } : false}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 14 }}
    >
      <motion.span
        animate={animate ? { rotate: [0, -12, 8, 0] } : undefined}
        transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
        className="inline-flex drop-shadow-[0_6px_10px_rgb(255_138_31_/_0.35)]"
      >
        <DieMark size={size * 0.95} />
      </motion.span>
      <span
        className="font-bold leading-none tracking-tight"
        style={{
          background: "linear-gradient(180deg, #7fdcff 0%, #1ea4e8 55%, #1468d6 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextStroke: `${Math.max(2, size * 0.05)}px #ffffff`,
          paintOrder: "stroke fill",
          filter: "drop-shadow(0 6px 10px rgb(20 90 160 / 0.3))",
        }}
      >
        RollBiz
      </span>
    </motion.div>
  );
}
