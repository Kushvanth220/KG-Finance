"use client";

import { DashboardArt, DonutArt, FlexArt, NumbersFilm, SplitArt } from "@/components/intro/feature-art";
import { Parallax } from "@/components/intro/scroll-stage";

/**
 * The wall of product shots the opening panel uncovers.
 *
 * These are DRAWN screens, not captures of the running app, and the figures
 * on them are invented. The app holds two people's real finances and this
 * page is public — a screenshot here would publish their balances. Drawn
 * panels also stay sharp at any size and cost no image requests.
 *
 * Columns drift at different speeds so the wall has depth rather than
 * reading as a flat contact sheet.
 */

const SPEEDS = [70, -40, 95, -25, 55, -60];

function Tile({ children, speed, tall }: { children: React.ReactNode; speed: number; tall?: boolean }) {
  return (
    <Parallax distance={speed} className="w-full">
      <div
        className={`overflow-hidden rounded-2xl border border-white/10 bg-[#03195b] shadow-[0_18px_50px_rgba(0,0,0,0.45)] ${
          tall ? "aspect-[9/16]" : "aspect-[4/5]"
        }`}
      >
        <div className="h-full w-full scale-[1.02] p-2">{children}</div>
      </div>
    </Parallax>
  );
}

export function ScreenWall() {
  const tiles = [
    <DashboardArt key="dash" />,
    <DonutArt key="donut" />,
    <SplitArt key="split" />,
    <FlexArt key="flex" />,
    <NumbersFilm key="numbers" />,
    <DonutArt key="donut2" />,
  ];

  return (
    <div className="relative h-full w-full bg-[#02040c]">
      {/* A soft brand glow behind the wall, so it is not a black grid. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 50% 12%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 70%), radial-gradient(60% 50% at 82% 88%, color-mix(in srgb, var(--feature) 22%, transparent), transparent 72%)",
        }}
      />

      <div className="relative grid h-full grid-cols-3 items-center gap-3 px-3 sm:gap-4 sm:px-6 lg:grid-cols-6 lg:gap-5 lg:px-10">
        {tiles.map((tile, i) => (
          <Tile key={i} speed={SPEEDS[i % SPEEDS.length]!} tall={i % 2 === 1}>
            {tile}
          </Tile>
        ))}
      </div>

      {/* Fade the wall into the section below rather than cutting it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
        style={{ background: "linear-gradient(to top, #02040c, transparent)" }}
      />
    </div>
  );
}
