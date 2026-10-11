import { addDays, differenceInCalendarDays, endOfDay, format } from "date-fns";
import { formatCurrency } from "@/lib/formatters";

/**
 * Home's story: the period told as a few full screens, one fact each.
 *
 * What was kept, where most of the money went, what moved most against the
 * period before, the pace against it, and the next thing due. A screen that
 * has nothing true to say is left out rather than padded.
 */

export type StoryPalette = "green" | "red" | "blue" | "amber" | "violet";

export interface StorySlide {
  id: "kept" | "spent" | "quiet" | "share" | "mover" | "pace" | "due";
  /** The giant figure: "$640", "38%", "+$84". */
  big: string;
  label: string;
  say: string;
  palette: StoryPalette;
}

export interface StoryPeriod {
  /** "in October", "this week", "in these 9 days". */
  in: string;
  /** "September", "last week", "the 9 days before". */
  prev: string;
  /** "in September", "last week": set while the range is still running, so it can be paced. */
  prevWhen?: string;
}

export interface MoneyStoryInput {
  period: StoryPeriod;
  incomeTotal: number;
  spendTotal: number;
  /** This period's categories. */
  categories: { name: string; amount: number }[];
  /** The period before, cut to the same stretch while this one is still running. */
  prevCategories: { name: string; amount: number }[];
  /** Spent so far, and in the same stretch before. */
  pace: { now: number; then: number };
  /** What is due in the next 7 days, soonest first. */
  due: { name: string; amount: number | null; daysUntil: number }[];
  now?: Date;
}

const round = (n: number) => Math.round(n * 100) / 100;
const dollars = (n: number) => formatCurrency(Math.round(n));
const signed = (n: number) => `${n < 0 ? "−" : "+"}${dollars(Math.abs(n))}`;
const possessive = (name: string) => `${name}'s`;

/**
 * The window to compare against: while a range is still running, the period
 * before is cut to the same number of days, so the 11th is never measured
 * against a whole month.
 */
export function storyWindow(
  range: { start: Date; end: Date; prevStart: Date; prevEnd: Date },
  now: Date = new Date()
): { ongoing: boolean; nowEnd: Date; prevCut: Date } {
  const ongoing = range.start <= now && now <= range.end;
  if (!ongoing) return { ongoing, nowEnd: range.end, prevCut: range.prevEnd };
  const elapsed = differenceInCalendarDays(now, range.start);
  const cut = endOfDay(addDays(range.prevStart, elapsed));
  return { ongoing, nowEnd: endOfDay(now), prevCut: cut < range.prevEnd ? cut : range.prevEnd };
}

/** How the story names the range and the one before it. */
export function storyPeriod(
  preset: "month" | "lastMonth" | "week" | "custom",
  range: { start: Date; end: Date; prevStart: Date; prevLabel: string },
  ongoing: boolean
): StoryPeriod {
  if (preset === "month" || preset === "lastMonth") {
    const prev = format(range.prevStart, "MMMM");
    return { in: `in ${format(range.start, "MMMM")}`, prev, prevWhen: ongoing ? `in ${prev}` : undefined };
  }
  if (preset === "week") {
    return { in: "this week", prev: "last week", prevWhen: ongoing ? "last week" : undefined };
  }
  const days = differenceInCalendarDays(range.end, range.start) + 1;
  return {
    in: days === 1 ? `on ${format(range.start, "MM/dd")}` : `in these ${days} days`,
    prev: range.prevLabel,
  };
}

const ORDER: StoryPalette[] = ["blue", "violet", "amber", "green", "red"];

