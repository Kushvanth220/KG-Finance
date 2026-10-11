/**
 * What the launch screen and the rest of the app agree on.
 *
 * Three things:
 *  - Whether the lion has already performed on this page. The intro marks
 *    it, so walking from the intro into the app does not play it twice in a
 *    row.
 *  - How long the app has been out of sight. Coming back after five minutes
 *    or more replays the entrance; coming back sooner does not. That holds
 *    whether the tab was simply hidden or the browser reloaded it while you
 *    were away (phones do), because the moment you left is kept in this
 *    tab's session storage. A brand-new tab is a new visit and always plays.
 *  - Whether the page content is held back. On the first load the dashboard
 *    waits while the lion forms: mounting it and its charts in the same
 *    moments takes exactly the frames the dust needs, and on a laptop GPU
 *    that was the difference between a smooth entrance and a slideshow. The
 *    content is released the moment the lion settles or the entrance is
 *    skipped — and after MAX_HOLD_MS regardless, so a broken entrance can
 *    never keep the app away.
 */

const MAX_HOLD_MS = 8000;

/** Away at least this long, and coming back plays the entrance again. */
export const AWAY_REPLAY_MS = 5 * 60 * 1000;
export const LAST_SEEN_KEY = "kg-last-seen";

type Store = Pick<Storage, "getItem" | "setItem">;

const session = (): Store | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage blocked: every return counts as a long absence
  }
};

/** Back after `awayMs` out of sight: does the entrance play again? */
export function replaysAfterAway(awayMs: number): boolean {
  return awayMs >= AWAY_REPLAY_MS;
}

/** The app is leaving the screen now: a tab switch, a navigation, a reload. */
export function markLeft(at = Date.now(), store: Store | null = session()) {
  try {
    store?.setItem(LAST_SEEN_KEY, String(at));
  } catch {
    // Storage full or blocked: the next load plays, which is harmless.
  }
}

/** How long this tab has been away from the app. Infinity when it never showed it. */
export function awayFor(now = Date.now(), store: Store | null = session()): number {
  try {
    const at = Number(store?.getItem(LAST_SEEN_KEY));
    return at > 0 ? Math.max(0, now - at) : Infinity;
  } catch {
    return Infinity;
  }
}

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

/**
 * How the launch screen opens: the full entrance, or the resting lion while
 * the data loads. A reload, or a return within five minutes, rests.
 */
export function launchMode(): Launch {
  if (launch) return launch;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  launch = performed || still || !replaysAfterAway(awayFor()) ? "rest" : "play";
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
