"use client";

import { useEffect, useId, useRef } from "react";
import { afterSplash } from "@/components/brand/launch-state";
import { MEMBER_LABEL, OWNER_LABEL } from "@/lib/branding";
import { seesawTarget, type SeesawTarget } from "@/lib/balance-seesaw";
import { formatCurrency } from "@/lib/formatters";
import type { Person } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The shared balance as a see-saw.
 *
 * Kushvanth sits on the left, G on the right. Coins drop onto the side of
 * whoever is owed, one at a time, and each landing tips the beam further, so
 * the picture says who is owed (the low side) and roughly how much (how many
 * coins, how far it tips) before a word is read.
 *
 * It plays from level every time the page opens. After that it moves only
 * when the balance does: a payment lifts coins off and the beam rises, a
 * flip clears the pile and the coins land on the other side, and all even
 * brings it level. Reduced motion gets the settled picture straight away.
 */

const PIVOT = { x: 160, y: 128 };
const RADIUS = 30;
/** Avatars sit on the beam's top edge. */
const SEAT_Y = 124 - RADIUS - 1;
const SEAT_X: Record<Person, number> = { kushvanth: 60, g: 260 };
/** The pile sits just inside whoever is owed. */
const PILE_X: Record<Person, number> = { kushvanth: 112, g: 208 };
const coinY = (i: number) => 120.5 - i * 4.2;
const BEAM = "color-mix(in srgb, var(--foreground) 26%, transparent)";

// How the beam moves: a damped spring, a falling coin, and a small jolt when one lands.
const STIFFNESS = 34;
const DAMPING = 4.6;
const GRAVITY = 1100;
const LANDING_JOLT = 22;
const FIRST_DROP_S = 0.5;
const NEXT_DROP_S = 0.42;

const SVG = "http://www.w3.org/2000/svg";

interface Nodes {
  beam: SVGGElement;
  pile: SVGGElement;
  air: SVGGElement;
  seats: Record<Person, SVGGElement>;
  bodies: Record<Person, SVGGElement>;
}

function makeCoin(): SVGEllipseElement {
  const coin = document.createElementNS(SVG, "ellipse");
  coin.setAttribute("rx", "8.75");
  coin.setAttribute("ry", "3.15");
  coin.setAttribute("fill", "var(--accent-cyan)");
  coin.setAttribute("stroke", "var(--background)");
  coin.setAttribute("stroke-width", "0.8");
  return coin;
}

function turn(x: number, y: number, deg: number) {
  const a = (deg * Math.PI) / 180, dx = x - PIVOT.x, dy = y - PIVOT.y;
  return { x: PIVOT.x + dx * Math.cos(a) - dy * Math.sin(a), y: PIVOT.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** The beam, its pile and the falling coin — driven outside React, frame by frame, only while something moves. */
function createSeesaw(n: Nodes) {
  let angle = 0;
  let velocity = 0;
  let side: Person | null = null; // whose pile is on the beam right now
  let landed = 0;
  let goal: SeesawTarget = { owed: null, coins: 0, tilt: 0 };
  let falling: { node: SVGEllipseElement; y: number; vy: number } | null = null;
  // The pile's own list: a coin fading out must not be lifted twice.
  const piled: SVGEllipseElement[] = [];
  let wait = FIRST_DROP_S;
  let raf = 0;
  let last = 0;

  const place = () => {
    const a = angle.toFixed(2);
    n.beam.setAttribute("transform", `rotate(${a} ${PIVOT.x} ${PIVOT.y})`);
    // Letters stay upright: each avatar turns back by what the beam turned.
    for (const who of ["kushvanth", "g"] as const) {
      n.seats[who].setAttribute("transform", `translate(${SEAT_X[who]} ${SEAT_Y}) rotate(${(-angle).toFixed(2)})`);
    }
  };

  const stack = (i: number) => {
    const coin = makeCoin();
    coin.setAttribute("transform", `translate(${PILE_X[side ?? "kushvanth"]} ${coinY(i)})`);
    n.pile.append(coin);
    piled.push(coin);
  };

  const lift = () => {
    const top = piled.pop();
    if (!top) return;
    top.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: "forwards" })
      .finished.then(() => top.remove(), () => top.remove());
  };

  const restAngle = () => (side && side === goal.owed && goal.coins ? (goal.tilt * landed) / goal.coins : 0);

  const step = (dt: number) => {
    // A flip, or all even, clears the pile before anything else.
    if (side && side !== goal.owed) {
      while (landed > 0) { lift(); landed -= 1; }
      falling?.node.remove();
      falling = null;
      side = null;
      wait = NEXT_DROP_S;
    }
    // New coins only start once the beam is back near level.
    if (!side && goal.owed && Math.abs(angle) < 0.6) side = goal.owed;
    // A payment lifts coins off the top.
    while (side && landed > goal.coins) { lift(); landed -= 1; }

    if (side && !falling && landed < goal.coins) {
      wait -= dt;
      if (wait <= 0) {
        const node = makeCoin();
        n.air.append(node);
        falling = { node, y: -14, vy: 0 };
      }
    }
    if (falling && side) {
      const home = turn(PILE_X[side], coinY(landed), angle);
      falling.vy += GRAVITY * dt;
      falling.y += falling.vy * dt;
      if (falling.y >= home.y) {
        falling.node.remove();
        falling = null;
        stack(landed);
        landed += 1;
        wait = NEXT_DROP_S;
        velocity += (side === "kushvanth" ? -1 : 1) * LANDING_JOLT;
        n.bodies[side].animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.05)" }, { transform: "scale(1)" }],
          { duration: 300, easing: "ease-out" }
        );
      } else {
        falling.node.setAttribute("transform", `translate(${home.x.toFixed(1)} ${falling.y.toFixed(1)})`);
      }
    }

    const rest = restAngle();
    velocity += (-STIFFNESS * (angle - rest) - DAMPING * velocity) * dt;
    angle += velocity * dt;
    place();

    const done = !falling && side === goal.owed && landed === goal.coins
      && Math.abs(angle - rest) < 0.02 && Math.abs(velocity) < 0.02;
    if (done) { angle = rest; place(); }
    return !done;
  };

  const tick = (now: number) => {
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 0;
    last = now;
    if (step(dt)) raf = requestAnimationFrame(tick);
    else { raf = 0; last = 0; }
  };

  const settleNow = () => {
    falling?.node.remove();
    falling = null;
    n.pile.replaceChildren();
    piled.length = 0;
    side = goal.owed;
    landed = 0;
    for (; landed < goal.coins; landed += 1) stack(landed);
    angle = goal.tilt;
    velocity = 0;
    place();
  };

  return {
    retarget(next: SeesawTarget, still: boolean) {
      goal = next;
      if (still) { cancelAnimationFrame(raf); raf = 0; settleNow(); return; }
      if (!raf) raf = requestAnimationFrame(tick);
    },
    pause() { cancelAnimationFrame(raf); raf = 0; last = 0; },
  };
}

