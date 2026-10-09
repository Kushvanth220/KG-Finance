"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import type { GraphHub, GraphLeaf } from "@/lib/assistant-graph";
import { HUB_ICON, TONE_COLOR, type WorkspaceActivity } from "@/components/assistant/workspace/workspace-state";
import { cn } from "@/lib/utils";

/**
 * One hub, opened up — the reference's main screen.
 *
 * The hub sits on the left as an orb. Beside it, a column of chips counts
 * what is inside (categories, the ones near budget, the budgeted ones…).
 * The chosen chip glows and fans a curve out to every node it holds, laid on
 * an arc, each with its amount and a three-step status bar. Light runs out
 * along the fan; the nodes the assistant just named ring gold.
 *
 * On a phone the arc becomes a column: chips in a row, nodes listed under.
 */

const MAX_ON_ARC = 16;

function StatusBar({ leaf }: { leaf: GraphLeaf }) {
  const color = TONE_COLOR[leaf.tone];
  const filled =
    leaf.meter !== null ? Math.max(1, Math.ceil(leaf.meter * 3)) : leaf.tone === "good" ? 3 : leaf.tone === "warn" ? 2 : leaf.tone === "bad" ? 1 : 0;
  return (
    <span className="inline-flex gap-[2px]" aria-hidden>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-[7px] w-[9px] rounded-[2px]"
          style={{ background: index < filled ? color : "rgba(227,232,235,0.12)" }}
        />
      ))}
    </span>
  );
}

function ItemCard({
  leaf,
  lit,
  chosen,
  onSelect,
}: {
  leaf: GraphLeaf;
  lit: boolean;
  chosen: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group block max-w-[210px] text-left outline-none",
        "focus-visible:rounded-md focus-visible:ring-1 focus-visible:ring-[var(--ws-gold)]"
      )}
      aria-pressed={chosen}
      aria-label={`${leaf.label}, ${leaf.valueText}${leaf.meterText ? `, ${leaf.meterText}` : ""}`}
    >
      <span
        className={cn(
          "block truncate text-[13px] leading-tight transition-colors",
          lit || chosen ? "text-[#f3d9a4]" : "text-[#e3e8eb]/85 group-hover:text-[#e3e8eb]"
        )}
      >
        {leaf.label}
      </span>
      <span className="mt-1 flex items-center gap-1.5">
        <span className="rounded bg-[#e3e8eb]/12 px-1.5 py-[1px] text-[10px] font-semibold tabular-nums text-[#e3e8eb]/85">
          {leaf.valueText}
        </span>
        <StatusBar leaf={leaf} />
      </span>
    </button>
  );
}

