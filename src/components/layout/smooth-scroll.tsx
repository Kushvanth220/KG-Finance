"use client";

import { useEffect } from "react";
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
 * Touch devices keep the native scroll. Phone browsers already have their own
 * momentum, tuned by the platform and expected by the thumb; overriding it
 * makes a familiar gesture feel wrong, and costs a frame budget the phone
 * would rather spend elsewhere.
 *
 * `prefers-reduced-motion` turns the whole thing off — for some people this
 * effect is not styling, it is nausea.
 */
export function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) return;

    const lenis = new Lenis({
      duration: 0.9,
      // Fast out, long settle: the page answers immediately, then eases.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      // Native momentum on phones; see above.
      syncTouch: false,
      touchMultiplier: 1.6,
    });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  // A new screen starts at its top. Lenis keeps its own scroll position, so
  // without this a short page can open halfway down the one before it.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return null;
}
