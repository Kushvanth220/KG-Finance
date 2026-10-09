"use client";

import "./intro.css";

import Link from "next/link";
import { ArrowRight, CodeXml } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { LionFit } from "@/components/brand/lion-dust";
import { markLionPerformed } from "@/components/brand/launch-state";
import { LionReveal } from "@/components/brand/lion-reveal";
import { Wordmark } from "@/components/brand/wordmark";
import { KgMark } from "@/components/layout/kg-mark";
import { INTRO_SEEN_KEY } from "@/components/layout/first-visit-gate";
import { AssistantOrb, DonutArt, FlexArt, SplitArt } from "@/components/intro/feature-art";
import { ArcWipe, ContractingHero } from "@/components/intro/scroll-stage";
import { ScreenWall } from "@/components/intro/screen-wall";
import { FeatureRail, type RailItem } from "@/components/intro/feature-rail";
import { ScreenSwitcher } from "@/components/intro/screen-switcher";

/**
 * The front door.
 *
 * Not a sales page — nobody is buying this — but the one place the app is
 * shown rather than used, and the thing a stranger sees first. It is built
 * as one scroll: the opening fills the screen, contracts into a card to
 * uncover the wall of screens behind it, an arc rises to close that chapter,
 * then the features arrive one at a time against a rail that tracks where
 * you are.
 *
 * The app itself gets none of this on purpose. Scroll theatre earns its
 * place on a page seen once; on a screen opened ten times a day it is a tax.
 */

// The lion takes the top of a phone, above the headline, and the upper right
// of a wide screen — clear of the headline, which runs two lines across it.
const heroFit = (W: number, H: number): LionFit =>
  W < 768 || H > W
    ? { size: Math.min(W * 0.62, H * 0.34), cx: W / 2, cy: H * 0.3 }
    : { size: Math.min(H * 0.42, W * 0.26), cx: W * 0.74, cy: H * 0.28 };

const FEATURES: RailItem[] = [
  {
    key: "spend",
    kicker: "Spend",
    tint: "var(--accent)",
    title: "Every dollar has a category",
    body: "Log it in two taps — or say it out loud. The month draws itself as you go, so where the money went is never a mystery.",
    art: <DonutArt />,
  },
  {
    key: "balance",
    kicker: "Balance",
    tint: "var(--accent-cyan)",
    title: "Who owes whom, to the cent",
    body: "Shared bills split fairly, every payment tracked, one running balance. Settle it and the number goes to zero — and stays there.",
    art: <SplitArt />,
  },
  {
    key: "flex",
    kicker: "Gig income",
    tint: "var(--amber)",
    title: "Base pay under, tips on top",
    body: "Each block logged with its hours. Tips are chased a day later, when they actually land, and stack onto the same bar.",
    art: <FlexArt />,
  },
  {
    key: "assistant",
    kicker: "Assistant",
    tint: "var(--feature)",
    title: "Just tell it",
    body: "A voice assistant that knows the accounts, the bills and the rules. It asks before it writes anything down — always.",
    art: <AssistantOrb />,
  },
];

const FACTS = [
  { b: "Both phones, one truth", s: "Edits from two phones merge by record. Nothing overwrites anything, ever." },
  { b: "Cent-exact", s: "Splits are computed once and never re-rounded, so the shared balance never drifts." },
  { b: "Private by design", s: "No sign-ups, no ads, no one else's data. Two people, one shared key." },
  { b: "Proven, not promised", s: "82 tests over the money maths, the merge, and the payout logic." },
];

// Walking through the front door means the front door has been seen.
function markSeen() {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    // Storage blocked: the gate falls open on its own.
  }
}

export default function IntroPage() {
  const still = useReducedMotion();

  return (
    <div className="intro-root bg-[#02040c]">
      <header className="intro-nav">
        <Link href="/intro" className="flex items-center gap-2.5" aria-label="KG Finance">
          <KgMark className="h-8 w-8" />
          <Wordmark className="text-[17px]" />
        </Link>
        <Link href="/" className="intro-cta" onClick={markSeen}>
          Open the app <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* 1 — the opening, which contracts to uncover the wall */}
      <ContractingHero behind={<ScreenWall />}>
        <div className="relative h-full w-full overflow-hidden">
          {/* The lion gathers itself out of dust; a tap plays it again. */}
          <div className="absolute inset-0">
            <LionReveal fit={heroFit} still={!!still} replayOnTap onFormed={markLionPerformed} />
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(2,4,12,0.88), rgba(2,4,12,0.4) 40%, transparent 65%)",
            }}
          />
          <div className="pointer-events-none relative z-10 flex h-full flex-col justify-end px-5 pb-[9vh] sm:px-10 sm:pb-[14vh] lg:px-16">
            <motion.p
              initial={still ? false : { opacity: 0, y: 14 }}
              animate={still ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent"
            >
              Shared finances · Two phones
            </motion.p>
            <motion.h1
              initial={still ? false : { opacity: 0, y: 22 }}
              animate={still ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="mt-4 max-w-[14ch] text-balance text-[clamp(2.9rem,10vw,7rem)] font-semibold leading-[0.92] tracking-[-0.035em] text-white"
            >
              Two phones. One set of numbers.
            </motion.h1>
            <motion.p
              initial={still ? false : { opacity: 0, y: 16 }}
              animate={still ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.32 }}
              className="mt-6 max-w-md text-[15px] leading-relaxed text-white/60 sm:text-base"
            >
              Spending, income, debts and who owes whom — on one screen, on both phones,
              always in agreement.
            </motion.p>
          </div>
        </div>
      </ContractingHero>

      {/* 2 — the arc closes that chapter and opens the features */}
      <ArcWipe from="var(--accent)" to="var(--feature)">
        <div className="px-5 pb-[12vh] pt-[22vh] text-center sm:px-8">
          <h2 className="mx-auto max-w-[18ch] text-balance text-[clamp(2rem,6.5vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-white">
            Everything two people need to stop guessing
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-white/70">
            Four screens do the work. The rest of the app stays out of the way.
          </p>
        </div>
      </ArcWipe>

      {/* 3 — the rail */}
      <section className="relative bg-[#02040c] py-[14vh]">
        <FeatureRail items={FEATURES} />
      </section>

      {/* 4 — the other six screens, as a stack you scroll through */}
      <ScreenSwitcher />

      {/* 5 — the proof */}
      <section className="relative bg-[#02040c] px-5 pb-[16vh] sm:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-balance text-[clamp(1.8rem,5.5vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
            Built for two, and only two
          </h2>
          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {FACTS.map((fact, i) => (
              <motion.div
                key={fact.b}
                initial={still ? false : { opacity: 0, y: 18 }}
                whileInView={still ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-12%" }}
                transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="border-t border-white/10 pt-4"
              >
                <b className="block text-[15px] font-semibold text-white">{fact.b}</b>
                <span className="mt-1.5 block text-[14px] leading-relaxed text-white/55">{fact.s}</span>
              </motion.div>
            ))}
          </div>

          <div className="mt-14 flex flex-wrap items-center gap-3">
            <Link href="/" className="intro-cta" onClick={markSeen}>
              Open the app <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <a
              href="https://github.com/Kushvanth220/kg-finance"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-[13px] font-medium text-white/80 transition hover:border-white/35 hover:text-white"
            >
              <CodeXml className="h-4 w-4" /> Source
            </a>
          </div>
        </div>
      </section>

      <footer className="intro-foot">
        <span className="flex items-center gap-2">
          <KgMark className="h-5 w-5" /> <Wordmark />
        </span>
        <span>Two phones. One set of numbers.</span>
      </footer>
    </div>
  );
}
