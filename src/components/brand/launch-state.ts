/**
 * What the launch screen and the rest of the app agree on.
 *
 * Two things:
 *  - Whether the lion has already performed on this page. The intro marks
 *    it, so walking from the intro into the app does not play it twice in a
 *    row; a reload, a new visit or coming back to the tab always plays.
 *  - Whether the page content is held back. On the first load the dashboard
 *    waits while the lion forms: mounting it and its charts in the same
 *    moments takes exactly the frames the dust needs, and on a laptop GPU
 *    that was the difference between a smooth entrance and a slideshow. The
 *    content is released the moment the lion settles or the entrance is
 *    skipped — and after MAX_HOLD_MS regardless, so a broken entrance can
 *    never keep the app away.
 */

const MAX_HOLD_MS = 8000;

type Launch = "play" | "rest";

let performed = false;
// Decided once per mount of the launch screen, on the client.
let launch: Launch | null = null;
let held = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export function subscribeLaunch(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** How the launch screen opens: the full entrance, or the resting lion. */
export function launchMode(): Launch {
  if (launch) return launch;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  launch = performed || still ? "rest" : "play";
  if (launch === "play") {
    held = true;
    window.setTimeout(releaseContent, MAX_HOLD_MS);
  }
  return launch;
}

/** True while the page content should wait for the lion. */
export function contentHeld(): boolean {
  return launchMode() === "play" && held;
}

export function releaseContent() {
  if (!held) return;
  held = false;
  emit();
}

/** The launch screen is leaving the page; the next mount decides afresh. */
export function endLaunch() {
  launch = null;
  releaseContent();
}

export function markLionPerformed() {
  performed = true;
}

// Whether the launch screen is covering the page. Entrances that belong to a
// page (the balance see-saw) wait for it, so they are seen, not played behind it.
let covering = false;
const uncovered = new Set<() => void>();

export function setSplashCovering(up: boolean) {
  covering = up;
  if (up) return;
  uncovered.forEach((resolve) => resolve());
  uncovered.clear();
}

/** Resolves once the launch screen is out of the way — at once if it is not up. */
export function afterSplash(): Promise<void> {
  return covering ? new Promise((resolve) => uncovered.add(resolve)) : Promise.resolve();
}
