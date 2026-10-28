"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Reorder, useDragControls } from "motion/react";
import { ChevronDown, ChevronUp, GripVertical, Landmark, Receipt, TrendingUp, Truck, Wallet } from "lucide-react";
import { GlassModal } from "@/components/ui/glass-modal";
import { ChartTypePicker, readType, useChartType } from "@/components/dashboard/chart-type-picker";
import { CHART_TYPE_OPTIONS, type FlexChartType } from "@/components/charts/flex-chart";
import { isCloudReachable, onInitialSyncComplete } from "@/lib/supabase/sync";
import {
  DEFAULT_CARD_PREFS,
  HOME_CARDS,
  isDefaultCardPrefs,
  normalizeCardPrefs,
  parseCardPrefs,
  reorderWithin,
  type HomeCardId,
  type HomeCardPrefs,
} from "@/lib/home-cards";
import { useFinanceStore } from "@/store/finance-store";
import type { HomeLayout } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Laying out Home's deck: drag the cards into an order, hide the ones you don't
 * look at, and pick how the chart cards draw.
 *
 * The layout lives in the workspace record, so it travels to every device like
 * a spend does. This browser's own copy (where layouts lived before) stands in
 * until a layout has been saved there.
 */

const STORAGE_KEY = "kg-home-cards";
const CHART_DEFAULTS = { income: "donut", spend: "bar" } as const satisfies Record<string, FlexChartType>;
type HomeChart = keyof typeof CHART_DEFAULTS;
const listeners = new Set<() => void>();
// Where the choice lives when storage is blocked (a private window): it holds for this visit.
let memoryRaw: string | null = null;
let cachedRaw: string | null | undefined;
let cached: HomeCardPrefs = DEFAULT_CARD_PREFS;

function readPrefs(): HomeCardPrefs {
  let raw = memoryRaw;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? memoryRaw;
  } catch {
    // Blocked storage: the in-memory copy stands in.
  }
  // Same text, same object, so React sees no change.
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseCardPrefs(raw);
  }
  return cached;
}