export function BalanceSeesaw({
  balance,
  picked = null,
  onPick,
  className,
}: {
  /** The store's sign: positive means G owes Kushvanth. */
  balance: number;
  /** Which person is highlighted, when the avatars act as a filter. */
  picked?: Person | null;
  onPick?: (person: Person) => void;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const beamRef = useRef<SVGGElement>(null);
  const pileRef = useRef<SVGGElement>(null);
  const airRef = useRef<SVGGElement>(null);
  const kSeatRef = useRef<SVGGElement>(null);
  const gSeatRef = useRef<SVGGElement>(null);
  const kBodyRef = useRef<SVGGElement>(null);
  const gBodyRef = useRef<SVGGElement>(null);
  const seesaw = useRef<ReturnType<typeof createSeesaw> | null>(null);
  const started = useRef(false);

  const { owed, coins, tilt } = seesawTarget(balance);

  useEffect(() => {
    const [beam, pile, air] = [beamRef.current, pileRef.current, airRef.current];
    const [kSeat, gSeat, kBody, gBody] = [kSeatRef.current, gSeatRef.current, kBodyRef.current, gBodyRef.current];
    if (!beam || !pile || !air || !kSeat || !gSeat || !kBody || !gBody) return;
    const current = (seesaw.current ??= createSeesaw({
      beam, pile, air,
      seats: { kushvanth: kSeat, g: gSeat },
      bodies: { kushvanth: kBody, g: gBody },
    }));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;
    const go = () => { if (!cancelled) current.retarget({ owed, coins, tilt }, still); };
    // The first drop waits for the launch screen, so it is seen rather than played behind it.
    if (started.current) go();
    else void afterSplash().then(() => { started.current = true; go(); });
    return () => { cancelled = true; current.pause(); };
  }, [owed, coins, tilt]);

  const amount = Math.abs(balance);
  const label = owed
    ? `${formatCurrency(amount)} owed to ${owed === "kushvanth" ? OWNER_LABEL : MEMBER_LABEL}`
    : "All even";

  const seat = (who: Person, seatRef: typeof kSeatRef, bodyRef: typeof kBodyRef) => {
    const name = who === "kushvanth" ? OWNER_LABEL : MEMBER_LABEL;
    const pick = onPick ? () => onPick(who) : undefined;
    return (
      <g
        ref={seatRef}
        transform={`translate(${SEAT_X[who]} ${SEAT_Y})`}
        onClick={pick}
        onKeyDown={pick ? (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(); }
        } : undefined}
        role={pick ? "button" : undefined}
        tabIndex={pick ? 0 : undefined}
        aria-label={pick ? `Show what ${name} paid` : undefined}
        aria-pressed={pick ? picked === who : undefined}
        className={pick ? "kg-seat" : undefined}
        style={{ cursor: pick ? "pointer" : undefined }}
      >
        {/* Keyboard focus: a round ring, not the browser's square box. */}
        {pick ? (
          <circle className="kg-seat-focus" r={RADIUS + 9} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" />
        ) : null}
        <g ref={bodyRef} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
          {picked === who ? <circle r={RADIUS + 5} fill="none" stroke="var(--accent-cyan)" strokeWidth={3} /> : null}
          <circle r={RADIUS} fill={`url(#seesaw-${who}-${uid})`} opacity={picked && picked !== who ? 0.45 : 1} />
          <text y={7} fill="#fff" fontSize={20} fontWeight={700} textAnchor="middle">
            {name.charAt(0)}
          </text>
        </g>
      </g>
    );
  };

  return (
    <svg viewBox="0 0 320 160" className={cn("h-full w-full overflow-visible", className)} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`seesaw-kushvanth-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="#3781fc" />
        </linearGradient>
        <linearGradient id={`seesaw-g-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#b49cff" />
        </linearGradient>
      </defs>

      <polygon points="160,128 148,151 172,151" fill={BEAM} />
      <g ref={beamRef}>
        <rect x={30} y={124} width={260} height={7} rx={3.5} fill={BEAM} />
        {/* Coins are added and lifted by the see-saw itself, frame by frame. */}
        <g ref={pileRef} />
        {seat("kushvanth", kSeatRef, kBodyRef)}
        {seat("g", gSeatRef, gBodyRef)}
      </g>
      <g ref={airRef} />

      {owed ? null : (
        <text x={160} y={108} fill="var(--success)" fontSize={12} fontWeight={600} textAnchor="middle">
          All even
        </text>
      )}
    </svg>
  );
}
