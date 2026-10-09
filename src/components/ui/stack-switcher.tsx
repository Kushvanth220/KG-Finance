"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
  type SpringOptions,
} from "motion/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useHydratedReducedMotion } from "@/hooks/use-is-client";
import {
  cardPose,
  clamp,
  iconPose,
  STACK_GEOMETRY,
  stackStep,
  type StackGeometry,
} from "@/lib/stack-pose";
import { cn } from "@/lib/utils";

/**
 * A vertical stack of cards you flick through, after the watchOS app switcher.
 *
 * The focused card sits near the top at full size. The cards after it wait
 * in a plain column and travel 1:1 with the finger; the ones already passed
 * fold back into a pile — smaller, dimmer, leaning away — so you can see how
 * far you have come without the screen filling with things you are done with.
 *
 * Each card's icon rides its own layer on a spring, a beat behind the cards.
 * While you scroll the icons lift off and trail; when you stop they settle
 * back onto their corners. The gap between the spring and the scroll is the
 * whole effect, and at rest it is zero, so nothing is ever left misplaced.
 *
 * Every pose is a pure function of one number (lib/stack-pose). Nothing is
 * timed and nothing plays on its own: the stack moves only while someone is
 * moving it, which is what lets it live inside the app (lib/motion-presets).
 *
 *   StackSwitcher — owns its scroll box and snaps card by card. For sheets.
 *   ScrollStack   — follows the page through a sticky section. For the front
 *                   door, the one place scroll theatre is the point.
 *
 * Under prefers-reduced-motion both are a plain list: same cards, same
 * order, nothing moving.
 */

/** In the app: settles in about 0.3s and never overshoots — nothing bounces. */
const SETTLE: SpringOptions = { stiffness: 420, damping: 42 };
/** On the front door: the icons overshoot a touch as they land. */
const SNAP: SpringOptions = { stiffness: 260, damping: 19 };

export interface StackProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  /** The card face, filling `geometry.cardHeight`. Only the focused card is interactive. */
  renderCard: (item: T) => ReactNode;
  /** The icon that floats on the card's top-left corner. */
  renderIcon?: (item: T) => ReactNode;
  /** What one card is called aloud, e.g. the account's name. */
  cardLabel: (item: T) => string;
  /** What the whole stack is called aloud. */
  label: string;
  geometry?: StackGeometry;
  /** The surface the stack sits on; piled cards fade toward it. */
  fadeTo?: string;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* The stage both drivers share                                         */
/* ------------------------------------------------------------------ */

function StackCard({
  index,
  count,
  label,
  progress,
  geometry,
  fadeTo,
  focused,
  onPick,
  children,
}: {
  index: number;
  count: number;
  label: string;
  progress: MotionValue<number>;
  geometry: StackGeometry;
  fadeTo: string;
  focused: boolean;
  onPick: (index: number) => void;
  children: ReactNode;
}) {
  const distance = useTransform(progress, (p) => index - p);
  const y = useTransform(distance, (d) => cardPose(d, geometry).y);
  const scale = useTransform(distance, (d) => cardPose(d, geometry).scale);
  const rotateX = useTransform(distance, (d) => cardPose(d, geometry).rotateX);
  const opacity = useTransform(distance, (d) => cardPose(d, geometry).opacity);
  const dim = useTransform(distance, (d) => cardPose(d, geometry).dim);

  return (
    <motion.div
      role="group"
      aria-label={`${label}, ${index + 1} of ${count}`}
      aria-current={focused ? "true" : undefined}
      className={cn("absolute inset-x-4 top-0 rounded-[var(--card-radius)]", !focused && "cursor-pointer")}
      style={{ height: geometry.cardHeight, y, scale, rotateX, opacity, zIndex: index + 1, transformOrigin: "50% 0%" }}
      // A card behind or below is a target, not a surface: tapping it brings
      // it forward. Its contents stay inert until it is the one in focus.
      onClick={focused ? undefined : () => onPick(index)}
    >
      <div inert={!focused} className="h-full">
        {children}
      </div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ opacity: dim, background: fadeTo }}
      />
    </motion.div>
  );
}

function StackIcon({
  index,
  sprung,
  geometry,
  children,
}: {
  index: number;
  sprung: MotionValue<number>;
  geometry: StackGeometry;
  children: ReactNode;
}) {
  const distance = useTransform(sprung, (p) => index - p);
  const x = useTransform(distance, (d) => iconPose(d, geometry).x);
  const y = useTransform(distance, (d) => iconPose(d, geometry).y);
  const scale = useTransform(distance, (d) => iconPose(d, geometry).scale);
  const opacity = useTransform(distance, (d) => iconPose(d, geometry).opacity);

  return (
    <motion.div className="absolute -top-3 left-2.5" style={{ x, y, scale, opacity }}>
      {children}
    </motion.div>
  );
}

