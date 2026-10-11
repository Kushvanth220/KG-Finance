"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { preload } from "react-dom";
import { LionReveal } from "@/components/brand/lion-reveal";
import { LION_SRC, type LionFit, type LionPlacement } from "@/components/brand/lion-dust";
import {
  AWAY_REPLAY_MS,
  endLaunch,
  launchMode,
  markLeft,
  markLionPerformed,
  releaseContent,
  replaysAfterAway,
  setSplashCovering,
  subscribeLaunch,
} from "@/components/brand/launch-state";
import { Wordmark } from "@/components/brand/wordmark";
import { waitForStoreHydration } from "@/store/finance-store";

/**
 * The launch screen.
 *
 * When someone arrives — a new visit, or coming back after five minutes or
 * more away in another tab, site or app — the lion gathers itself out of
 * ice-blue dust, the name rises under it, and the screen lifts off the app. A
 * tap or a key skips it. Back sooner than that, or a reload, and it is only
 * the lion at rest while the data loads (and nothing at all on a plain tab
 * switch). It never replays over an open dialog (a half-filled form, a photo
 * picker, the assistant), and with reduced motion it is only the resting lion.
 *
 * The server renders it as the bare navy ground, so the app never flashes in
 * first; what to play is decided on the client.
 */

/**
 * From the moment the name starts coming into focus to the lift. Its ten
 * letters take about 1.5s, so this leaves the finished name half a second.
 */
const HOLD_MS = 2000;
/** The lift; matches the opacity transition on `.kg-splash`. */
const LIFT_MS = 600;

const TAGLINE = "Two phones · one set of numbers";

/**
 * armed: shown and waiting, because the tab is hidden — so the first frame on
 * coming back is already the splash, never a flash of the app.
 */
type Phase = "armed" | "dust" | "named";

interface Showing {
  /** Bumps for every entrance, so each gets a fresh canvas. */
  run: number;
  phase: Phase;
  /** Asked to lift: the hold ran out, or it was skipped. */
  out: boolean;
}

const splashFit = (W: number, H: number): LionFit => ({
  size: Math.min(W * 0.66, H * 0.48, 420),
  cx: W / 2,
  cy: H * 0.43,
});

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const dialogOpen = () => document.querySelector('[role="dialog"]') !== null;

export function LaunchSplash() {
  // Fetched while the page is still loading, so the dust can start the moment the app does.
  preload(LION_SRC, { as: "image", fetchPriority: "high" });
  const mode = useSyncExternalStore(subscribeLaunch, launchMode, () => null);
  const [showing, setShowing] = useState<Showing | null>({ run: 0, phase: "dust", out: false });
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The first showing follows the launch mode; every later one is a full entrance.
  const playing = showing !== null && (showing.run > 0 || mode === "play");
  // Never lift off a screen that is still loading.
  const leaving =
    showing !== null &&
    ready &&
    mode !== null &&
    showing.phase !== "armed" &&
    (showing.out || !playing);

  useEffect(() => {
    let off = false;
    void waitForStoreHydration(1200).then(() => {
      if (!off) setReady(true);
    });
    return () => {
      off = true;
      endLaunch();
    };
  }, []);

  // Leaving the tab starts the clock. Back within five minutes: nothing
  // plays. Away five minutes or more: the entrance plays again. Once the five
  // minutes pass the splash is armed in the background, so the first frame on
  // coming back is the lion, not a flash of the app; if the browser's timers
  // slept through it, it starts on the way back in instead.
  useEffect(() => {
    let leftAt = 0;
    let timer = 0;
    const canReplay = () => !reducedMotion() && !dialogOpen();
    const arm = () =>
      setShowing((s) => (s?.phase === "armed" ? s : { run: (s?.run ?? 0) + 1, phase: "armed", out: false }));
    const leave = () => {
      leftAt = Date.now();
      markLeft(leftAt);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (document.visibilityState === "hidden" && canReplay()) arm();
      }, AWAY_REPLAY_MS);
    };
    const comeBack = () => {
      window.clearTimeout(timer);
      if (!leftAt) return;
      const away = Date.now() - leftAt;
      leftAt = 0;
      if (replaysAfterAway(away) && canReplay()) {
        setShowing((s) => (s?.phase === "armed" ? { ...s, phase: "dust" } : { run: (s?.run ?? 0) + 1, phase: "dust", out: false }));
      } else {
        // Back early, or straight into an open form: no entrance.
        setShowing((s) => (s?.phase === "armed" ? null : s));
      }
    };
    const onVisibility = () => (document.visibilityState === "visible" ? comeBack() : leave());
    // A reload or a navigation: remember the moment, so the next load knows how long it has been.
    const onPageHide = () => markLeft();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) comeBack();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const named = playing && showing.phase === "named" && !showing.out;
  useEffect(() => {
    if (!named) return;
    const id = window.setTimeout(
      () => setShowing((s) => s && { ...s, out: true }),
      HOLD_MS
    );
    return () => window.clearTimeout(id);
  }, [named]);

  const skippable = playing && !showing.out && showing.phase !== "armed";
  useEffect(() => {
    if (!skippable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
        releaseContent();
        setShowing((s) => s && { ...s, out: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skippable]);

  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => setShowing(null), LIFT_MS);
    return () => window.clearTimeout(id);
  }, [leaving]);

  // The page counts as uncovered the moment the lift begins.
  const covering = showing !== null && !leaving;
  useEffect(() => {
    setSplashCovering(covering);
  }, [covering]);
  useEffect(() => () => setSplashCovering(false), []);

  if (!showing) return null;

  const placeName = (placement: LionPlacement) => {
    rootRef.current?.style.setProperty("--lion-bottom", `${Math.round(placement.bottom)}px`);
  };

  const formed = () => {
    markLionPerformed();
    setShowing((s) => (s && s.phase === "dust" ? { ...s, phase: "named" } : s));
  };

  const skip = () => {
    releaseContent();
    setShowing((s) => s && { ...s, out: true });
  };

  return (
    <div
      ref={rootRef}
      aria-hidden
      data-lenis-prevent
      className="kg-splash"
      data-live={mode ? "" : undefined}
      data-leaving={leaving ? "" : undefined}
      onPointerDown={skippable ? skip : undefined}
    >
      {mode && showing.phase !== "armed" ? (
        <LionReveal
          key={showing.run}
          fit={splashFit}
          still={!playing}
          onFormed={formed}
          onSettled={releaseContent}
          onLayout={placeName}
        />
      ) : null}
      {/* Mounted only when it rises: nothing waits invisibly under the dust. */}
      {playing && showing.phase === "named" ? (
        <div className="kg-splash-name">
          <Wordmark enter className="kg-splash-word" />
          <span className="kg-splash-tag">{TAGLINE}</span>
        </div>
      ) : null}
    </div>
  );
}