export function FocusFan({
  hub,
  personLabel,
  activity,
  selectedLeaf,
  compact,
  onSelectLeaf,
  onBack,
}: {
  hub: GraphHub;
  personLabel: string;
  activity: WorkspaceActivity;
  selectedLeaf: string | null;
  compact: boolean;
  onSelectLeaf: (id: string) => void;
  onBack: () => void;
}) {
  const still = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [chipKey, setChipKey] = useState(hub.chips[0]?.key ?? "all");
  const Icon = HUB_ICON[hub.key];
  const lit = new Set(activity.litLeaves);
  const hubActive = activity.activeHubs.includes(hub.key);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const chip = hub.chips.find((item) => item.key === chipKey) ?? hub.chips[0];
  const items = useMemo(() => {
    const ids = new Set(chip?.leafIds ?? []);
    return hub.leaves.filter((leaf) => ids.has(leaf.id));
  }, [hub, chip]);

  const header = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#e3e8eb]/70 hover:text-[#e3e8eb]"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> All of {personLabel}
    </button>
  );

  /* ---------------- Phone: chips in a row, nodes in a column ---------------- */
  if (compact) {
    return (
      <div ref={box} className="absolute inset-0 flex flex-col overflow-hidden px-3 pb-2 pt-2">
        {header}
        <div className="mt-2 flex items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border"
            style={{ borderColor: TONE_COLOR[hub.tone], background: "radial-gradient(circle at 35% 35%, #2b3f3c, #0b1514)" }}
          >
            <Icon className="h-5 w-5 text-[#f3d9a4]" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight">{hub.label}</p>
            <p className="text-[12px] tabular-nums text-[var(--ws-gold)]">
              {hub.headlineText} <span className="text-[#e3e8eb]/55">· {hub.caption}</span>
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={`${hub.label} groups`}>
          {hub.chips.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === chip?.key}
              onClick={() => setChipKey(item.key)}
              className={cn(
                "ws-tile shrink-0 rounded-xl px-3 py-1.5 text-left",
                item.key === chip?.key && "!border-[var(--ws-gold)] shadow-[0_0_18px_rgba(217,178,111,0.25)]"
              )}
            >
              <span className="block text-[15px] font-semibold tabular-nums leading-none">{item.count}</span>
              <span className="text-[10px] text-[#e3e8eb]/60">{item.label}</span>
            </button>
          ))}
        </div>
        <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto border-l border-[var(--ws-gold)]/40 pl-3" data-lenis-prevent>
          {items.length === 0 ? <li className="py-6 text-[12px] text-[#e3e8eb]/55">Nothing here yet.</li> : null}
          {items.map((leaf, index) => (
            <motion.li
              key={`${chip?.key}-${leaf.id}`}
              initial={still ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.28, delay: still ? 0 : Math.min(index, 10) * 0.03 }}
              className="relative py-1.5"
            >
              <span
                aria-hidden
                className="absolute -left-[17px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                style={{ background: lit.has(leaf.id) || leaf.id === selectedLeaf ? "#f3d9a4" : TONE_COLOR[leaf.tone] }}
              />
              <ItemCard leaf={leaf} lit={lit.has(leaf.id)} chosen={leaf.id === selectedLeaf} onSelect={() => onSelectLeaf(leaf.id)} />
            </motion.li>
          ))}
        </ul>
      </div>
    );
  }

  /* ---------------- Wide: orb, chip column, fan to an arc ---------------- */
  const { w, h } = size;
  const cy = h / 2;
  const orbX = Math.max(96, w * 0.11);
  const chipW = Math.min(190, w * 0.19);
  const chipH = 58;
  const chipGap = 16;
  const chipX = orbX + 110;
  const chipTotal = hub.chips.length * chipH + (hub.chips.length - 1) * chipGap;
  const chipTop = (index: number) => cy - chipTotal / 2 + index * (chipH + chipGap);
  const chosenIndex = Math.max(0, hub.chips.findIndex((item) => item.key === chip?.key));
  const fromX = chipX + chipW;
  const fromY = chipTop(chosenIndex) + chipH / 2;

  const shown = items.slice(0, MAX_ON_ARC);
  const arcX = fromX + 30;
  const radius = Math.max(120, Math.min(h * 0.44, w - arcX - 230));
  const spread = Math.min((78 * Math.PI) / 180, Math.max(shown.length - 1, 1) * 0.105);
  const points = shown.map((leaf, index) => {
    const t = shown.length === 1 ? 0 : -spread + (index * 2 * spread) / (shown.length - 1);
    return { leaf, x: arcX + radius * Math.cos(t), y: cy + radius * 1.05 * Math.sin(t) };
  });

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <div className="absolute left-3 top-2 z-10">{header}</div>
      {w > 0 ? (
        <>
          <svg width={w} height={h} className="absolute inset-0" aria-hidden>
            <defs>
              <linearGradient id={`${uid}-fan`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#d9b26f" stopOpacity="0.95" />
                <stop offset="1" stopColor="#5ad1c0" stopOpacity="0.55" />
              </linearGradient>
            </defs>

            {/* Orb to every chip; the chosen one straight and bright. */}
            {hub.chips.map((item, index) => {
              const y = chipTop(index) + chipH / 2;
              const chosen = index === chosenIndex;
              return (
                <path
                  key={item.key}
                  d={`M${orbX + 46} ${cy} C${orbX + 80} ${cy} ${chipX - 40} ${y} ${chipX} ${y}`}
                  fill="none"
                  stroke={chosen ? "#d9b26f" : "#5ad1c0"}
                  strokeOpacity={chosen ? 0.9 : 0.35}
                  strokeWidth={chosen ? 1.8 : 1}
                />
              );
            })}

            {/* The fan. */}
            {points.map(({ leaf, x, y }, index) => {
              const d = `M${fromX} ${fromY} C${fromX + 70} ${fromY} ${x - 90} ${y} ${x} ${y}`;
              const on = lit.has(leaf.id) || leaf.id === selectedLeaf;
              return (
                <g key={`${chip?.key}-${leaf.id}`}>
                  <motion.path
                    id={`${uid}-fan-${index}`}
                    d={d}
                    fill="none"
                    stroke={on ? "#f3d9a4" : `url(#${uid}-fan)`}
                    strokeWidth={on ? 1.6 : 1}
                    strokeOpacity={on ? 1 : 0.7}
                    initial={still ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay: still ? 0 : index * 0.025, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <circle cx={x} cy={y} r={3.2} fill={on ? "#f3d9a4" : "#d9b26f"} />
                </g>
              );
            })}
            {!still
              ? points.map((_, index) => (
                  <g key={`comet-${chip?.key}-${index}`} opacity={hubActive ? 1 : 0.75}>
                    <circle r={6} fill="#d9b26f" opacity={0.2} />
                    <circle r={2.2} fill="#fbe7bf" />
                    <animateMotion
                      dur={hubActive ? "1.3s" : "2.8s"}
                      repeatCount="indefinite"
                      begin={`-${((index * 0.53) % 2.8).toFixed(2)}s`}
                    >
                      <mpath href={`#${uid}-fan-${index}`} />
                    </animateMotion>
                  </g>
                ))
              : null}
          </svg>

          {/* The hub as an orb. */}
          <div className="absolute flex flex-col items-center text-center" style={{ left: orbX - 90, top: cy - 120, width: 180 }}>
            <p className="text-[15px] font-semibold leading-tight">{hub.label}</p>
            <p className="text-[12px] text-[#e3e8eb]/60">{hub.caption}</p>
            <div className="relative mt-3 flex h-[92px] w-[92px] items-center justify-center">
              <span
                className={cn("absolute inset-0 rounded-full", !still && "ws-breathe")}
                style={{ background: `radial-gradient(circle, ${TONE_COLOR[hub.tone]}33, transparent 70%)` }}
              />
              <span
                className="relative flex h-[62px] w-[62px] items-center justify-center rounded-full border"
                style={{
                  borderColor: hubActive ? "#d9b26f" : TONE_COLOR[hub.tone],
                  background: "radial-gradient(circle at 35% 30%, #34504b, #0b1514 70%)",
                  boxShadow: hubActive ? "0 0 28px rgba(217,178,111,0.45)" : undefined,
                }}
              >
                <Icon className="h-6 w-6 text-[#f3d9a4]" />
              </span>
            </div>
            <p className="mt-2 text-[17px] font-semibold tabular-nums text-[var(--ws-gold)]">{hub.headlineText}</p>
          </div>

          {/* The chips. */}
          {hub.chips.map((item, index) => {
            const chosen = index === chosenIndex;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setChipKey(item.key)}
                aria-pressed={chosen}
                className={cn(
                  "ws-panel absolute flex items-center gap-3 rounded-xl px-3 text-left transition-shadow",
                  chosen && "!border-[var(--ws-gold)] shadow-[0_0_26px_rgba(217,178,111,0.28)]"
                )}
                style={{ left: chipX, top: chipTop(index), width: chipW, height: chipH }}
              >
                <span className="text-[22px] font-semibold tabular-nums leading-none">{item.count}</span>
                <span className="text-[11px] leading-tight text-[#e3e8eb]/65">{item.label}</span>
              </button>
            );
          })}

          {/* The arc. */}
          {points.map(({ leaf, x, y }, index) => (
            <motion.div
              key={`${chip?.key}-${leaf.id}`}
              className="absolute"
              style={{ left: x + 10, top: y - 18 }}
              initial={still ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: still ? 0 : 0.15 + index * 0.025 }}
            >
              <ItemCard leaf={leaf} lit={lit.has(leaf.id)} chosen={leaf.id === selectedLeaf} onSelect={() => onSelectLeaf(leaf.id)} />
            </motion.div>
          ))}
          {items.length > shown.length ? (
            <p className="absolute text-[11px] text-[#e3e8eb]/50" style={{ left: arcX + 20, top: cy + radius * 1.05 + 8 }}>
              +{items.length - shown.length} more — ask about them by name
            </p>
          ) : null}
          {items.length === 0 ? (
            <p className="absolute text-[13px] text-[#e3e8eb]/55" style={{ left: fromX + 60, top: cy - 10 }}>
              Nothing here yet.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
