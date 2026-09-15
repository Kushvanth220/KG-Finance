"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md" | "lg";
  /** Shows a spinner and blocks input — use for async actions. */
  loading?: boolean;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

export function GlassButton({
  children,
  className,
  variant = "primary",
  size = "md",
  disabled,
  loading = false,
  onPointerDown,
  ...props
}: GlassButtonProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);

  // Ripple originates at the pointer, so the feedback tracks where you actually pressed.
  const spawnRipple = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // Reach the furthest corner so the wash always covers the button.
    const size =
      2 *
      Math.max(
        Math.hypot(x, y),
        Math.hypot(rect.width - x, y),
        Math.hypot(x, rect.height - y),
        Math.hypot(rect.width - x, rect.height - y)
      );
    const id = nextId.current++;
    setRipples((current) => [...current, { id, x, y, size }]);
    window.setTimeout(
      () => setRipples((current) => current.filter((r) => r.id !== id)),
      520
    );
  }, []);

  const variants = {
    primary:
      "bg-[#007aff] text-white shadow-lg shadow-[#007aff]/25 hover:bg-[#0a86ff] hover:shadow-xl hover:shadow-[#007aff]/35",
    secondary:
      "glass text-foreground hover:bg-white/80 dark:hover:bg-white/10 hover:shadow-md",
    danger:
      "bg-[#ff3b30] text-white shadow-lg shadow-[#ff3b30]/25 hover:bg-[#ff4d43] hover:shadow-xl hover:shadow-[#ff3b30]/35",
    success:
      "bg-[#34c759] text-white shadow-lg shadow-[#34c759]/25 hover:bg-[#3ad364] hover:shadow-xl hover:shadow-[#34c759]/35",
    ghost: "bg-transparent hover:bg-black/5 dark:hover:bg-white/8",
  };

  const focusRing = {
    primary: "focus-visible:ring-[#007aff]/50",
    secondary: "focus-visible:ring-[#007aff]/40",
    danger: "focus-visible:ring-[#ff3b30]/50",
    success: "focus-visible:ring-[#34c759]/50",
    ghost: "focus-visible:ring-[#007aff]/40",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm rounded-xl min-h-8",
    md: "px-5 py-2.5 text-sm font-medium rounded-2xl min-h-10",
    lg: "px-8 py-4 text-base font-semibold rounded-2xl min-h-12",
  };

  const isBlocked = disabled || loading;

  return (
    <button
      className={cn(
        "btn-press relative isolate overflow-hidden select-none",
        "inline-flex items-center justify-center gap-2",
        "outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "focus-visible:ring-offset-[var(--background)]",
        "disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none",
        variants[variant],
        focusRing[variant],
        sizes[size],
        className
      )}
      disabled={isBlocked}
      aria-busy={loading || undefined}
      onPointerDown={(event) => {
        if (!isBlocked) spawnRipple(event);
        onPointerDown?.(event);
      }}
      {...props}
    >
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="btn-ripple"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: ripple.size,
            height: ripple.size,
          }}
          aria-hidden
        />
      ))}
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}
