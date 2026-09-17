"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Drawn screens for the landing page.
 *
 * Every figure here is invented. The real dashboard shows real balances, and a
 * front door is the one place they must never appear — so these are pictures
 * of the app's shapes, not of its data.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

/* ------------------------------------------------------------------ */
/* Dashboard — the phone screen                                        */
/* ------------------------------------------------------------------ */

export function DashboardArt() {
  return (
    <svg viewBox="0 0 390 844" className="h-full w-full" role="img" aria-label="KG Finance dashboard">
      <defs>
        <radialGradient id="dbGlowA" cx="20%" cy="12%" r="60%">
          <stop offset="0" stopColor="#007aff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#007aff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dbGlowB" cx="85%" cy="6%" r="50%">
          <stop offset="0" stopColor="#5856d6" stopOpacity="0.22" />
          <stop offset="1" stopColor="#5856d6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dbSpend" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#007aff" />
          <stop offset="1" stopColor="#5856d6" />
        </linearGradient>
      </defs>

      <rect width="390" height="844" fill="#000" />
      <rect width="390" height="844" fill="url(#dbGlowA)" />
      <rect width="390" height="844" fill="url(#dbGlowB)" />

      {/* header */}
      <text x="20" y="72" fill="#f5f5f7" fontSize="20" fontWeight="700">Dashboard</text>
      <text x="20" y="92" fill="rgba(235,235,245,.6)" fontSize="11">September 2026</text>
      <rect x="292" y="56" width="78" height="30" rx="10" fill="url(#dbSpend)" />
      <text x="331" y="76" fill="#fff" fontSize="12" fontWeight="600" textAnchor="middle">+ Spend</text>

      {/* person tabs */}
      <rect x="20" y="112" width="350" height="36" rx="12" fill="rgba(44,44,46,.72)" stroke="rgba(255,255,255,.12)" />
      <rect x="24" y="116" width="171" height="28" rx="9" fill="#007aff" />
      <text x="109" y="134" fill="#fff" fontSize="12" fontWeight="600" textAnchor="middle">Kushvanth</text>
      <text x="282" y="134" fill="rgba(235,235,245,.6)" fontSize="12" fontWeight="600" textAnchor="middle">G</text>

      {/* account balance card */}
      <rect x="20" y="168" width="350" height="214" rx="20" fill="rgba(44,44,46,.72)" stroke="rgba(255,255,255,.12)" />
      <rect x="20" y="168" width="350" height="3" rx="1.5" fill="#34c759" opacity="0.9" />
      <text x="40" y="200" fill="#f5f5f7" fontSize="12" fontWeight="600">Account balance</text>
      <text x="350" y="200" fill="#007aff" fontSize="11" fontWeight="600" textAnchor="end">Manage ›</text>
      <text x="40" y="222" fill="rgba(235,235,245,.6)" fontSize="9" letterSpacing="1">AVAILABLE</text>
      <text x="40" y="256" fill="#34c759" fontSize="30" fontWeight="600" style={{ fontVariantNumeric: "tabular-nums" }}>$2,184.50</text>
      <line x1="40" y1="276" x2="350" y2="276" stroke="rgba(255,255,255,.08)" />
      {[
        ["Checking", "$1,420.00"],
        ["Savings", "$640.00"],
        ["Cash wallet", "$124.50"],
      ].map(([name, amount], i) => (
        <g key={name}>
          <text x="40" y={302 + i * 26} fill="#f5f5f7" fontSize="12">{name}</text>
          <text x="350" y={302 + i * 26} fill="#f5f5f7" fontSize="12" fontWeight="600" textAnchor="end" style={{ fontVariantNumeric: "tabular-nums" }}>{amount}</text>
        </g>
      ))}

      {/* spending card with donut */}
      <rect x="20" y="398" width="350" height="230" rx="20" fill="rgba(44,44,46,.72)" stroke="rgba(255,255,255,.12)" />
      <text x="40" y="430" fill="#f5f5f7" fontSize="12" fontWeight="600">Spending</text>
      <text x="350" y="430" fill="rgba(235,235,245,.6)" fontSize="10" textAnchor="end">This month</text>
      <g transform="translate(110 528)">
        <circle r="58" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="16" />
        <circle r="58" fill="none" stroke="#007aff" strokeWidth="16" pathLength={100} strokeDasharray="42 100" transform="rotate(-90)" />
        <circle r="58" fill="none" stroke="#34c759" strokeWidth="16" pathLength={100} strokeDasharray="27 100" strokeDashoffset={-42} transform="rotate(-90)" />
        <circle r="58" fill="none" stroke="#ff9500" strokeWidth="16" pathLength={100} strokeDasharray="19 100" strokeDashoffset={-69} transform="rotate(-90)" />
        <circle r="58" fill="none" stroke="#af52de" strokeWidth="16" pathLength={100} strokeDasharray="12 100" strokeDashoffset={-88} transform="rotate(-90)" />
        <text y="-2" fill="#f5f5f7" fontSize="16" fontWeight="600" textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }}>$1,362</text>
        <text y="14" fill="rgba(235,235,245,.6)" fontSize="9" textAnchor="middle">spent</text>
      </g>
      {[
        ["#007aff", "Groceries", "$572"],
        ["#34c759", "Fuel", "$368"],
        ["#ff9500", "Eating out", "$259"],
        ["#af52de", "Phone", "$163"],
      ].map(([color, name, amount], i) => (
        <g key={name} transform={`translate(200 ${482 + i * 26})`}>
          <circle cx="4" cy="-4" r="4" fill={color} />
          <text x="16" fill="#f5f5f7" fontSize="11">{name}</text>
          <text x="150" fill="#f5f5f7" fontSize="11" fontWeight="600" textAnchor="end" style={{ fontVariantNumeric: "tabular-nums" }}>{amount}</text>
        </g>
      ))}

      {/* balance strip */}
      <rect x="20" y="644" width="350" height="72" rx="20" fill="rgba(44,44,46,.72)" stroke="rgba(255,255,255,.12)" />
      <text x="40" y="672" fill="rgba(235,235,245,.6)" fontSize="9" letterSpacing="1">BALANCE</text>
      <text x="40" y="698" fill="#f5f5f7" fontSize="14" fontWeight="600">G owes Kushvanth</text>
      <text x="350" y="698" fill="#5ac8fa" fontSize="18" fontWeight="600" textAnchor="end" style={{ fontVariantNumeric: "tabular-nums" }}>$318.40</text>

      {/* bottom nav */}
      <rect x="20" y="748" width="350" height="64" rx="24" fill="rgba(44,44,46,.86)" stroke="rgba(255,255,255,.12)" />
      {(
        [
          ["Home", 74, "#007aff"],
          ["Spend", 156, "#fff"],
          ["Balance", 238, "rgba(235,235,245,.6)"],
          ["More", 320, "rgba(235,235,245,.6)"],
        ] as [string, number, string][]
      ).map(([label, x, color]) =>
        label === "Spend" ? (
          <g key={label}>
            <circle cx={x} cy="768" r="22" fill="url(#dbSpend)" />
            <text x={x} y="774" fill="#fff" fontSize="18" fontWeight="600" textAnchor="middle">+</text>
            <text x={x} y="804" fill="#fff" fontSize="9" textAnchor="middle">Spend</text>
          </g>
        ) : (
          <g key={label}>
            <rect x={x - 8} y="762" width="16" height="16" rx="4" fill={color} opacity={label === "Home" ? 1 : 0.6} />
            <text x={x} y="798" fill={color} fontSize="9" textAnchor="middle">{label}</text>
          </g>
        )
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Spend — a donut that draws itself                                   */
/* ------------------------------------------------------------------ */

const SLICES = (
  [
    { color: "#007aff", share: 0.42, label: "Groceries" },
    { color: "#34c759", share: 0.27, label: "Fuel" },
    { color: "#ff9500", share: 0.19, label: "Eating out" },
    { color: "#af52de", share: 0.12, label: "Phone" },
  ] as const
).reduce<{ color: string; share: number; label: string; from: number }[]>((acc, slice) => {
  const from = acc.reduce((sum, s) => sum + s.share, 0);
  acc.push({ ...slice, from });
  return acc;
}, []);

export function DonutArt() {
  const still = useReducedMotion();

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label="Spending by category">
      <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="22" />
      {SLICES.map((slice) => {
        const from = slice.from;
        return (
          <motion.circle
            key={slice.label}
            cx="100"
            cy="100"
            r="70"
            fill="none"
            stroke={slice.color}
            strokeWidth="22"
            strokeLinecap="butt"
            transform="rotate(-90 100 100)"
            initial={{ pathLength: still ? slice.share : 0, pathOffset: from }}
            whileInView={{ pathLength: slice.share, pathOffset: from }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.9, ease: EASE, delay: from * 0.9 }}
          />
        );
      })}
      <text x="100" y="96" fill="#f5f5f7" fontSize="22" fontWeight="600" textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }}>$1,362</text>
      <text x="100" y="116" fill="rgba(235,235,245,.6)" fontSize="10" textAnchor="middle">this month</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Balance — who owes whom                                          */
