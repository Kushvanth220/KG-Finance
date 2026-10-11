import { describe, expect, it } from "vitest";
import { AWAY_REPLAY_MS, LAST_SEEN_KEY, awayFor, markLeft, replaysAfterAway } from "./launch-state";

/** A stand-in for the tab's session storage. */
function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const MINUTE = 60_000;

describe("replaysAfterAway", () => {
  it("is five minutes", () => {
    expect(AWAY_REPLAY_MS).toBe(5 * MINUTE);
  });

  it("does not replay for a quick look elsewhere", () => {
    expect(replaysAfterAway(0)).toBe(false);
    expect(replaysAfterAway(30_000)).toBe(false);
    expect(replaysAfterAway(5 * MINUTE - 1)).toBe(false);
  });

  it("replays from five minutes on", () => {
    expect(replaysAfterAway(5 * MINUTE)).toBe(true);
    expect(replaysAfterAway(42 * MINUTE)).toBe(true);
    expect(replaysAfterAway(Infinity)).toBe(true);
  });
});

describe("markLeft and awayFor", () => {
  it("measures from the moment the app left the screen", () => {
    const store = memoryStore();
    markLeft(1_000_000, store);
    expect(store.getItem(LAST_SEEN_KEY)).toBe("1000000");
    expect(awayFor(1_000_000 + 2 * MINUTE, store)).toBe(2 * MINUTE);
  });

  it("treats a tab that never showed the app as a new visit", () => {
    expect(awayFor(Date.now(), memoryStore())).toBe(Infinity);
    expect(replaysAfterAway(awayFor(Date.now(), memoryStore()))).toBe(true);
  });

  it("treats blocked storage as a long absence, so the app still opens with its entrance", () => {
    expect(awayFor(Date.now(), null)).toBe(Infinity);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(() => markLeft(Date.now(), broken)).not.toThrow();
    expect(awayFor(Date.now(), broken)).toBe(Infinity);
  });

  it("ignores a clock that went backwards", () => {
    const store = memoryStore();
    markLeft(5_000_000, store);
    expect(awayFor(4_000_000, store)).toBe(0);
  });

  it("ignores rubbish in storage", () => {
    const store = memoryStore();
    store.setItem(LAST_SEEN_KEY, "not a time");
    expect(awayFor(Date.now(), store)).toBe(Infinity);
  });
});