export function buildMoneyStory(input: MoneyStoryInput): StorySlide[] {
  const { period } = input;
  const now = input.now ?? new Date();
  const slides: StorySlide[] = [];
  const income = round(input.incomeTotal);
  const spend = round(input.spendTotal);

  // What was kept, or what went out beyond what came in.
  if (income > 0) {
    const kept = round(income - spend);
    if (kept >= 0.5) {
      const pct = Math.min(100, Math.round((kept / income) * 100));
      slides.push({
        id: "kept",
        big: dollars(kept),
        label: `kept ${period.in}`,
        say: `That's ${pct}% of the ${dollars(income)} that came in.`,
        palette: "green",
      });
    } else if (kept > -0.5) {
      slides.push({ id: "kept", big: "$0", label: `kept ${period.in}`, say: "Everything that came in went out again.", palette: "blue" });
    } else {
      slides.push({
        id: "kept",
        big: dollars(-kept),
        label: `overspent ${period.in}`,
        say: `${dollars(spend)} went out and ${dollars(income)} came in.`,
        palette: "red",
      });
    }
  } else if (spend > 0) {
    slides.push({ id: "spent", big: dollars(spend), label: `spent ${period.in}`, say: "No income recorded for these days yet.", palette: "blue" });
  } else {
    slides.push({ id: "quiet", big: "$0", label: `in or out ${period.in}`, say: "Nothing recorded for these days yet.", palette: "blue" });
  }

  // Where most of it went.
  const cats = input.categories.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const catTotal = cats.reduce((s, c) => s + c.amount, 0);
  const [top, second] = cats;
  if (top && catTotal > 0) {
    const rest = catTotal - top.amount;
    slides.push({
      id: "share",
      big: `${Math.round((top.amount / catTotal) * 100)}%`,
      label: `of spending went to ${top.name}`,
      say: !second
        ? "The only thing you spent on."
        : top.amount > rest
          ? "More than everything else put together."
          : `Next was ${second.name} at ${dollars(second.amount)}.`,
      palette: "blue",
    });
  }

  // What moved most against the period before.
  const before = new Map(input.prevCategories.map((c) => [c.name, c.amount]));
  const nowBy = new Map(cats.map((c) => [c.name, c.amount]));
  if ([...before.values()].some((v) => v > 0)) {
    const changes = [...new Set([...nowBy.keys(), ...before.keys()])].map((name) => ({
      name,
      was: before.get(name) ?? 0,
      diff: round((nowBy.get(name) ?? 0) - (before.get(name) ?? 0)),
    }));
    const rise = changes.reduce<(typeof changes)[number] | null>((best, c) => (c.diff >= 1 && (!best || c.diff > best.diff) ? c : best), null);
    const fall = changes.reduce<(typeof changes)[number] | null>((best, c) => (c.diff <= -1 && (!best || c.diff < best.diff) ? c : best), null);
    const vs = period.prevWhen ? `this time ${period.prevWhen}` : period.prev;
    if (rise) {
      slides.push({
        id: "mover",
        big: signed(rise.diff),
        label: `${rise.name} vs ${vs}`,
        say: `Up from ${dollars(rise.was)}.${fall ? ` ${fall.name} fell ${dollars(-fall.diff)}.` : ""}`,
        palette: "red",
      });
    } else if (fall) {
      slides.push({
        id: "mover",
        big: signed(fall.diff),
        label: `${fall.name} vs ${vs}`,
        say: `Down from ${dollars(fall.was)}. Nothing went up.`,
        palette: "green",
      });
    }
  }

  // The pace against the same stretch before.
  const { now: spentNow, then } = input.pace;
  const paceDiff = round(spentNow - then);
  if (then > 0 && Math.abs(paceDiff) >= 1) {
    slides.push(
      period.prevWhen
        ? {
            id: "pace",
            big: signed(paceDiff),
            label: `${paceDiff < 0 ? "under" : "over"} ${possessive(period.prev)} pace`,
            say: `${dollars(spentNow)} so far, against ${dollars(then)} by now ${period.prevWhen}.`,
            palette: "amber",
          }
        : {
            id: "pace",
            big: signed(paceDiff),
            label: `${paceDiff < 0 ? "less" : "more"} spent than ${period.prev}`,
            say: `${dollars(spentNow)} against ${dollars(then)}.`,
            palette: "amber",
          }
    );
  }

  // The next thing due. Always told: "nothing" is news too.
  const [next] = input.due;
  if (next) {
    const day = addDays(now, next.daysUntil);
    const when = next.daysUntil <= 0 ? "today" : next.daysUntil === 1 ? "tomorrow" : `on ${format(day, "EEEE")}`;
    const hasAmount = next.amount !== null && next.amount > 0;
    slides.push({
      id: "due",
      big: hasAmount ? formatCurrency(next.amount!) : next.daysUntil <= 0 ? "Today" : next.daysUntil === 1 ? "Tomorrow" : format(day, "EEE"),
      label: hasAmount ? `${next.name} ${when}` : next.name,
      say: input.due.length === 1 ? "The only thing due in the next 7 days." : `The first of ${input.due.length} things due in the next 7 days.`,
      palette: "violet",
    });
  } else {
    slides.push({ id: "due", big: "$0", label: "due in the next 7 days", say: "Nothing to pay this week.", palette: "green" });
  }

  // Each screen its own colour: no two neighbours alike, the last against the first too.
  for (let i = 1; i < slides.length; i++) {
    const prev = slides[i - 1]!.palette;
    const after = i === slides.length - 1 && slides.length > 2 ? slides[0]!.palette : slides[i + 1]?.palette;
    if (slides[i]!.palette === prev || (i === slides.length - 1 && slides[i]!.palette === after)) {
      slides[i]!.palette = ORDER.find((p) => p !== prev && p !== after)!;
    }
  }
  return slides;
}
