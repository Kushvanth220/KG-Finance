"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE } from "@/lib/motion-presets";

/**
 * The handover between screens.
 *
 * This replaces the logo that used to appear on every navigation. That was a
 * loading screen for work which had already finished — the next page was
 * ready, so the mark was pure delay, and the same brand moment on the tenth
 * tap of the day is just an obstacle.
 *
 * What is left is a handover, not a wait: the outgoing screen drops away
 * while the incoming one rises into place, in under a quarter of a second.
 * `mode="popLayout"` lets them overlap so the tab bar never sees a gap, and
 * the movement is small — 8px — because the job is to say "this is a
 * different screen", not to perform.
 *
 * It animates the route, never the data: switching person or month inside a
 * page does not pass through here.
 */

const OFFSET = 8;

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const still = useReducedMotion();

  if (still) return <>{children}</>;

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: OFFSET }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -OFFSET }}
        transition={{ duration: 0.22, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
