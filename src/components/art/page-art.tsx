"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Brain, Check, Smartphone } from "lucide-react";
import { OWNER_LABEL, MEMBER_LABEL } from "@/lib/branding";
import type { Person } from "@/types";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * Small, data-driven pictures for the app's own pages.
 *
 * The rule for every one of these: it must show the page's number or state.
 * A gauge that fills to what was spent, an arrow that points the way money
 * is owed, a phone that only animates while syncing. Nothing here is a
 * decoration a reader could ignore; each one is the page's headline, drawn.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

/* ------------------------------------------------------------------ */
/* The mark, in three dimensions, without WebGL                        */
/* ------------------------------------------------------------------ */

/**
 * Two rings in a slowly turning 3D space. Pure CSS: the right ring stands at
 * an angle to the left one, so as the group turns they read as linked.
 */
export function Rings3D({ size = 40, className }: { size?: number; className?: string }) {
  const stroke = Math.max(3, Math.round(size * 0.13));
  const ring = (gradient: string, transform: string) => (
    <span
      className="absolute inset-0 rounded-full"
      style={{
        background: gradient,
        WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke}px + 0.5px))`,
        mask: `radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke}px + 0.5px))`,
        transform,
        backfaceVisibility: "visible",
      }}
    />
  );

  return (
    <span
      className={cn("kg-rings3d relative inline-block shrink-0", className)}
      style={{ width: size, height: size, perspective: size * 4 }}
      aria-hidden="true"
    >
      <span className="kg-rings3d-spin absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
        {ring("conic-gradient(from 200deg, #0A84FF, #5E5CE6, #0A84FF)", `translateX(${-size * 0.16}px) translateZ(0)`)}
        {ring("conic-gradient(from 20deg, #7F5AF0, #C74FE6, #7F5AF0)", `translateX(${size * 0.16}px) rotateY(72deg)`)}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Arc gauge — a number as a fill                                       */
/* ------------------------------------------------------------------ */

export function ArcGauge({
  value,
  max,
  color = "#007aff",
  track = "rgba(127,127,127,0.18)",
  size = 64,
  label,
  className,
}: {
  value: number;
  max: number;
  color?: string;
  track?: string;
  size?: number;
  /** Text in the middle, e.g. "62%". */
  label?: string;
  className?: string;
}) {
  const still = useReducedMotion();
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  // The arc is 270° so the open mouth at the bottom reads as a dial.
  const sweep = 0.75;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={cn("shrink-0", className)} role="img" aria-label={label}>
      <circle cx="50" cy="50" r="40" fill="none" stroke={track} strokeWidth="10" strokeLinecap="round"
        pathLength={1} strokeDasharray={`${sweep} 1`} transform="rotate(135 50 50)" />
      <motion.circle
        cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        pathLength={1} transform="rotate(135 50 50)"
        initial={{ strokeDasharray: `${still ? share * sweep : 0} 1` }}
        animate={{ strokeDasharray: `${share * sweep} 1` }}
        transition={{ duration: 0.9, ease: EASE }}
      />
      {label ? (
        <text x="50" y="55" textAnchor="middle" fill="currentColor" fontSize="20" fontWeight="600"
          style={{ fontVariantNumeric: "tabular-nums" }}>
          {label}
        </text>
      ) : null}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Balance — the arrow points the way the money owes                */
/* ------------------------------------------------------------------ */

/**
 * `balance` follows the store's sign: positive means the second member owes the
 * owner, negative the other way. The arrow always flies from the one who
 * owes toward the one who is owed, so the picture agrees with the sentence.
 */
export function BetweenArt({
  balance,
  showAmount = true,
  picked = null,
  onPick,
  className,
}: {
  balance: number;
  /** Off when the page already prints the figure large beneath the picture. */
  showAmount?: boolean;
  /** Which person is highlighted, when the avatars act as a filter. */
  picked?: Person | null;
  onPick?: (person: Person) => void;
  className?: string;
}) {
  const still = useReducedMotion();
  const even = Math.abs(balance) < 0.005;
  const memberOwes = balance > 0;
  const amount = Math.abs(balance);

  // The arrow redraws only when the balance actually moves, so motion means
  // something happened. On first paint it is simply there.
  const [seenBalance, setSeenBalance] = useState(balance);
  const [pulse, setPulse] = useState(0);
  if (seenBalance !== balance) {
    setSeenBalance(balance);
    setPulse((count) => count + 1);
  }
  const animateArrow = pulse > 0 && !still;

  const owner = { x: 60, initial: OWNER_LABEL.charAt(0) };
  const member = { x: 260, initial: MEMBER_LABEL.charAt(0) };
  const from = memberOwes ? member : owner;
  const to = memberOwes ? owner : member;
  const dir = to.x > from.x ? 1 : -1;
  const x1 = from.x + dir * 42;
  const x2 = to.x - dir * 42;

  return (
    <svg viewBox="0 0 320 128" className={cn("h-full w-full", className)} role="img"
      aria-label={even ? "All even" : `${formatCurrency(amount)} owed`}>
      <defs>
        <linearGradient id="baK" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0A84FF" /><stop offset="1" stopColor="#5E5CE6" />
        </linearGradient>
        <linearGradient id="baG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7F5AF0" /><stop offset="1" stopColor="#C74FE6" />
        </linearGradient>
      </defs>

      {/* the two people; when even, the rings lean in and touch. Tappable when
          the page wants them as a filter, with a ring on whoever is picked. */}
      <motion.g
        animate={{ x: even ? 62 : 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        onClick={onPick ? () => onPick("kushvanth") : undefined}
        style={{ cursor: onPick ? "pointer" : undefined }}
        role={onPick ? "button" : undefined}
        aria-label={onPick ? `Show what ${OWNER_LABEL} paid` : undefined}
      >
        {picked === "kushvanth" ? <circle cx={owner.x} cy="64" r="37" fill="none" stroke="var(--accent-cyan)" strokeWidth="3" /> : null}
        <circle cx={owner.x} cy="64" r="32" fill="url(#baK)" opacity={picked && picked !== "kushvanth" ? 0.45 : 1} />
        <text x={owner.x} y="72" fill="#fff" fontSize="22" fontWeight="700" textAnchor="middle">{owner.initial}</text>
      </motion.g>
      <motion.g
        animate={{ x: even ? -62 : 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        onClick={onPick ? () => onPick("g") : undefined}
        style={{ cursor: onPick ? "pointer" : undefined }}
        role={onPick ? "button" : undefined}
        aria-label={onPick ? `Show what ${MEMBER_LABEL} paid` : undefined}
      >
        {picked === "g" ? <circle cx={member.x} cy="64" r="37" fill="none" stroke="var(--accent-cyan)" strokeWidth="3" /> : null}
        <circle cx={member.x} cy="64" r="32" fill="url(#baG)" opacity={picked && picked !== "g" ? 0.45 : 1} />
        <text x={member.x} y="72" fill="#fff" fontSize="22" fontWeight="700" textAnchor="middle">{member.initial}</text>
      </motion.g>

      {even ? (
        <motion.text x="160" y="118" fill="#34c759" fontSize="12" fontWeight="600" textAnchor="middle"
          initial={{ opacity: still ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          All even
        </motion.text>
      ) : (
        <>
          <motion.line
            key={`${memberOwes}-${pulse}`}
            x1={x1} y1="64" x2={x2} y2="64"
            stroke="var(--accent-cyan)" strokeWidth="3" strokeLinecap="round"
            initial={animateArrow ? { pathLength: 0, opacity: 1 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: EASE }}
          />
          <motion.polygon
            key={`head-${memberOwes}-${pulse}`}
            points={dir > 0 ? `${x2 + 4},64 ${x2 - 10},56 ${x2 - 10},72` : `${x2 - 4},64 ${x2 + 10},56 ${x2 + 10},72`}
            fill="var(--accent-cyan)"
            initial={animateArrow ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.25 }}
          />
          {animateArrow ? (
            <motion.circle
              key={`ring-${pulse}`}
              cx={to.x} cy="64" r="32"
              fill="none" stroke="var(--accent-cyan)" strokeWidth="3"
              initial={{ opacity: 0.8, scale: 1 }}
              animate={{ opacity: 0, scale: 1.45 }}
              transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
              style={{ transformOrigin: `${to.x}px 64px` }}
            />
          ) : null}
          {showAmount ? (
          <motion.g
            key={`amount-${pulse}`}
            initial={animateArrow ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5, ease: EASE }}
          >
            <rect x="106" y="28" width="108" height="26" rx="9" fill="color-mix(in srgb, var(--accent-cyan) 14%, transparent)" stroke="color-mix(in srgb, var(--accent-cyan) 35%, transparent)" />
            <text x="160" y="46" fill="var(--accent-cyan)" fontSize="14" fontWeight="600" textAnchor="middle"
              style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatCurrency(amount)}
            </text>
          </motion.g>
          ) : null}
        </>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* A bank card, with depth                                              */
/* ------------------------------------------------------------------ */

export function BankCardFace({
  label,
  amount,
  sub,
  tint,
  icon,
  className,
}: {
  label: string;
  amount: number;
  sub?: string;
  tint: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 p-4 text-white shadow-[0_18px_40px_rgba(0,0,0,0.35)]",
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${tint} 0%, color-mix(in srgb, ${tint} 55%, #000) 100%)`,
        aspectRatio: "1.586 / 1",
      }}
    >
      {/* the chip, because it is a card */}
      <span className="absolute left-4 top-4 h-6 w-8 rounded-md bg-gradient-to-br from-yellow-200/80 to-yellow-500/70 opacity-80" />
      <span className="absolute right-4 top-4 opacity-90">{icon}</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.22), transparent 65%)" }}
      />
      <div className="absolute bottom-4 left-4 right-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums leading-none">{formatCurrency(amount)}</p>
        {sub ? <p className="mt-1.5 text-[11px] opacity-80">{sub}</p> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sync — two phones and the wire between them                          */
/* ------------------------------------------------------------------ */

export type SyncArtStatus = "syncing" | "synced" | "offline" | "idle";

export function SyncArt({ status, className }: { status: SyncArtStatus; className?: string }) {
  const still = useReducedMotion();
  const live = status === "syncing";
  const ok = status === "synced" || status === "idle";
  const wire = ok ? "#34c759" : live ? "#007aff" : "rgba(127,127,127,0.5)";

  return (
    <div className={cn("relative flex items-center justify-center gap-3", className)} aria-label={`Sync ${status}`} role="img">
      <Smartphone className="h-9 w-9" style={{ color: wire }} />
      <svg viewBox="0 0 120 24" width="120" height="24" className="shrink-0">
        <path d="M4 12 H116" stroke="rgba(127,127,127,0.25)" strokeWidth="2" strokeLinecap="round" />
        {live && !still ? (
          <>
            {/* A starting cx, or the first paint has none and the SVG complains. */}
            <motion.circle r="3" cy="12" fill="#007aff"
              initial={{ cx: 4 }} animate={{ cx: [4, 116] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }} />
            <motion.circle r="3" cy="12" fill="#5856d6"
              initial={{ cx: 116 }} animate={{ cx: [116, 4] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "linear", delay: 0.55 }} />
          </>
        ) : (
          <motion.path d="M4 12 H116" stroke={wire} strokeWidth="2" strokeLinecap="round"
            initial={{ pathLength: still ? 1 : 0 }} animate={{ pathLength: ok ? 1 : 0.15 }}
            transition={{ duration: 0.8, ease: EASE }} />
        )}
        {ok ? (
          <motion.g initial={{ scale: still ? 1 : 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 18 }}
            style={{ transformOrigin: "60px 12px" }}>
            <circle cx="60" cy="12" r="9" fill="#34c759" />
            <path d="M55.5 12.2 L58.6 15.2 L64.5 9.3" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </motion.g>
        ) : null}
      </svg>
      <Smartphone className="h-9 w-9" style={{ color: wire }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Spend — the moment it lands                                          */
/* ------------------------------------------------------------------ */

const BURST = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const dist = 34 + (i % 3) * 10;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    color: ["#34c759", "#007aff", "#5856d6", "#af52de", "#5ac8fa"][i % 5]!,
    size: 3 + (i % 3),
  };
});

export function SpendDoneArt({ className }: { className?: string }) {
  const still = useReducedMotion();
  return (
    <div className={cn("relative mx-auto h-20 w-20", className)} aria-hidden="true">
      {!still
        ? BURST.map((p, i) => (
            <motion.span
              key={i}
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{ width: p.size, height: p.size, background: p.color, marginLeft: -p.size / 2, marginTop: -p.size / 2 }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
              animate={{ x: p.x, y: p.y, opacity: 0, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.15 + (i % 4) * 0.03, ease: "easeOut" }}
            />
          ))
        : null}
      <motion.span
        className="absolute inset-2 rounded-full bg-[#34c759]/20"
        initial={{ scale: still ? 1 : 0.4, opacity: still ? 1 : 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
      />
      <svg viewBox="0 0 48 48" className="absolute inset-4">
        <motion.path
          d="M12 25 L20 33 L36 16"
          fill="none" stroke="#34c759" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: still ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
        />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline — a list, as a shape                                       */
/* ------------------------------------------------------------------ */

export function Sparkline({
  points,
  color = "#007aff",
  height = 36,
  className,
}: {
  /** Values in order; zeros are fine. */
  points: number[];
  color?: string;
  height?: number;
  className?: string;
}) {
  const still = useReducedMotion();
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const w = 160;
    const max = Math.max(...points, 1);
    const step = w / (points.length - 1);
    const coords = points.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)] as const);
    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${line} L${w} ${height} L0 ${height} Z`;
    return { line, area, last: coords[coords.length - 1]! };
  }, [points, height]);

  if (!path) return null;

  return (
    <svg viewBox={`0 0 160 ${height}`} width="160" height={height} className={cn("shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={path.area} fill="url(#sparkFill)"
        initial={{ opacity: still ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.4 }} />
      <motion.path d={path.line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: still ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: EASE }} />
      <motion.circle cx={path.last[0]} cy={path.last[1]} r="3" fill={color}
        initial={{ scale: still ? 1 : 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8, type: "spring", stiffness: 300, damping: 15 }}
        style={{ transformOrigin: `${path.last[0]}px ${path.last[1]}px` }} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Memory — a pulse with a count                                        */
/* ------------------------------------------------------------------ */

export function MemoryPulse({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn("relative inline-flex h-10 w-10 shrink-0 items-center justify-center", className)} aria-hidden="true">
      {count > 0 ? <span className="kg-pulse absolute inset-0 rounded-full border border-[#af52de]/60" /> : null}
      <span className="absolute inset-1 rounded-full bg-[#af52de]/15" />
      <Brain className="relative h-5 w-5 text-[#af52de]" />
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#af52de] px-1 text-[9px] font-bold text-white tabular-nums">
          {count}
        </span>
      ) : (
        <Check className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-[#34c759] p-0.5 text-white" />
      )}
    </span>
  );
}
