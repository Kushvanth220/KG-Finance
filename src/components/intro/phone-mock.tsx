"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { DashboardArt } from "@/components/intro/feature-art";

/**
 * A phone that leans toward the cursor.
 *
 * Real perspective, not a flat mockup: the stage has depth, the device tilts
 * on two axes with a spring behind it, and the screen sits a step forward so
 * the bezel parallaxes over it.
 *
 * It also turns as the page scrolls past it — arriving angled, squaring up
 * at the middle of the viewport, turning away as it leaves — so the depth is
 * felt without a pointer at all, which on a phone is the only way it will be.
 *
 * The screen shows `public/intro/dashboard.png` when a real capture exists —
 * drop one in and it appears — and the drawn dashboard otherwise.
 */
export function PhoneMock() {
  const still = useReducedMotion();
  const [capture, setCapture] = useState(true);
  const stage = useRef<HTMLDivElement>(null);

  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springX = useSpring(tiltX, { stiffness: 140, damping: 18, mass: 0.6 });
  const springY = useSpring(tiltY, { stiffness: 140, damping: 18, mass: 0.6 });

  const { scrollYProgress } = useScroll({ target: stage, offset: ["start end", "end start"] });
  const scrollTurn = useTransform(scrollYProgress, [0, 0.5, 1], still ? [0, 0, 0] : [-30, 0, 30]);
  const rotateY = useTransform([scrollTurn, springY], ([a, b]) => (a as number) + (b as number));

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (still) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    tiltY.set(x * 24);
    tiltX.set(-y * 18);
  };
  const onLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <div ref={stage} className="intro-stage" onPointerMove={onMove} onPointerLeave={onLeave}>
      <motion.div
        className="intro-phone"
        style={{ rotateX: springX, rotateY }}
        initial={false}
      >
        <div className="intro-phone-screen">
          {capture ? (
            <Image
              src="/intro/dashboard.png"
              alt="KG Finance dashboard"
              fill
              unoptimized
              priority={false}
              sizes="(max-width: 640px) 70vw, 320px"
              className="object-cover object-top"
              onError={() => setCapture(false)}
            />
          ) : (
            <DashboardArt />
          )}
        </div>
        <span className="intro-phone-notch" aria-hidden="true" />
        <span className="intro-phone-glare" aria-hidden="true" />
      </motion.div>
      <span className="intro-phone-shadow" aria-hidden="true" />
    </div>
  );
}
