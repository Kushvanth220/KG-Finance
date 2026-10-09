"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useReducedMotion } from "motion/react";
import type { FinanceGraph, GraphLeaf, HubKey } from "@/lib/assistant-graph";
import { TONE_COLOR, type WorkspaceActivity } from "@/components/assistant/workspace/workspace-state";

/**
 * The money map's overview: the person at the centre of a small universe.
 *
 * Seven hubs ring the centre on an ellipse sized to the screen, and each
 * hub's nodes fan outward from it — sized by how much money they hold,
 * coloured by how they are doing. Gold light runs along every line all the
 * time, the way the reference pulses; when the assistant reads a hub, the
 * light on that line quickens and continues out to its nodes, and the nodes
 * its answer names ring until the next question.
 *
 * Laid out in screen pixels rather than a fixed viewBox, so text stays
 * readable from a phone to a wide monitor; on a phone, node labels show only
 * where the assistant or you are looking. Drag to pan; zoom from the bar.
 */

interface HubPos {
  key: HubKey;
  x: number;
  y: number;
  angle: number;
}

interface LeafPos {
  leaf: GraphLeaf;
  x: number;
  y: number;
  r: number;
  anchor: "start" | "end";
  /** Where the label's baseline sits; nudged off its neighbours, so not always y. */
  labelY: number;
}

/**
 * Moves labels down, a line at a time, until no two share a line where they
 * overlap sideways. Nodes stay put; only their text shifts, a few pixels.
 */
function separateLabels(leaves: LeafPos[], compact: boolean) {
  const lineHeight = compact ? 12 : 13.5;
  const charWidth = compact ? 5.6 : 6.1;
  const box = (item: LeafPos) => {
    const width = (Math.min(item.leaf.label.length, compact ? 12 : 18) + (compact ? 0 : item.leaf.valueText.length + 2)) * charWidth;
    const start = item.anchor === "start" ? item.x + item.r + 6 : item.x - item.r - 6 - width;
    return { left: start, right: start + width };
  };
  const placed: { left: number; right: number; y: number }[] = [];
  for (const item of [...leaves].sort((a, b) => a.y - b.y)) {
    const { left, right } = box(item);
    let y = item.y;
    for (let guard = 0; guard < 6; guard++) {
      const hit = placed.find((other) => other.left < right && left < other.right && Math.abs(other.y - y) < lineHeight);
      if (!hit) break;
      y = hit.y + lineHeight;
    }
    item.labelY = y;
    placed.push({ left, right, y });
  }
}

function layoutUniverse(graph: FinanceGraph, w: number, h: number, compact: boolean) {
  const rx = w * (compact ? 0.35 : 0.26);
  const ry = h * (compact ? 0.33 : 0.3);
  const n = graph.hubs.length;
  const maxLeaves = compact ? 5 : 8;
  // Two rings, alternating, so neighbouring labels sit at different depths
  // instead of printing over each other where a fan points up or down.
  const dist = compact ? 46 : 86;
  const stagger = compact ? 18 : 38;
  const step = compact ? 0.46 : 0.34;

  const hubs: HubPos[] = graph.hubs.map((hub, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / n;
    return { key: hub.key, x: Math.cos(angle) * rx, y: Math.sin(angle) * ry, angle };
  });

  const leaves: LeafPos[] = [];
  const hidden: Partial<Record<HubKey, number>> = {};
  graph.hubs.forEach((hub, index) => {
    const at = hubs[index]!;
    const shown = hub.leaves.slice(0, maxLeaves);
    hidden[hub.key] = hub.leaves.length - shown.length;
    const max = Math.max(1, ...shown.map((leaf) => leaf.value));
    shown.forEach((leaf, j) => {
      const angle = at.angle + (j - (shown.length - 1) / 2) * step;
      const reach = dist + (j % 2) * stagger;
      leaves.push({
        leaf,
        x: at.x + Math.cos(angle) * reach,
        y: at.y + Math.sin(angle) * reach,
        r: (compact ? 3 : 3.5) + (compact ? 4.5 : 7.5) * Math.sqrt(Math.max(leaf.value, 0) / max),
        anchor: Math.cos(angle) >= -0.2 ? "start" : "end",
        labelY: 0,
      });
    });
  });
  separateLabels(leaves, compact);
  return { hubs, leaves, hidden };
}