function writePrefs(prefs: HomeCardPrefs) {
  memoryRaw = JSON.stringify(prefs);
  try {
    window.localStorage.setItem(STORAGE_KEY, memoryRaw);
  } catch {
    // Not being able to remember the layout is not a reason to refuse it.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const noLayout = () => undefined;
const sharedLayout = () => useFinanceStore.getState().homeLayout;

/** The workspace's layout. Nothing on the server and the first render, so the two agree. */
function useSharedLayout(): HomeLayout | undefined {
  return useSyncExternalStore(useFinanceStore.subscribe, sharedLayout, noLayout);
}

const isChartType = (value: unknown): value is FlexChartType =>
  CHART_TYPE_OPTIONS.some((option) => option.value === value);

/** Save a layout for every device, keeping whatever part of it isn't changing. */
function saveLayout(change: { prefs?: HomeCardPrefs; chart?: [HomeChart, FlexChartType]; nav?: string[] }) {
  const store = useFinanceStore.getState();
  const current = store.homeLayout;
  const prefs = change.prefs ?? (current ? normalizeCardPrefs(current) : readPrefs());
  const charts = {
    income: readType("income", CHART_DEFAULTS.income),
    spend: readType("spend", CHART_DEFAULTS.spend),
    ...current?.charts,
    ...(change.chart ? { [change.chart[0]]: change.chart[1] } : {}),
  };
  const nav = change.nav ?? current?.nav;
  store.setHomeLayout({ order: prefs.order, hidden: prefs.hidden, charts, ...(nav ? { nav } : {}) });
}

/** The tab bar's three pages beside Spend, as saved for the workspace; null for the usual ones. */
export function useSharedNav(): string[] | null {
  return useSharedLayout()?.nav ?? null;
}

/** Save the tab bar's pages for every device. */
export function saveNav(nav: string[]) {
  saveLayout({ nav });
}

/**
 * A layout made before layouts were shared lives only in this browser, so the
 * other phone never saw it. Once the first sync has read the workspace and
 * found no shared layout there, this one is shared — once, and only when it
 * differs from the usual. Never over a layout already shared, and never while
 * the cloud couldn't be reached: an offline phone must not bury a newer
 * layout it simply hasn't seen yet.
 */
let offeredOldLayout = false;
function shareOldLayoutOnce() {
  if (offeredOldLayout) return;
  offeredOldLayout = true;
  onInitialSyncComplete(() => {
    if (!isCloudReachable() || useFinanceStore.getState().homeLayout) return;
    const prefs = readPrefs();
    const usualCharts =
      readType("income", CHART_DEFAULTS.income) === CHART_DEFAULTS.income &&
      readType("spend", CHART_DEFAULTS.spend) === CHART_DEFAULTS.spend;
    if (isDefaultCardPrefs(prefs) && usualCharts) return;
    saveLayout({ prefs });
  });
}

/** The deck's layout, as saved for the workspace. The server and first render use the usual one. */
export function useHomeCards() {
  useEffect(shareOldLayoutOnce, []);
  const layout = useSharedLayout();
  const local = useSyncExternalStore(subscribe, readPrefs, () => DEFAULT_CARD_PREFS);
  const prefs = useMemo(() => (layout ? normalizeCardPrefs(layout) : local), [layout, local]);
  const write = (next: HomeCardPrefs) => {
    writePrefs(next);
    saveLayout({ prefs: next });
  };
  return [prefs, write] as const;
}

/** How one of Home's chart cards draws, as saved for the workspace. */
export function useHomeChart(which: HomeChart) {
  const layout = useSharedLayout();
  const [local, setLocal] = useChartType(which, CHART_DEFAULTS[which]);
  const shared = layout?.charts?.[which];
  const value = isChartType(shared) ? shared : local;
  const write = (next: FlexChartType) => {
    setLocal(next);
    saveLayout({ chart: [which, next] });
  };
  return [value, write] as const;
}

const ICONS: Record<HomeCardId, typeof Truck> = {
  flex: Truck,
  income: TrendingUp,
  spending: Receipt,
  accounts: Wallet,
  debts: Landmark,
};

function CardRow({
  id,
  first,
  last,
  hidden,
  onMove,
  onToggle,
  format,
}: {
  id: HomeCardId;
  first: boolean;
  last: boolean;
  hidden: boolean;
  onMove: (by: -1 | 1) => void;
  onToggle: () => void;
  /** The chart-shape control, for the cards drawn as a chart. */
  format?: React.ReactNode;
}) {
  const drag = useDragControls();
  const label = HOME_CARDS.find((card) => card.id === id)!.label;
  const Icon = ICONS[id];

  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={drag}
      className={cn("glass list-none rounded-xl p-2.5", hidden && "opacity-60")}
      whileDrag={{ scale: 1.03, boxShadow: "0 14px 30px -12px rgba(3, 25, 91, 0.45)" }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Drag ${label} to reorder`}
          onPointerDown={(event) => drag.start(event)}
          className="cursor-grab touch-none rounded-md p-1 text-muted active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={first}
          aria-label={`Move ${label} up`}
          className="rounded-md p-1 text-muted disabled:opacity-30"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={last}
          aria-label={`Move ${label} down`}
          className="rounded-md p-1 text-muted disabled:opacity-30"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={!hidden}
          aria-label={`Show ${label}`}
          onClick={onToggle}
          className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", hidden ? "bg-black/15 dark:bg-white/15" : "bg-positive")}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]",
              hidden ? "left-0.5" : "left-[18px]"
            )}
          />
        </button>
      </div>
      {format && !hidden ? <div className="mt-2 pl-8">{format}</div> : null}
    </Reorder.Item>
  );
}

export function HomeCardsEditor({
  open,
  onClose,
  available,
  prefs,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  /** The cards this person has (no Flex on G's tab, no Debts without any). */
  available: HomeCardId[];
  prefs: HomeCardPrefs;
  onChange: (next: HomeCardPrefs) => void;
}) {
  const [incomeChart, setIncomeChart] = useHomeChart("income");
  const [spendChart, setSpendChart] = useHomeChart("spend");
  const items = prefs.order.filter((id) => available.includes(id));
  const shownCount = items.filter((id) => !prefs.hidden.includes(id)).length;

  const setItems = (next: HomeCardId[]) => onChange({ ...prefs, order: reorderWithin(prefs.order, next) });
  const move = (id: HomeCardId, by: -1 | 1) => {
    const from = items.indexOf(id);
    const to = from + by;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[from], next[to]] = [next[to]!, next[from]!];
    setItems(next);
  };
  const toggle = (id: HomeCardId) =>
    onChange({
      ...prefs,
      hidden: prefs.hidden.includes(id) ? prefs.hidden.filter((other) => other !== id) : [...prefs.hidden, id],
    });
  const reset = () => {
    onChange(DEFAULT_CARD_PREFS);
    setIncomeChart("donut");
    setSpendChart("bar");
  };

  const formats: Partial<Record<HomeCardId, React.ReactNode>> = {
    income: (
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted">Chart</p>
        <ChartTypePicker value={incomeChart} onChange={setIncomeChart} tint="var(--success)" />
      </div>
    ),
    spending: (
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted">Chart</p>
        <ChartTypePicker value={spendChart} onChange={setSpendChart} tint="var(--danger)" />
      </div>
    ),
  };

  return (
    <GlassModal open={open} onClose={onClose} title="Customize cards">
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Drag a card by its handle to change the order, switch off the ones you don&apos;t need, and choose how the
          charts are drawn. Your other devices get the same layout.
        </p>
        <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-2">
          {items.map((id, index) => (
            <CardRow
              key={id}
              id={id}
              first={index === 0}
              last={index === items.length - 1}
              hidden={prefs.hidden.includes(id)}
              onMove={(by) => move(id, by)}
              onToggle={() => toggle(id)}
              format={formats[id]}
            />
          ))}
        </Reorder.Group>
        {shownCount === 0 ? (
          <p className="text-[11px] text-caution">Every card is hidden, so Home shows only the story.</p>
        ) : null}
        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={reset} className="text-xs font-semibold text-muted hover:text-foreground">
            Reset to default
          </button>
          <button type="button" onClick={onClose} className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white">
            Done
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
