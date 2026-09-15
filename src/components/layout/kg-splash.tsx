"use client";

import { OWNER_LABEL, MEMBER_LABEL, SHOW_NAMES } from "@/lib/branding";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { KgMark } from "@/components/layout/kg-mark";
import { BRAND_INITIALS, BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

type SplashVariant = "launch" | "route" | "return";

const SPLASH_DURATION: Record<SplashVariant, number> = {
  launch: 3200,
  route: 950,
  return: 1700,
};

/** Minimum time away before welcome-back splash (tab switch / app background). */
const MIN_AWAY_MS = 1200;
/** Avoid spamming welcome-back if user flips tabs quickly. */
const RETURN_COOLDOWN_MS = 6000;

function LaunchParticles() {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: `${(i * 17 + 7) % 100}%`,
    delay: `${(i % 6) * 0.12}s`,
    size: 3 + (i % 3),
  }));

  return (
    <div className="kg-splash-particles" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className="kg-splash-particle"
          style={{
            left: p.left,
            animationDelay: p.delay,
            width: p.size,
            height: p.size,
          }}
        />
      ))}
    </div>
  );
}

function KgSplashMark({ variant }: { variant: SplashVariant }) {
  const isLaunch = variant === "launch";
  const isReturn = variant === "return";

  return (
    <div className={cn("kg-splash-mark", `kg-splash-mark-${variant}`)}>
      {isLaunch && <LaunchParticles />}

      <div className="kg-splash-sweep" aria-hidden />
      <div className="kg-splash-burst" aria-hidden />
      <div className="kg-splash-burst kg-splash-burst-2" aria-hidden />
      <div className="kg-splash-ring kg-splash-ring-1" aria-hidden />
      <div className="kg-splash-ring kg-splash-ring-2" aria-hidden />
      <div className="kg-splash-ring kg-splash-ring-3" aria-hidden />

      <div className="kg-splash-monogram-wrap">
        <div className="kg-splash-monogram-shine" aria-hidden />
        <div className="kg-splash-monogram">
          <KgMark className="kg-splash-rings" />
        </div>
      </div>

      {isLaunch && (
        <div className="kg-splash-wordmark">
          <p className="kg-splash-brand">
            {BRAND_INITIALS.split("").map((letter, index) => (
              <span
                key={`brand-${letter}-${index}`}
                className="kg-splash-brand-letter"
                style={{ animationDelay: `${0.72 + index * 0.12}s` }}
              >
                {letter}
              </span>
            ))}
            <span className="kg-splash-brand-finance">Finance</span>
          </p>
          {SHOW_NAMES ? (
            <p className="kg-splash-tagline">
              <span className="kg-splash-name-owner">{OWNER_LABEL}</span>
              <span className="kg-splash-amp">&</span>
              <span className="kg-splash-name-member">{MEMBER_LABEL}</span>
            </p>
          ) : null}
        </div>
      )}

      {isReturn && (
        <div className="kg-splash-return-copy">
          <p className="kg-splash-welcome">Welcome back!</p>
          <p className="kg-splash-return-sub">{BRAND_NAME}</p>
        </div>
      )}
    </div>
  );
}

function KgSplashOverlay({
  variant,
  splashKey,
  onComplete,
}: {
  variant: SplashVariant;
  splashKey: number;
  onComplete: () => void;
}) {
  useEffect(() => {
    document.body.classList.add("kg-splash-active");
    const timer = window.setTimeout(onComplete, SPLASH_DURATION[variant]);
    return () => {
      window.clearTimeout(timer);
      document.body.classList.remove("kg-splash-active");
    };
  }, [variant, splashKey, onComplete]);

  return (
    <div
      key={splashKey}
      className={cn("kg-splash-root", `kg-splash-root-${variant}`)}
      role="presentation"
      aria-hidden
    >
      <div className="kg-splash-scrim" />
      <div className="kg-splash-mesh" aria-hidden />
      <KgSplashMark variant={variant} />
    </div>
  );
}

export function KgSplashProvider() {
  const pathname = usePathname();
  const [splash, setSplash] = useState<SplashVariant | null>("launch");
  const [splashKey, setSplashKey] = useState(0);
  const launchDoneRef = useRef(false);
  const prevPathRef = useRef(pathname);
  const hiddenAtRef = useRef<number | null>(null);
  const wasAwayRef = useRef(false);
  const splashRef = useRef<SplashVariant | null>("launch");
  const lastReturnAtRef = useRef(0);
  const returnTimerRef = useRef<number | null>(null);

  const completeSplash = useCallback(() => {
    if (splashRef.current === "launch") {
      launchDoneRef.current = true;
    }
    splashRef.current = null;
    setSplash(null);
  }, []);

  const showSplash = useCallback((variant: SplashVariant) => {
    splashRef.current = variant;
    setSplashKey((k) => k + 1);
    setSplash(variant);
  }, []);

  const markAway = useCallback(() => {
    wasAwayRef.current = true;
    hiddenAtRef.current = Date.now();
  }, []);

  const tryWelcomeBack = useCallback(() => {
    if (document.visibilityState === "hidden") return;
    if (!launchDoneRef.current) return;
    if (splashRef.current) return;
    if (!wasAwayRef.current || hiddenAtRef.current == null) return;

    const awayMs = Date.now() - hiddenAtRef.current;
    wasAwayRef.current = false;
    hiddenAtRef.current = null;

    if (awayMs < MIN_AWAY_MS) return;
    if (Date.now() - lastReturnAtRef.current < RETURN_COOLDOWN_MS) return;

    lastReturnAtRef.current = Date.now();
    showSplash("return");
  }, [showSplash]);

  const scheduleWelcomeBack = useCallback(() => {
    if (returnTimerRef.current != null) {
      window.clearTimeout(returnTimerRef.current);
    }
    returnTimerRef.current = window.setTimeout(() => {
      returnTimerRef.current = null;
      tryWelcomeBack();
    }, 80);
  }, [tryWelcomeBack]);

  useEffect(() => {
    if (pathname === prevPathRef.current) return;
    prevPathRef.current = pathname;
    if (!launchDoneRef.current) return;
    showSplash("route");
  }, [pathname, showSplash]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        markAway();
        return;
      }
      scheduleWelcomeBack();
    };

    const onPageHide = () => markAway();

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) scheduleWelcomeBack();
    };

    const onWindowFocus = () => scheduleWelcomeBack();
    const onWindowBlur = () => markAway();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("blur", onWindowBlur);
      if (returnTimerRef.current != null) {
        window.clearTimeout(returnTimerRef.current);
      }
    };
  }, [markAway, scheduleWelcomeBack]);

  if (!splash) return null;

  return (
    <KgSplashOverlay
      variant={splash}
      splashKey={splashKey}
      onComplete={completeSplash}
    />
  );
}
