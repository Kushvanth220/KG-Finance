"use client";

import { useEffect, useMemo } from "react";
import { useBalanceCelebrationStore } from "@/store/balance-celebration-store";

const CONFETTI_COLORS = ["#007aff", "#5856d6", "#af52de", "#ff2d55", "#ff9500", "#34c759", "#ffcc00"];

function ConfettiPiece({ index, seed }: { index: number; seed: string }) {
  const style = useMemo(() => {
    const n = (seed.charCodeAt(index % seed.length) + index * 17) % 100;
    return {
      left: `${(n * 7 + index * 11) % 100}%`,
      animationDelay: `${(n % 40) / 100}s`,
      animationDuration: `${1.8 + (n % 30) / 20}s`,
      backgroundColor: CONFETTI_COLORS[n % CONFETTI_COLORS.length],
      width: `${6 + (n % 4)}px`,
      height: `${10 + (n % 6)}px`,
      borderRadius: n % 2 === 0 ? "999px" : "2px",
    };
  }, [index, seed]);

  return <span className="balance-confetti" style={style} aria-hidden />;
}

export function BalanceCelebrationOverlay() {
  const event = useBalanceCelebrationStore((s) => s.event);
  const dismiss = useBalanceCelebrationStore((s) => s.dismiss);

  useEffect(() => {
    if (!event) return;
    const timer = window.setTimeout(dismiss, 4800);
    return () => window.clearTimeout(timer);
  }, [event, dismiss]);

  if (!event) return null;

  return (
    <div
      className="balance-celebration-root"
      role="status"
      aria-live="polite"
      onClick={dismiss}
    >
      <div className="balance-celebration-backdrop" />

      <div className="balance-confetti-layer" aria-hidden>
        {Array.from({ length: 28 }, (_, i) => (
          <ConfettiPiece key={`${event.id}-${i}`} index={i} seed={event.id} />
        ))}
      </div>

      <div className="balance-celebration-card">
        <div className="balance-sparkle-ring" aria-hidden>
          {event.sparkles.map((sparkle, i) => (
            <span
              key={`${event.id}-sparkle-${i}`}
              className="balance-sparkle"
              style={{ animationDelay: `${i * 0.18}s` }}
            >
              {sparkle}
            </span>
          ))}
        </div>

        <div className="balance-emoji-pop">{event.emoji}</div>

        <p className="balance-celebration-kicker">Balance</p>
        <h2 className="balance-celebration-title">{event.title}</h2>
        <p className="balance-celebration-subtitle">{event.subtitle}</p>
        <p className="balance-celebration-balance">{event.balanceLabel}</p>

        <p className="balance-celebration-hint">Tap anywhere to close</p>
      </div>
    </div>
  );
}