/* ------------------------------------------------------------------ */

export function SplitArt() {
  const still = useReducedMotion();
  return (
    <svg viewBox="0 0 320 160" className="h-full w-full" role="img" aria-label="Shared balance">
      <defs>
        <linearGradient id="spK" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0A84FF" />
          <stop offset="1" stopColor="#5E5CE6" />
        </linearGradient>
        <linearGradient id="spG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7F5AF0" />
          <stop offset="1" stopColor="#C74FE6" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="80" r="34" fill="url(#spK)" />
      <text x="60" y="88" fill="#fff" fontSize="22" fontWeight="700" textAnchor="middle">K</text>
      <circle cx="260" cy="80" r="34" fill="url(#spG)" />
      <text x="260" y="88" fill="#fff" fontSize="22" fontWeight="700" textAnchor="middle">G</text>

      {/* the arrow travels from the one who owes to the one who is owed */}
      <motion.line
        x1="218" y1="80" x2="102" y2="80"
        stroke="#5ac8fa" strokeWidth="3" strokeLinecap="round"
        initial={{ pathLength: still ? 1 : 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.8, ease: EASE }}
      />
      <motion.polygon
        points="98,80 112,72 112,88"
        fill="#5ac8fa"
        initial={{ opacity: still ? 1 : 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ delay: 0.7, duration: 0.3 }}
      />
      <motion.g
        initial={{ opacity: still ? 1 : 0, y: still ? 0 : 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ delay: 0.5, duration: 0.5, ease: EASE }}
      >
        <rect x="112" y="46" width="96" height="24" rx="8" fill="rgba(44,44,46,.9)" stroke="rgba(255,255,255,.12)" />
        <text x="160" y="62" fill="#5ac8fa" fontSize="13" fontWeight="600" textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }}>$318.40</text>
      </motion.g>
      <text x="160" y="126" fill="rgba(235,235,245,.6)" fontSize="11" textAnchor="middle">G owes Kushvanth</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Amazon Flex — base pay under tips                                    */
