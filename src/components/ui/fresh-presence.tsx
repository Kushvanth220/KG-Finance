"use client";

import type { ReactNode } from "react";
import { PresenceContext } from "motion/react";

/**
 * Lets everything inside play its own entrance.
 *
 * `AnimatePresence initial={false}` keeps its first child from animating in,
 * which is what the Home deck wants on load. But Motion hands that "no
 * entrance" down to every motion element inside the child, for as long as the
 * child stays mounted, so the first card's own entrances never played (the
 * page wrapper once did the same to whole pages). Wrapping the child's
 * contents in this cuts it off there: the wrapper still arrives without
 * moving, and its contents animate as written.
 */
export function FreshPresence({ children }: { children: ReactNode }) {
  return <PresenceContext.Provider value={null}>{children}</PresenceContext.Provider>;
}
