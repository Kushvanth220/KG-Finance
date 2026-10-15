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
  reminders: [{ text: "Phone bill", daysUntil: 4, time: null, amount: 64.99 }],
  now: NOW,
};

describe("buildMoneyStory", () => {
  it("opens with the reminders, then tells kept, share, mover and pace", () => {
    const slides = buildMoneyStory(base);
    expect(slides.map((s) => s.id)).toEqual(["reminders", "kept", "share", "mover", "pace"]);
    expect(slides[0]).toMatchObject({
      big: "1",
      label: "reminder this week",
      list: [{ text: "Phone bill · $64.99", when: "Thu" }],
      say: "",
    });
    expect(slides[1]).toMatchObject({ big: "$640", label: "kept in October", say: "That's 14% of the $4,560 that came in." });
    expect(slides[2]).toMatchObject({ big: "66%", label: "of spending went to Rent", say: "More than everything else put together." });
    expect(slides[3]).toMatchObject({
      big: "+$84",
      label: "Groceries vs this time in September",
      say: "Up from $436. Eating out fell $62.",
    });
    expect(slides[4]).toMatchObject({
      big: "−$214",
      label: "under September's pace",
      say: "$1,240 so far, against $1,454 by now in September.",
    });
  });

  it("counts today's reminders and lists them first, then what is coming", () => {
    const [first] = buildMoneyStory({
      ...base,
      reminders: [
        { text: "Gym", daysUntil: 0, time: "6:30 AM" },
        { text: "DD", daysUntil: 0 },
        { text: "Car Wash", daysUntil: 2 },
      ],
    });
    expect(first).toMatchObject({
      big: "2",
      label: "reminders today",
      list: [
        { text: "Gym", when: "6:30 AM" },
        { text: "DD", when: "Today" },
        { text: "Car Wash", when: "Tue" },
      ],
      say: "",
    });
  });

  it("lists three and counts the rest", () => {
    const [first] = buildMoneyStory({
      ...base,
      reminders: [
        { text: "Rent", daysUntil: 1, time: "9:00 AM" },
        { text: "Gym Sub", daysUntil: 2 },
        { text: "Mobile Bill", daysUntil: 3 },
        { text: "Car Bill", daysUntil: 5 },
        { text: "India", daysUntil: 6 },
      ],
    });
    expect(first.list).toEqual([
      { text: "Rent", when: "Tomorrow 9:00 AM" },
      { text: "Gym Sub", when: "Tue" },
      { text: "Mobile Bill", when: "Wed" },
    ]);
    expect(first).toMatchObject({ big: "5", label: "reminders this week", say: "And 2 more this week." });
  });

  it("says overspent when more went out than came in", () => {
    const kept = buildMoneyStory({ ...base, incomeTotal: 3780, spendTotal: 3994 }).find((s) => s.id === "kept");
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
    expect(slides.map((s) => s.id)).toEqual(["reminders", "kept", "share"]);
  });

  it("still tells a quiet period, and that there is nothing to remember", () => {
    const slides = buildMoneyStory({
      ...base,
      incomeTotal: 0,
      spendTotal: 0,
      categories: [],
      prevCategories: [],
      pace: { now: 0, then: 0 },
      reminders: [],
    });
    expect(slides.map((s) => [s.id, s.big, s.say])).toEqual([
      ["reminders", "0", "Nothing to remember this week."],
      ["quiet", "$0", "Nothing recorded for these days yet."],
    ]);
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
      buildMoneyStory({ ...base, reminders: [] }),
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