/* ------------------------------------------------------------------ */

const WEEK: { day: string; base: number; tip: number }[] = [
  { day: "Mon", base: 64, tip: 12 },
  { day: "Tue", base: 88, tip: 21 },
  { day: "Wed", base: 0, tip: 0 },
  { day: "Thu", base: 106, tip: 18 },
  { day: "Fri", base: 72, tip: 26 },
  { day: "Sat", base: 128, tip: 34 },
  { day: "Sun", base: 44, tip: 8 },
];

export function FlexArt() {
  const still = useReducedMotion();
  const max = 170;
  const chartH = 120;
  const barW = 26;
  const gap = 14;

  return (
    <svg viewBox="0 0 320 170" className="h-full w-full" role="img" aria-label="Amazon Flex week">
      {WEEK.map((d, i) => {
        const x = 18 + i * (barW + gap);
        const baseH = (d.base / max) * chartH;
        const tipH = (d.tip / max) * chartH;
        const bottom = 140;
        return (
          <g key={d.day}>
            <motion.rect
              x={x} y={bottom - baseH} width={barW} height={baseH} rx="4" fill="#0077ff"
              style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
              initial={{ scaleY: still ? 1 : 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.7, ease: EASE, delay: i * 0.06 }}
            />
            <motion.rect
              x={x} y={bottom - baseH - tipH} width={barW} height={tipH} rx="4" fill="#34c759"
              style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
              initial={{ scaleY: still ? 1 : 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.25 + i * 0.06 }}
            />
            {d.base > 0 ? (
              <text x={x + barW / 2} y={bottom - baseH - tipH - 6} fill="#f5f5f7" fontSize="9" textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }}>
                ${d.base + d.tip}
              </text>
            ) : null}
            <text x={x + barW / 2} y="158" fill="rgba(235,235,245,.6)" fontSize="9" textAnchor="middle">{d.day}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Assistant — the listening orb                                          */
/* ------------------------------------------------------------------ */

export function AssistantOrb() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <span className="intro-orb-ring" style={{ animationDelay: "0s" }} />
      <span className="intro-orb-ring" style={{ animationDelay: "0.9s" }} />
      <span className="intro-orb-ring" style={{ animationDelay: "1.8s" }} />
      <span className="intro-orb" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Numbers, alive — the film loop                                       */
/* ------------------------------------------------------------------ */

/**
 * A canvas "screen recording": figures counting into place on dark glass with
 * light moving behind it. Stands in until a real capture is dropped into
 * public/intro/demo.mp4, and is honest content in its own right.
 */
export function NumbersFilm({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rows = [
      { label: "Income", to: 4820, color: "#34c759", sign: "+" },
      { label: "Spent", to: 1362, color: "#f5f5f7", sign: "" },
      { label: "Amazon Flex", to: 1236.5, color: "#0077ff", sign: "+" },
      { label: "Card balance", to: 0, from: 918, color: "#ff3b30", sign: "" },
    ];

    let frame = 0;
    let start = performance.now();
    const LOOP = 6500;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const money = (n: number) =>
      `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

    const draw = (now: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const elapsed = still ? LOOP * 0.6 : (now - start) % LOOP;
      const t = elapsed / 1000;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);

      // light moving like slow water behind the glass
      const gx = w * (0.3 + 0.2 * Math.sin(t * 0.5));
      const gy = h * (0.4 + 0.15 * Math.cos(t * 0.35));
      const g1 = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.6);
      g1.addColorStop(0, "rgba(0,122,255,0.35)");
      g1.addColorStop(1, "rgba(0,122,255,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);
      const px = w * (0.75 - 0.15 * Math.sin(t * 0.4));
      const py = h * (0.7 + 0.1 * Math.sin(t * 0.6));
      const g2 = ctx.createRadialGradient(px, py, 0, px, py, w * 0.5);
      g2.addColorStop(0, "rgba(88,86,214,0.3)");
      g2.addColorStop(1, "rgba(88,86,214,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      // the glass
      const pad = Math.max(16, w * 0.06);
      const cardX = pad;
      const cardY = pad;
      const cardW = w - pad * 2;
      const cardH = h - pad * 2;
      ctx.fillStyle = "rgba(44,44,46,0.72)";
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 20);
      ctx.fill();
      ctx.stroke();

      const rowH = cardH / (rows.length + 0.6);
      const font = Math.max(13, Math.min(22, w * 0.035));
      rows.forEach((row, i) => {
        const y = cardY + rowH * (i + 1);
        const local = Math.min(1, Math.max(0, (elapsed - 400 - i * 500) / 1600));
        const p = ease(local);
        const from = row.from ?? 0;
        const value = from + (row.to - from) * p;

        ctx.fillStyle = "rgba(235,235,245,0.6)";
        ctx.font = `500 ${font * 0.72}px Geist, -apple-system, system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(row.label.toUpperCase(), cardX + 24, y);

        ctx.fillStyle = row.color;
        ctx.font = `600 ${font}px Geist, -apple-system, system-ui, sans-serif`;
        ctx.textAlign = "right";
        ctx.fillText(`${row.sign}${money(Math.round(value * 100) / 100)}`, cardX + cardW - 24, y);
      });

      if (!still) frame = requestAnimationFrame(draw);
    };

    if (still) {
      draw(performance.now());
    } else {
      start = performance.now();
      frame = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-label="Figures counting into place" role="img" />;
}
