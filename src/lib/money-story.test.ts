import { describe, expect, it } from "vitest";
import { buildMoneyStory, storyPeriod, storyWindow, type MoneyStoryInput } from "@/lib/money-story";

const NOW = new Date(2026, 9, 11, 9, 30); // Sunday 11 October 2026

const base: MoneyStoryInput = {
  period: { in: "in October", prev: "September", prevWhen: "in September" },
  incomeTotal: 4560,
  spendTotal: 3920,
  categories: [
    { name: "Rent", amount: 1500 },
    { name: "Groceries", amount: 520 },
    { name: "Eating out", amount: 260 },
  ],
  prevCategories: [
    { name: "Rent", amount: 1500 },
    { name: "Groceries", amount: 436 },
    { name: "Eating out", amount: 322 },
  ],
  pace: { now: 1240, then: 1454 },
  due: [{ name: "Phone bill", amount: 64.99, daysUntil: 4 }],
  now: NOW,
};

describe("buildMoneyStory", () => {
  it("tells kept, share, mover, pace and due in order", () => {
    const slides = buildMoneyStory(base);
    expect(slides.map((s) => s.id)).toEqual(["kept", "share", "mover", "pace", "due"]);
    expect(slides[0]).toMatchObject({ big: "$640", label: "kept in October", say: "That's 14% of the $4,560 that came in." });
    expect(slides[1]).toMatchObject({ big: "66%", label: "of spending went to Rent", say: "More than everything else put together." });
    expect(slides[2]).toMatchObject({
      big: "+$84",
      label: "Groceries vs this time in September",
      say: "Up from $436. Eating out fell $62.",
    });
    expect(slides[3]).toMatchObject({
      big: "−$214",
      label: "under September's pace",
      say: "$1,240 so far, against $1,454 by now in September.",
    });
    expect(slides[4]).toMatchObject({ big: "$64.99", label: "Phone bill on Thursday", say: "The only thing due in the next 7 days." });
  });

  it("says overspent when more went out than came in", () => {
    const [kept] = buildMoneyStory({ ...base, incomeTotal: 3780, spendTotal: 3994 });
    expect(kept).toMatchObject({ big: "$214", label: "overspent in October", palette: "red" });
  });

  it("names the runner-up when the top category is not most of it", () => {
    const slides = buildMoneyStory({
      ...base,
      categories: [
        { name: "Groceries", amount: 400 },
        { name: "Gas", amount: 300 },
        { name: "Eating out", amount: 300 },
      ],
    });
    expect(slides.find((s) => s.id === "share")).toMatchObject({ big: "40%", say: "Next was Gas at $300." });
  });

  it("leaves out what it cannot compare", () => {
    const slides = buildMoneyStory({ ...base, prevCategories: [], pace: { now: 900, then: 0 } });
    expect(slides.map((s) => s.id)).toEqual(["kept", "share", "due"]);
  });

  it("still tells a quiet period, and that nothing is due", () => {
    const slides = buildMoneyStory({
      ...base,
      incomeTotal: 0,
      spendTotal: 0,
      categories: [],
      prevCategories: [],
      pace: { now: 0, then: 0 },
      due: [],
    });
    expect(slides.map((s) => [s.id, s.big])).toEqual([
      ["quiet", "$0"],
      ["due", "$0"],
    ]);
  });

  it("uses the day when a reminder has no amount", () => {
    const due = buildMoneyStory({ ...base, due: [{ name: "Call the bank", amount: null, daysUntil: 1 }, { name: "Rent", amount: 1500, daysUntil: 5 }] }).at(-1);
    expect(due).toMatchObject({ big: "Tomorrow", label: "Call the bank", say: "The first of 2 things due in the next 7 days." });
  });

  it("compares whole periods once the range is over", () => {
    const slides = buildMoneyStory({ ...base, period: { in: "in September", prev: "August" } });
    expect(slides.find((s) => s.id === "pace")).toMatchObject({ label: "less spent than August", say: "$1,240 against $1,454." });
    expect(slides.find((s) => s.id === "mover")?.label).toBe("Groceries vs August");
  });

  it("never puts the same colour on two screens in a row", () => {
    const stories = [
      buildMoneyStory(base),
      buildMoneyStory({ ...base, incomeTotal: 0 }),
      buildMoneyStory({ ...base, due: [] }),
      buildMoneyStory({ ...base, incomeTotal: 3920, prevCategories: [] }),
    ];
    for (const slides of stories) {
      slides.forEach((s, i) => {
        const next = slides[(i + 1) % slides.length]!;
        if (slides.length > 1) expect(s.palette).not.toBe(next.palette);
      });
    }
  });
});

describe("storyWindow", () => {
  const october = {
    start: new Date(2026, 9, 1),
    end: new Date(2026, 9, 31, 23, 59, 59, 999),
    prevStart: new Date(2026, 8, 1),
    prevEnd: new Date(2026, 8, 30, 23, 59, 59, 999),
  };

  it("cuts the month before to the same days while the month runs", () => {
    const w = storyWindow(october, NOW);
    expect(w.ongoing).toBe(true);
    expect(w.prevCut).toEqual(new Date(2026, 8, 11, 23, 59, 59, 999));
    expect(w.nowEnd).toEqual(new Date(2026, 9, 11, 23, 59, 59, 999));
  });

  it("never runs past the end of a shorter month", () => {
    const w = storyWindow(october, new Date(2026, 9, 31, 8));
    expect(w.prevCut).toEqual(october.prevEnd);
  });

  it("uses the whole periods once the range is over", () => {
    const w = storyWindow(october, new Date(2026, 10, 3));
    expect(w).toEqual({ ongoing: false, nowEnd: october.end, prevCut: october.prevEnd });
  });
});

describe("storyPeriod", () => {
  it("names months, weeks and picked days", () => {
    const range = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31), prevStart: new Date(2026, 8, 1), prevLabel: "Sep" };
    expect(storyPeriod("month", range, true)).toEqual({ in: "in October", prev: "September", prevWhen: "in September" });
    expect(storyPeriod("lastMonth", range, false)).toEqual({ in: "in October", prev: "September", prevWhen: undefined });
    expect(storyPeriod("week", range, true)).toEqual({ in: "this week", prev: "last week", prevWhen: "last week" });
    const picked = { start: new Date(2026, 9, 2), end: new Date(2026, 9, 10), prevStart: new Date(2026, 8, 23), prevLabel: "the 9 days before" };
    expect(storyPeriod("custom", picked, false)).toEqual({ in: "in these 9 days", prev: "the 9 days before" });
  });
});