/** A gentle curve between two points, bowed to one side by `bend` of its length. */
function curve(x1: number, y1: number, x2: number, y2: number, bend: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${(mx - dy * bend).toFixed(1)} ${(my + dx * bend).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Same numbers every render: a star field that does not jump. */
function seeded(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const CORONA = (() => {
  const random = seeded(7);
  const parts: string[] = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const inner = 37;
    const outer = inner + 4 + random() * 13;
    parts.push(`M${(Math.cos(a) * inner).toFixed(1)} ${(Math.sin(a) * inner).toFixed(1)}L${(Math.cos(a) * outer).toFixed(1)} ${(Math.sin(a) * outer).toFixed(1)}`);
  }
  return parts.join("");
})();

const trimLabel = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function MoneyUniverse({
  graph,
  activity,
  selectedHub,
  selectedLeaf,
  zoom,
  compact,
  onSelectHub,
  onSelectLeaf,
}: {
  graph: FinanceGraph;
  activity: WorkspaceActivity;
  selectedHub: HubKey | null;
  selectedLeaf: string | null;
  zoom: number;
  compact: boolean;
  onSelectHub: (key: HubKey) => void;
  onSelectLeaf: (id: string) => void;
}) {
  const still = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<HubKey | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => layoutUniverse(graph, size.w, size.h, compact), [graph, size, compact]);
  const stars = useMemo(() => {
    const random = seeded(42);
    return Array.from({ length: compact ? 40 : 80 }, () => ({
      x: (random() - 0.5) * size.w,
      y: (random() - 0.5) * size.h,
      r: 0.5 + random() * 1.1,
      delay: random() * 4,
    }));
  }, [size, compact]);

  const thinking = activity.phase === "thinking";
  const active = new Set(activity.activeHubs);
  const lit = new Set(activity.litLeaves);
  const focusHub = hovered ?? selectedHub;
  const dimmed = (key: HubKey) => focusHub !== null && focusHub !== key && !active.has(key);
  const hubByKey = new Map(graph.hubs.map((hub) => [hub.key, hub]));

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest("[data-node]")) return;
    drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    setPan({
      x: drag.current.px + (event.clientX - drag.current.x) / zoom,
      y: drag.current.py + (event.clientY - drag.current.y) / zoom,
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const showLeafLabel = (leaf: GraphLeaf) =>
    !compact || lit.has(leaf.id) || leaf.id === selectedLeaf || leaf.hub === focusHub || active.has(leaf.hub);

  return (
    <div ref={box} className="absolute inset-0 touch-none select-none">
      {size.w > 0 ? (
        <svg
          width={size.w}
          height={size.h}
          viewBox={`${-size.w / 2} ${-size.h / 2} ${size.w} ${size.h}`}
          className="block cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="group"
          aria-label={`${graph.core.label}'s money map`}
        >
          <defs>
            <radialGradient id={`${uid}-orb`} cx="38%" cy="34%" r="70%">
              <stop offset="0" stopColor="#f2efff" />
              <stop offset="0.35" stopColor="#b9adff" />
              <stop offset="0.75" stopColor="#6e5ce6" />
              <stop offset="1" stopColor="#2b2170" />
            </radialGradient>
            <radialGradient id={`${uid}-halo`}>
              <stop offset="0" stopColor="#9b8cff" stopOpacity="0.32" />
              <stop offset="0.55" stopColor="#5ad1c0" stopOpacity="0.07" />
              <stop offset="1" stopColor="#5ad1c0" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${uid}-line`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#d9b26f" />
              <stop offset="1" stopColor="#5ad1c0" />
            </linearGradient>
            <filter id={`${uid}-glow`} x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* One star in three twinkles; the rest hold still at low light. */}
          {stars.map((star, index) => (
            <circle
              key={index}
              cx={star.x}
              cy={star.y}
              r={star.r}
              fill="#e3e8eb"
              opacity={index % 3 === 0 ? undefined : 0.22}
              className={index % 3 === 0 ? "ws-twinkle" : undefined}
              style={index % 3 === 0 ? { animationDelay: `${star.delay}s` } : undefined}
            />
          ))}

          <g transform={`scale(${zoom}) translate(${pan.x} ${pan.y})`}>
            {/* Centre to hubs. */}
            {layout.hubs.map((at) => {
              const on = active.has(at.key) || selectedHub === at.key;
              return (
                <g key={`edge-${at.key}`} opacity={dimmed(at.key) ? 0.25 : 1} style={{ transition: "opacity 300ms" }}>
                  <path
                    id={`${uid}-edge-${at.key}`}
                    d={curve(0, 0, at.x, at.y, 0.12)}
                    fill="none"
                    stroke={`url(#${uid}-line)`}
                    strokeWidth={on ? 2.2 : 1.2}
                    strokeOpacity={on ? 0.95 : 0.45}
                  />
                  {on ? (
                    <path d={curve(0, 0, at.x, at.y, 0.12)} fill="none" stroke="#d9b26f" strokeWidth={1.4} className="ws-flow" />
                  ) : null}
                </g>
              );
            })}

            {/* Hubs to their nodes. */}
            {layout.leaves.map(({ leaf, x, y }) => {
              const at = layout.hubs.find((hub) => hub.key === leaf.hub)!;
              const on = active.has(leaf.hub) || lit.has(leaf.id) || selectedHub === leaf.hub;
              return (
                <path
                  key={`leaf-edge-${leaf.id}`}
                  id={`${uid}-leaf-${leaf.id.replace(/[^a-z0-9-]/gi, "_")}`}
                  d={curve(at.x, at.y, x, y, 0.1)}
                  fill="none"
                  stroke={lit.has(leaf.id) ? "#d9b26f" : "#5ad1c0"}
                  strokeWidth={lit.has(leaf.id) ? 1.6 : 0.8}
                  strokeOpacity={dimmed(leaf.hub) ? 0.12 : on ? 0.8 : 0.32}
                  style={{ transition: "stroke-opacity 300ms" }}
                />
              );
            })}

            {/* Light travelling the lines. */}
            {!still
              ? layout.hubs.flatMap((at, index) => {
                  const on = active.has(at.key);
                  const count = thinking ? (on ? 3 : 1) : on ? 2 : 1;
                  const dur = thinking ? (on ? 1.4 : 2.6) : on ? 2.2 : 4.6;
                  // A soft halo drawn as a second circle, not a blur filter: a
                  // filtered shape moving every frame is repainted every frame.
                  return Array.from({ length: count }, (_, k) => (
                    <g key={`pulse-${at.key}-${k}-${count}-${dur}`} opacity={dimmed(at.key) ? 0.2 : 0.95}>
                      <circle r={on ? 7 : 5} fill="#d9b26f" opacity={0.22} />
                      <circle r={on ? 2.8 : 2} fill={on ? "#fbe7bf" : "#e8c98a"} />
                      <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`-${((index * 0.7 + (k * dur) / count) % dur).toFixed(2)}s`}>
                        <mpath href={`#${uid}-edge-${at.key}`} />
                      </animateMotion>
                    </g>
                  ));
                })
              : null}
            {!still
              ? layout.leaves
                  .filter(({ leaf }) => active.has(leaf.hub) || lit.has(leaf.id))
                  .map(({ leaf }, index) => (
                    <g key={`leaf-pulse-${leaf.id}`}>
                      <circle r={5} fill="#d9b26f" opacity={0.2} />
                      <circle r={1.8} fill="#fbe7bf" />
                      <animateMotion dur="1.6s" repeatCount="indefinite" begin={`-${((index * 0.37) % 1.6).toFixed(2)}s`}>
                        <mpath href={`#${uid}-leaf-${leaf.id.replace(/[^a-z0-9-]/gi, "_")}`} />
                      </animateMotion>
                    </g>
                  ))
              : null}

            {/* Nodes. */}
            {layout.leaves.map(({ leaf, x, y, r, anchor, labelY }) => {
              const isLit = lit.has(leaf.id);
              const chosen = leaf.id === selectedLeaf;
              const color = TONE_COLOR[leaf.tone];
              const labelX = anchor === "start" ? x + r + 6 : x - r - 6;
              return (
                <g
                  key={leaf.id}
                  data-node
                  role="button"
                  tabIndex={0}
                  aria-label={`${leaf.label}, ${leaf.valueText}`}
                  onClick={() => onSelectLeaf(leaf.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectLeaf(leaf.id);
                    }
                  }}
                  opacity={dimmed(leaf.hub) ? 0.28 : 1}
                  className="cursor-pointer outline-none"
                  style={{ transition: "opacity 300ms" }}
                >
                  <circle cx={x} cy={y} r={r + 9} fill="transparent" />
                  {isLit || chosen ? (
                    <circle cx={x} cy={y} r={r + 3} fill="none" stroke="#d9b26f" strokeWidth={1.2} className={still ? undefined : "ws-ping"} />
                  ) : null}
                  <circle cx={x} cy={y} r={r} fill={color} fillOpacity={0.22} stroke={chosen ? "#d9b26f" : color} strokeWidth={chosen ? 2 : 1.2} />
                  <circle cx={x} cy={y} r={Math.max(1.6, r * 0.38)} fill={color} />
                  {showLeafLabel(leaf) ? (
                    <text
                      x={labelX}
                      y={labelY + 3.5}
                      textAnchor={anchor}
                      fontSize={compact ? 10 : 11}
                      fill={isLit || chosen ? "#f3d9a4" : "rgba(227,232,235,0.82)"}
                      style={{ paintOrder: "stroke", stroke: "#020404", strokeWidth: 3 }}
                    >
                      {trimLabel(leaf.label, compact ? 12 : 18)}
                      {!compact ? (
                        <tspan fill="rgba(227,232,235,0.5)" fontSize={10}>
                          {"  "}
                          {leaf.valueText}
                        </tspan>
                      ) : null}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {layout.hubs.map((at) => {
              const hub = hubByKey.get(at.key)!;
              const on = active.has(at.key);
              const chosen = selectedHub === at.key;
              const color = TONE_COLOR[hub.tone];
              const inward = { x: at.x - Math.cos(at.angle) * 36, y: at.y - Math.sin(at.angle) * 36 };
              const more = layout.hidden[at.key] ?? 0;
              return (
                <g
                  key={`hub-${at.key}`}
                  data-node
                  role="button"
                  tabIndex={0}
                  aria-label={`${hub.label}: ${hub.headlineText}, ${hub.caption}`}
                  onClick={() => onSelectHub(at.key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectHub(at.key);
                    }
                  }}
                  onPointerEnter={() => setHovered(at.key)}
                  onPointerLeave={() => setHovered(null)}
                  opacity={dimmed(at.key) ? 0.35 : 1}
                  className="cursor-pointer outline-none"
                  style={{ transition: "opacity 300ms" }}
                >
                  <circle cx={at.x} cy={at.y} r={30} fill="transparent" />
                  {on || chosen ? (
                    <circle cx={at.x} cy={at.y} r={24} fill="#d9b26f" opacity={0.18} className={still ? undefined : "ws-breathe"} />
                  ) : null}
                  <circle
                    cx={at.x}
                    cy={at.y}
                    r={compact ? 14 : 17}
                    fill="#0b1514"
                    stroke={on || chosen ? "#d9b26f" : color}
                    strokeWidth={on || chosen ? 2.2 : 1.4}
                  />
                  <circle cx={at.x} cy={at.y} r={compact ? 5 : 6} fill={on || chosen ? "#f3d9a4" : color} />
                  <text
                    x={inward.x}
                    y={inward.y - (compact ? 2 : 4)}
                    textAnchor="middle"
                    fontSize={compact ? 11 : 12.5}
                    fontWeight={600}
                    fill={on || chosen ? "#f3d9a4" : "#e3e8eb"}
                    style={{ paintOrder: "stroke", stroke: "#020404", strokeWidth: 4 }}
                  >
                    {hub.label}
                  </text>
                  <text
                    x={inward.x}
                    y={inward.y + (compact ? 10 : 11)}
                    textAnchor="middle"
                    fontSize={compact ? 10 : 11}
                    fill="#d9b26f"
                    style={{ paintOrder: "stroke", stroke: "#020404", strokeWidth: 4, fontVariantNumeric: "tabular-nums" }}
                  >
                    {hub.headlineText}
                    {more > 0 ? <tspan fill="rgba(227,232,235,0.5)">{`  +${more}`}</tspan> : null}
                  </text>
                </g>
              );
            })}

            {/* The centre: the person. Never takes a tap — its glow is wide,
                and on a phone it would swallow taps on the hubs around it. */}
            <g pointerEvents="none" role="img" aria-label={`${graph.core.label}: ${graph.core.headlineText} ${graph.core.caption}`}>
              <g transform={compact ? "scale(0.62)" : undefined}>
                {/* Still on purpose: a breathing gradient this size repaints a third of the screen every frame. */}
                <circle r={130} fill={`url(#${uid}-halo)`} />
                <path d={CORONA} stroke="#9b8cff" strokeOpacity={0.55} strokeWidth={0.8} className={still ? undefined : "ws-spin"} />
                <path d={CORONA} stroke="#5ad1c0" strokeOpacity={0.35} strokeWidth={0.6} transform="scale(1.12)" className={still ? undefined : "ws-spin-reverse"} />
                <circle r={thinking ? 32 : 30} fill={`url(#${uid}-orb)`} filter={`url(#${uid}-glow)`} style={{ transition: "r 400ms" }} />
                <ellipse cx={-9} cy={-11} rx={9} ry={5} fill="#ffffff" opacity={0.35} />
              </g>
              <text y={compact ? 44 : 76} textAnchor="middle" fontSize={compact ? 11 : 14} fontWeight={700} fill="#e3e8eb" style={{ paintOrder: "stroke", stroke: "#020404", strokeWidth: 4 }}>
                {graph.core.label}
              </text>
              <text y={compact ? 57 : 92} textAnchor="middle" fontSize={compact ? 9.5 : 11} fill="#d9b26f" style={{ paintOrder: "stroke", stroke: "#020404", strokeWidth: 4 }}>
                {compact ? graph.core.headlineText : `${graph.core.headlineText} ${graph.core.caption}`}
              </text>
            </g>
          </g>
        </svg>
      ) : null}
    </div>
  );
}
