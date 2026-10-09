import { useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";

const noop = () => () => {};

/**
 * True once on the client, false during server render and hydration — the
 * "mounted" flag, without an effect that sets state on mount.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
}

/**
 * `useReducedMotion()` for components whose MARKUP depends on it, not just
 * their styles. The server cannot know the setting and renders the moving
 * version; the first client render has to match that HTML, so the still
 * version takes over only once hydration is done.
 */
export function useHydratedReducedMotion(): boolean {
  const still = useReducedMotion();
  return useIsClient() && Boolean(still);
}