function StackStage<T>({
  items,
  getKey,
  renderCard,
  renderIcon,
  cardLabel,
  geometry,
  fadeTo,
  progress,
  sprung,
  focused,
  onPick,
}: Required<Pick<StackProps<T>, "geometry" | "fadeTo">> &
  Omit<StackProps<T>, "geometry" | "fadeTo" | "label" | "className"> & {
    progress: MotionValue<number>;
    sprung: MotionValue<number>;
    focused: number;
    onPick: (index: number) => void;
  }) {
  return (
    <div className="relative h-full overflow-hidden" style={{ perspective: 900, perspectiveOrigin: "50% 0%" }}>
      {items.map((item, index) => (
        <StackCard
          key={getKey(item)}
          index={index}
          count={items.length}
          label={cardLabel(item)}
          progress={progress}
          geometry={geometry}
          fadeTo={fadeTo}
          focused={index === focused}
          onPick={onPick}
        >
          {renderCard(item)}
        </StackCard>
      ))}

      {renderIcon ? (
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: items.length + 1 }}>
          {items.map((item, index) => (
            <StackIcon key={getKey(item)} index={index} sprung={sprung} geometry={geometry}>
              {renderIcon(item)}
            </StackIcon>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reduced motion: the same cards as a list                             */
/* ------------------------------------------------------------------ */

function StackList<T>({
  items,
  getKey,
  renderCard,
  renderIcon,
  cardLabel,
  label,
  geometry = STACK_GEOMETRY,
  className,
  initialIndex = 0,
  scrollable,
}: StackProps<T> & { initialIndex?: number; scrollable?: boolean }) {
  const box = useRef<HTMLDivElement>(null);

  // Open on the card that was asked for, as the stack would.
  useLayoutEffect(() => {
    const el = box.current;
    const target = el?.querySelector<HTMLElement>(`[data-stack-index="${initialIndex}"]`);
    if (el && target && scrollable) el.scrollTop = target.offsetTop - 12;
  }, [initialIndex, scrollable]);

  return (
    <div
      ref={box}
      data-lenis-prevent={scrollable || undefined}
      className={cn("relative", scrollable && "min-h-0 overflow-y-auto overscroll-contain", className)}
    >
      <ul aria-label={label} className="space-y-4 px-4 pb-2 pt-3">
        {items.map((item, index) => (
          <li
            key={getKey(item)}
            data-stack-index={index}
            aria-label={cardLabel(item)}
            className="relative"
            style={{ height: geometry.cardHeight }}
          >
            {renderCard(item)}
            {renderIcon ? (
              <div aria-hidden className="pointer-events-none absolute -left-1.5 -top-3">
                {renderIcon(item)}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* StackSwitcher: its own scroll box, one card per snap                 */
/* ------------------------------------------------------------------ */

function SnapStack<T>({
  items,
  getKey,
  renderCard,
  renderIcon,
  cardLabel,
  label,
  geometry = STACK_GEOMETRY,
  fadeTo = "var(--background)",
  className,
  initialIndex = 0,
}: StackProps<T> & { initialIndex?: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const [boxHeight, setBoxHeight] = useState(0);
  const last = Math.max(items.length - 1, 0);
  const step = stackStep(geometry);
  const [focused, setFocused] = useState(() => clamp(initialIndex, 0, last));

  const { scrollY } = useScroll({ container: scroller });
  const progress = useTransform(scrollY, (y) => y / step);
  const sprung = useSpring(progress, SETTLE);

  useMotionValueEvent(progress, "change", (p) => setFocused(clamp(Math.round(p), 0, last)));

  // The stage is exactly one box tall and the tail spacer lets the last card
  // reach the top, so both need the box's height. The observer reports it
  // once on attach and again on rotation or resize.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBoxHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Open on the card that was asked for, without travelling there.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || boxHeight === 0 || placed.current) return;
    placed.current = true;
    const top = focused * step;
    el.scrollTop = top;
    scrollY.set(top);
    sprung.jump(focused);
  }, [boxHeight, focused, scrollY, sprung, step]);

  const go = (index: number) =>
    scroller.current?.scrollTo({ top: clamp(index, 0, last) * step, behavior: "smooth" });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const by = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }[event.key];
    if (by !== undefined) go(focused + by);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(last);
    else return;
    event.preventDefault();
  };

  const current = items[focused];

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        ref={scroller}
        // SmoothScroll (Lenis) would otherwise take the wheel and scroll the
        // page behind; inside the stack the browser's own scroll and snap win.
        data-lenis-prevent
        tabIndex={0}
        role="region"
        aria-label={`${label}. Arrow keys move between cards.`}
        onKeyDown={onKeyDown}
        className="scrollbar-hide focus-ring relative min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-2xl"
      >
        {boxHeight > 0 ? (
          <>
            <div className="sticky top-0 z-[1]" style={{ height: boxHeight, marginBottom: -boxHeight }}>
              <StackStage
                items={items}
                getKey={getKey}
                renderCard={renderCard}
                renderIcon={renderIcon}
                cardLabel={cardLabel}
                geometry={geometry}
                fadeTo={fadeTo}
                progress={progress}
                sprung={sprung}
                focused={focused}
                onPick={go}
              />
            </div>
            {/* One snap point per card; they carry the scroll, the stage carries the look. */}
            {items.map((item) => (
              <div key={getKey(item)} aria-hidden className="pointer-events-none snap-start" style={{ height: step }} />
            ))}
            <div aria-hidden className="pointer-events-none" style={{ height: Math.max(boxHeight - step, 0) }} />
          </>
        ) : null}
      </div>

      {current ? (
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-2">
          <p aria-live="polite" className="min-w-0 truncate text-[11px] text-muted tabular-nums">
            <span className="font-semibold text-foreground">{cardLabel(current)}</span> · {focused + 1} of{" "}
            {items.length}
          </p>
          <div className="glass flex shrink-0 gap-0.5 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => go(focused - 1)}
              disabled={focused === 0}
              aria-label="Previous card"
              className="tap-icon focus-ring rounded-md p-1.5 disabled:opacity-35"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(focused + 1)}
              disabled={focused === last}
              aria-label="Next card"
              className="tap-icon focus-ring rounded-md p-1.5 disabled:opacity-35"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StackSwitcher<T>(props: StackProps<T> & { initialIndex?: number }) {
  const still = useHydratedReducedMotion();
  if (still) return <StackList {...props} scrollable />;
  return <SnapStack {...props} />;
}

/* ------------------------------------------------------------------ */
/* ScrollStack: driven by the page, through a sticky section            */
/* ------------------------------------------------------------------ */

function PageStack<T>({
  items,
  getKey,
  renderCard,
  renderIcon,
  cardLabel,
  label,
  geometry = STACK_GEOMETRY,
  fadeTo = "var(--background)",
  className,
  header,
  stageClassName,
}: StackProps<T> & { header?: ReactNode; stageClassName?: string }) {
  const section = useRef<HTMLElement>(null);
  const last = Math.max(items.length - 1, 0);
  const step = stackStep(geometry);
  const [focused, setFocused] = useState(0);

  // The section is one screen plus one step per card, so a step of page
  // scroll moves the stack by exactly one card.
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const progress = useTransform(scrollYProgress, (v) => v * last);
  const sprung = useSpring(progress, SNAP);

  useMotionValueEvent(progress, "change", (p) => setFocused(clamp(Math.round(p), 0, last)));

  const pick = (index: number) => {
    const el = section.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + index * step, behavior: "smooth" });
  };

  return (
    <section
      ref={section}
      aria-label={label}
      className={cn("relative", className)}
      style={{ height: `calc(100dvh + ${last * step}px)` }}
    >
      <div className="sticky top-0 flex h-[100dvh] flex-col">
        {header}
        <div className={cn("relative min-h-0 w-full flex-1", stageClassName)}>
          <StackStage
            items={items}
            getKey={getKey}
            renderCard={renderCard}
            renderIcon={renderIcon}
            cardLabel={cardLabel}
            geometry={geometry}
            fadeTo={fadeTo}
            progress={progress}
            sprung={sprung}
            focused={focused}
            onPick={pick}
          />
        </div>
      </div>
    </section>
  );
}

export function ScrollStack<T>(props: StackProps<T> & { header?: ReactNode; stageClassName?: string }) {
  const still = useHydratedReducedMotion();
  if (still) {
    const { header, stageClassName, className, ...rest } = props;
    return (
      <section aria-label={props.label} className={className}>
        {header}
        <StackList {...rest} className={stageClassName} />
      </section>
    );
  }
  return <PageStack {...props} />;
}
