"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Real depth for a card.
 *
 * Perspective on the stage, a two-axis tilt on the card that follows the
 * pointer with a spring behind it, and a glare that slides the other way. It
 * is the one 3D device the app pages use — cheap enough for a phone, and it
 * says "this is a thing you could hold" without a single WebGL call.
 */
export function Tilt3D({
  children,
  className,
  max = 10,
  glare = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Degrees of tilt at the card's edge. */
  max?: number;
  glare?: boolean;
}) {
  const still = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const rotateX = useSpring(x, { stiffness: 160, damping: 18, mass: 0.5 });
  const rotateY = useSpring(y, { stiffness: 160, damping: 18, mass: 0.5 });
  const glareAt = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.14), transparent 55%)`;

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (still) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    y.set((px - 0.5) * 2 * max);
    x.set(-(py - 0.5) * 2 * max);
    gx.set(px * 100);
    gy.set(py * 100);
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div style={{ perspective: 900 }} onPointerMove={onMove} onPointerLeave={onLeave}>
      <motion.div
        className={cn("relative", className)}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      >
        {children}
        {glare ? (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ background: glareAt, transform: "translateZ(1px)" }}
          />
        ) : null}
      </motion.div>
    </div>
  );
}
