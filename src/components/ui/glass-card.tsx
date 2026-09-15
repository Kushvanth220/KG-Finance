"use client";

import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  strong?: boolean;
  onClick?: () => void;
  /** Opt out of the pointer highlight for dense or nested cards. */
  flat?: boolean;
}

export function GlassCard({ children, className, strong, onClick, flat }: GlassCardProps) {
  // Feed the pointer position to the CSS gradient so the glass catches light
  // where you actually are. Writing custom properties keeps this off React's
  // render path — no state, no re-render per mouse move.
  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--kg-mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--kg-my", `${event.clientY - rect.top}px`);
  }, []);

  return (
    <div
      className={cn(
        "rounded-[var(--card-radius)] p-5 transition-all duration-300",
        strong ? "glass-strong" : "glass",
        !flat && "kg-spotlight kg-lift",
        onClick && "tap-card cursor-pointer focus-ring",
        className
      )}
      onPointerMove={flat ? undefined : handlePointerMove}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              // A div acting as a button still needs Enter/Space to work.
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
