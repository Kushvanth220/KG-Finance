"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/**
 * Weighted scrolling.
 *
 * The browser moves the page in hard steps that stop the instant your finger
 * does. Lenis puts the scroll position on a spring instead, so a flick carries
 * and settles. It is the single biggest reason a site feels "designed" rather
 * than assembled, and it costs nothing in layout.
 *
 * The numbers here are deliberately tighter than the showreel defaults. This
 * is a utility opened ten times a day, often to hunt one transaction, and a
 * long glide you have to wait out turns into a fight with the page. 0.9s of
 * travel reads as weight; 1.6s reads as lag.
 *
 * Touch devices keep the native scroll, and Lenis is not started there at all.
 * Phone browsers already have their own momentum, tuned by the platform and
 * expected by the thumb. And Lenis listens to every touch with a handler that
 * may cancel it, so the browser had to wait on the page's script before moving
 * at all: while a new page was being built, a swipe simply stuck.
 *
 * `prefers-reduced-motion` turns the whole thing off — for some people this
 * effect is not styling, it is nausea.
 */
export function SmoothScroll() {
  const pathname = usePathname();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touchOnly = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (still || touchOnly) return;

    const lenis = new Lenis({
      duration: 0.9,
      // Fast out, long settle: the page answers immediately, then eases.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // Native momentum on phones; see above.
      syncTouch: false,
      touchMultiplier: 1.6,
    });
    lenisRef.current = lenis;

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // A new screen starts at its top. It runs as the page is put in, before the
  // browser pictures it for the page move; scrolling after that would slide the
  // new page under its own ripple. Lenis is told too and stopped where it is:
  // a glide still running from the last page would otherwise carry on down
  // this one.
  useLayoutEffect(() => {
    const lenis = lenisRef.current;
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return null;
}
