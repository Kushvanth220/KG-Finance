"use client";

import type { ReactNode } from "react";
import { Brain, Cloud, CreditCard, History, Landmark, LayoutDashboard, Smartphone } from "lucide-react";
import { ScrollStack } from "@/components/ui/stack-switcher";
import { DashboardArt } from "@/components/intro/feature-art";
import { ArcGauge, BankCardFace, MemoryPulse, Sparkline } from "@/components/art/page-art";
import type { StackGeometry } from "@/lib/stack-pose";

/**
 * The rest of the app, as a stack of screens you scroll through — each a
 * card, each with its icon floating on the corner — the way a watch shows the
 * apps it has open.
 *
 * The rail above covers the four screens that do the work; this is the
 * other six, one flick apart, so a stranger sees the whole app without a
 * tour. Like the wall, these are DRAWN screens with invented figures: this
 * page is public and the app holds two people's real money.
 *
 * Colours are written out rather than read from the theme. The front door is
 * one dark world on any device (intro.css), and the app's light-theme tokens
 * are tuned for a pale page, not this one.
 */

const INK = {
  blue: "#3781fc",
  green: "#2fe08a",
  red: "#ff5d73",
  amber: "#ffb020",
  purple: "#a78bfa",
  teal: "#46d1a5",
};

interface Screen {
  key: string;
  name: string;
  icon: typeof Brain;
  tint: string;
  title: string;
  body: string;
  art: ReactNode;
}

const SCREENS: Screen[] = [
  {
    key: "home",
    name: "Home",
    icon: LayoutDashboard,
    tint: INK.blue,
    title: "The month at a glance",
    body: "Cash on hand, what is on the cards, and how fast the month is going.",
    art: <DashboardArt />,
  },
  {
    key: "accounts",
    name: "Accounts",
    icon: CreditCard,
    tint: INK.green,
    title: "Every account, one flick each",
    body: "Banks, cards and cash for each of you, with what is left on every card.",
    // Drawn at a real card's size and scaled down, so the type keeps its
    // proportions instead of spilling out of a card a hundred pixels wide.
    art: (
      <div className="relative h-[190px] w-[200px] shrink-0 scale-50">
        <BankCardFace label="Credit" amount={312.4} tint="#b3303f" className="absolute inset-x-0 top-0 opacity-80" />
        <BankCardFace label="Checking" amount={1420} tint="#0b2cb1" className="absolute inset-x-0 bottom-0" />
      </div>
    ),
  },
  {
    key: "debts",
    name: "Debts",
    icon: Landmark,
    tint: INK.red,
    title: "What is still owed",
    body: "Loans and cards kept apart, each with its next payment and how close it is to zero.",
    art: <ArcGauge value={62} max={100} size={92} color={INK.red} track="rgba(255,255,255,0.1)" label="62%" className="text-white" />,
  },
  {
    key: "history",
    name: "History",
    icon: History,
    tint: INK.amber,
    title: "Every change, kept",
    body: "Each transaction in full, and a record of anything that was deleted.",
    art: <Sparkline points={[4, 9, 6, 12, 8, 15, 11, 18]} color={INK.amber} height={56} className="h-auto w-full" />,
  },
  {
    key: "memory",
    name: "Memory",
    icon: Brain,
    tint: INK.purple,
    title: "What the assistant remembers",
    body: "Bills, reminders and standing rules, all in plain words, all editable.",
    art: <MemoryPulse count={3} className="scale-[1.8]" />,
  },
  {
    key: "sync",
    name: "Cloud Sync",
    icon: Cloud,
    tint: INK.teal,
    title: "Both phones, same numbers",
    body: "Edits merge record by record, so two phones never overwrite each other.",
    art: (
      <div className="flex items-center gap-1.5" style={{ color: INK.teal }}>
        <Smartphone className="h-8 w-8" />
        <span className="h-0.5 w-5 rounded-full bg-current opacity-70" />
        <Smartphone className="h-8 w-8" />
      </div>
    ),
  },
];

const GEOMETRY: StackGeometry = { cardHeight: 232, gap: 14, top: 56, peek: 14, depth: 3 };

function ScreenCard({ screen }: { screen: Screen }) {
  return (
    <div
      className="grid h-full grid-cols-[1fr_112px] gap-3 overflow-hidden rounded-[var(--card-radius)] border border-white/10 p-4 text-white shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
      style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${screen.tint} 22%, #03195b), #03195b 70%)` }}
    >
      <div className="flex min-w-0 flex-col">
        {/* Left padding leaves the corner to the floating icon. */}
        <p className="pl-9 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: screen.tint }}>
          {screen.name}
        </p>
        <h3 className="mt-4 text-balance text-[19px] font-semibold leading-tight tracking-[-0.01em]">{screen.title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-white/60">{screen.body}</p>
      </div>
      <div className="flex items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#02040c]/45 p-1.5">
        {screen.art}
      </div>
    </div>
  );
}

function ScreenIcon({ screen }: { screen: Screen }) {
  const Icon = screen.icon;
  return (
    <span
      className="flex h-11 w-11 items-center justify-center rounded-full"
      style={{
        background: `color-mix(in srgb, ${screen.tint} 26%, #03195b)`,
        color: screen.tint,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${screen.tint} 50%, transparent), 0 8px 20px rgba(0, 0, 0, 0.45)`,
      }}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function ScreenSwitcher() {
  return (
    <ScrollStack
      items={SCREENS}
      getKey={(screen) => screen.key}
      cardLabel={(screen) => `${screen.name}: ${screen.title}`}
      label="The rest of the app"
      geometry={GEOMETRY}
      fadeTo="#02040c"
      className="bg-[#02040c]"
      stageClassName="mx-auto max-w-md"
      header={
        <div className="mx-auto w-full max-w-md shrink-0 px-5 pb-4 pt-[12vh] text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: INK.blue }}>
            The rest of the app
          </p>
          <h2 className="mt-3 text-balance text-[clamp(1.7rem,5vw,2.6rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
            Everything else, one flick away
          </h2>
        </div>
      }
      renderCard={(screen) => <ScreenCard screen={screen} />}
      renderIcon={(screen) => <ScreenIcon screen={screen} />}
    />
  );
}
