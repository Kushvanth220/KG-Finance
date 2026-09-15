"use client";

import "./intro.css";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, ChevronDown } from "lucide-react";
import { KgMark } from "@/components/layout/kg-mark";
import { PhoneMock } from "@/components/intro/phone-mock";
import { CardStack } from "@/components/intro/card-stack";
import { Tilt3D } from "@/components/art/tilt-3d";
import { INTRO_SEEN_KEY } from "@/components/layout/first-visit-gate";
import { DonutArt, FlexArt, JarvisOrb, NumbersFilm, SplitArt } from "@/components/intro/feature-art";

/**
 * The front door.
 *
 * Not a sales page — nobody is buying this — but the one place the app is
 * shown rather than used. Three-dimensional where depth says something (the
 * mark is an object; the phone is a thing you could pick up) and flat where
 * it doesn't.
 */

// WebGL has no server-side render; the CSS glow underneath covers the gap.
const RingsScene = dynamic(
  () => import("@/components/intro/rings-scene").then((m) => m.RingsScene),
  { ssr: false }
);

const FEATURES: {
  key: string;
  kicker: string;
  tint: string;
  title: string;
  body: string;
  art: React.ReactNode;
}[] = [
  {
    key: "spend",
    kicker: "Spend",
    tint: "#007aff",
    title: "Every dollar has a category",
    body: "Log it in two taps — or say it. The month draws itself as you go, so where the money went is never a mystery.",
    art: <DonutArt />,
  },
  {
    key: "between",
    kicker: "Balance",
    tint: "#5ac8fa",
    title: "Who owes whom, to the cent",
    body: "Shared bills split fairly, every payment tracked, one running balance. Settle it and the number goes to zero.",
    art: <SplitArt />,
  },
  {
    key: "flex",
    kicker: "Amazon Flex",
    tint: "#0077ff",
    title: "Base pay under, tips on top",
    body: "Each block logged with its hours. Tips are asked about a day later, when they land — and stack onto the same bar.",
    art: <FlexArt />,
  },
  {
    key: "jarvis",
    kicker: "Jarvis",
    tint: "#af52de",
    title: "Just tell it",
    body: "A voice assistant that knows the accounts, the bills and the rules. It asks before it writes anything down.",
    art: <JarvisOrb />,
  },
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
  // A real capture at public/intro/demo.mp4 plays here; until then the
  // drawn loop is the film, not a placeholder.
  const [video, setVideo] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // The <video> starts loading from the server-rendered HTML, so a missing
  // file has usually already failed by the time React attaches onError.
  // Check the element's own record of that after mount.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.error || el.networkState === el.NETWORK_NO_SOURCE) setVideo(false);
  }, []);

  return (
    <div className="intro">
      <div className="intro-ambient" aria-hidden="true" />

      <header className="intro-bar">
        <Link href="/intro" className="flex items-center gap-2.5" aria-label="KG Finance">
          <KgMark className="h-8 w-8" />
          <span className="text-[15px] font-semibold tracking-tight">
            KG <span className="text-[color:var(--intro-muted)] font-medium">Finance</span>
          </span>
        </Link>
        <Link href="/" className="intro-cta" onClick={markSeen}>
          Open the app <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* ---------------- hero ---------------- */}
      <section
        className="intro-hero"
        onPointerMove={(event) => {
          // The copy drifts against the pointer: a second plane in front of
          // the rings, so the hero has depth even before anything is touched.
          const rect = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty("--px", String((event.clientX - rect.left) / rect.width - 0.5));
          event.currentTarget.style.setProperty("--py", String((event.clientY - rect.top) / rect.height - 0.5));
        }}
        onPointerLeave={(event) => {
          event.currentTarget.style.setProperty("--px", "0");
          event.currentTarget.style.setProperty("--py", "0");
        }}
      >
        <div className="intro-hero-scene">
          <RingsScene className="h-full w-full" />
        </div>
        <p className="intro-hero-hint">Drag the rings · tap to pulse</p>
        <div className="intro-hero-copy">
        <div className="intro-parallax">
          <p className="intro-eyebrow">KG Finance</p>
          <h1 className="intro-h1">
            Two people.
            <br />
            <em>One set of numbers.</em>
          </h1>
          <p className="intro-lede">
            A private finance app for two people. Spending, income, debts and who owes
            whom — on one screen, on both phones, always in agreement.
          </p>
          <div className="intro-actions">
            <Link href="/" className="intro-cta" onClick={markSeen}>
              Open the app <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <a href="#screen" className="intro-cta is-ghost">
              See it <ChevronDown className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        </div>
      </section>

      {/* ---------------- phone ---------------- */}
      <section id="screen" className="intro-section intro-reveal">
        <div className="intro-split">
          <div>
            <h2 className="intro-h2">One screen, every answer</h2>
            <p className="intro-p">
              What is available, what is on the cards, what was spent this month, and where it
              stands between the two people. The dashboard is the whole picture — nothing is a
              tap away that should be in front of you.
            </p>
            <p className="intro-p">
              Frosted glass over near-black, big numbers, quiet labels. Built to be read in the
              two seconds you look at your phone in a checkout line.
            </p>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* ---------------- features ---------------- */}
      <section className="intro-section intro-reveal">
        <h2 className="intro-h2">Four things it does well</h2>
        <p className="intro-p">Each one a page, each one honest about the number it shows.</p>
        <div className="intro-grid">
          {FEATURES.map((feature) => (
            <Tilt3D key={feature.key} max={8} className="rounded-[20px]">
              <article className="intro-card">
                <div className="intro-card-art">{feature.art}</div>
                <div className="intro-card-body">
                  <span className="intro-card-kicker" style={{ color: feature.tint }}>
                    <i style={{ background: feature.tint }} /> {feature.kicker}
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </div>
              </article>
            </Tilt3D>
          ))}
        </div>
      </section>

      {/* ---------------- cards ---------------- */}
      <section className="intro-section intro-reveal">
        <div className="intro-split">
          <div>
            <h2 className="intro-h2">Your cards, in hand</h2>
            <p className="intro-p">
              Every account is a card: what is in it, what is owed on it, when it is due. Held
              money and owed money are never added together — they point opposite ways.
            </p>
            <p className="intro-p">
              Add an account once. From then on, every payment you log lands on the right one.
            </p>
          </div>
          <CardStack />
        </div>
      </section>

      {/* ---------------- film ---------------- */}
      <section className="intro-section intro-reveal">
        <h2 className="intro-h2">Numbers, alive</h2>
        <p className="intro-p">
          Money moves through the month, and the figures move with it — counting into place,
          never jumping. Income up, card balance down to zero.
        </p>
        <div className="intro-film">
          {video ? (
            <video
              ref={videoRef}
              src="/intro/demo.mp4"
              autoPlay
              muted
              loop
              playsInline
              onError={() => setVideo(false)}
              aria-label="KG Finance in motion"
            />
          ) : (
            <NumbersFilm />
          )}
        </div>
      </section>

      {/* ---------------- facts ---------------- */}
      <section className="intro-section intro-reveal">
        <h2 className="intro-h2">Built for two, and only two</h2>
        <div className="intro-facts">
          <div className="intro-fact">
            <b>Both phones, one truth</b>
            <span>Every change syncs to the cloud and back. Log a block on one phone, see it on the other.</span>
          </div>
          <div className="intro-fact">
            <b>Cent-exact</b>
            <span>Splits are computed once and never re-rounded, so the shared balance is never off by a penny.</span>
          </div>
          <div className="intro-fact">
            <b>Private by design</b>
            <span>No sign-ups, no ads, no one else&apos;s data. Two people, one shared key.</span>
          </div>
        </div>
        <div className="intro-actions" style={{ marginTop: 32 }}>
          <Link href="/" className="intro-cta" onClick={markSeen}>
            Open the app <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <footer className="intro-foot">
        <span className="flex items-center gap-2">
          <KgMark className="h-5 w-5" /> KG Finance
        </span>
        <span>Two rings, joined. That is the whole idea.</span>
      </footer>
    </div>
  );
}
