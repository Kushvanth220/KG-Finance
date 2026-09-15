import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rule, RuleEntry } from "@/lib/rules/types";

/**
 * The rules sync, driven end to end against a fake server.
 *
 * These exist because the first version silently dropped every block logged
 * on the other phone. Each case here is a way that loss can happen again.
 */

// ---- a browser-ish world for the persisted store ----
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => storage.clear(),
  },
  configurable: true,
});
Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });

let server: { ok: boolean; synced: boolean; rules: Rule[]; entries: RuleEntry[]; deleted: Record<string, string> };
const posts: Array<{ rules: Rule[]; entries: RuleEntry[]; deleted: Record<string, string> }> = [];

vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
  if (init?.method === "POST") {
    const body = JSON.parse(String(init.body));
    posts.push(body);
    // The fake server stores what it was sent, like the real upsert.
    server = { ok: true, synced: true, ...body };
    return { json: async () => ({ ok: true, synced: true }) };
  }
  return { json: async () => server };
});

const { useRulesStore, mergeRulesDocuments } = await import("@/store/rules-store");

const rule = (id: string): Rule => ({
  id,
  name: "Amazon Flex blocks",
  scope: "kushvanth",
  enabled: true,
  description: "",
  trigger: { kind: "conversation_start", question: "" },
  fields: [],
  followUps: [],
  calculations: [],
  charts: [],
  aggregates: [],
  repeatable: true,
  showOnDashboard: true,
  payout: { kind: "income", amountKey: "total", target: "Amazon Flex", autoPost: false },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
});

const entry = (id: string, at = "2026-09-08T10:00:00.000Z", values: Record<string, number> = { base_pay: 20 }): RuleEntry => ({
  id,
  ruleId: "R",
  date: "2026-09-08",
  openedAt: at,
  updatedAt: at,
  values,
  answered: [],
  complete: false,
});

const ids = (list: { id: string }[]) => list.map((x) => x.id).sort().join(",");
const reset = (state: Partial<{ rules: Rule[]; entries: RuleEntry[]; deleted: Record<string, string> }>) =>
  useRulesStore.setState({ rules: [], entries: [], deleted: {}, ...state });

beforeEach(() => {
  posts.length = 0;
  server = { ok: true, synced: true, rules: [], entries: [], deleted: {} };
});

describe("mergeRulesDocuments", () => {
  it("keeps records only one side has", () => {
    const merged = mergeRulesDocuments(
      { rules: [rule("R")], entries: [entry("a")], deleted: {} },
      { rules: [rule("R")], entries: [entry("b")], deleted: {} }
    );
    expect(ids(merged.entries)).toBe("a,b");
  });

  it("lets the newer version of the same record win", () => {
    const merged = mergeRulesDocuments(
      { rules: [rule("R")], entries: [entry("a", "2026-09-08T10:00:00.000Z", { base_pay: 20 })], deleted: {} },
      { rules: [rule("R")], entries: [entry("a", "2026-09-09T10:00:00.000Z", { base_pay: 20, tips: 7 })], deleted: {} }
    );
    expect(merged.entries[0]?.values.tips).toBe(7);
  });

  it("honours a headstone from either side", () => {
    const now = new Date().toISOString();
    const merged = mergeRulesDocuments(
      { rules: [rule("R")], entries: [entry("a"), entry("b")], deleted: { b: now } },
      { rules: [rule("R")], entries: [entry("a"), entry("b"), entry("c")], deleted: { c: now } }
    );
    expect(ids(merged.entries)).toBe("a");
  });

  it("drops entries whose rule is gone", () => {
    const merged = mergeRulesDocuments(
      { rules: [], entries: [entry("a")], deleted: { R: new Date().toISOString() } },
      { rules: [rule("R")], entries: [entry("a")], deleted: {} }
    );
    expect(merged.rules).toHaveLength(0);
    expect(merged.entries).toHaveLength(0);
  });
});

describe("hydrateFromServer", () => {
  it("pulls entries for a rule this device already knows", async () => {
    reset({ rules: [rule("R")], entries: [entry("e1")] });
    server = { ok: true, synced: true, rules: [rule("R")], entries: [entry("e1"), entry("e2"), entry("e3")], deleted: {} };
    await useRulesStore.getState().hydrateFromServer();
    expect(ids(useRulesStore.getState().entries)).toBe("e1,e2,e3");
  });

  it("does not rewrite state or push when both sides agree", async () => {
    reset({ rules: [rule("R")], entries: [entry("e1")] });
    const before = useRulesStore.getState().entries;
    server = { ok: true, synced: true, rules: [rule("R")], entries: [entry("e1")], deleted: {} };
    await useRulesStore.getState().hydrateFromServer();
    expect(useRulesStore.getState().entries).toBe(before);
    expect(posts).toHaveLength(0);
  });

  it("restores everything onto a wiped device", async () => {
    reset({});
    server = { ok: true, synced: true, rules: [rule("R")], entries: [entry("e1"), entry("e2")], deleted: {} };
    await useRulesStore.getState().hydrateFromServer();
    expect(useRulesStore.getState().rules).toHaveLength(1);
    expect(ids(useRulesStore.getState().entries)).toBe("e1,e2");
  });
});

describe("syncToServer (merge before push)", () => {
  it("a stale device's save cannot erase the other phone's blocks", async () => {
    // This device has been open a while and only knows e1; the other phone
    // has since saved e2 and e3. Logging e9 here must not wipe them.
    reset({ rules: [rule("R")], entries: [entry("e1"), entry("e9")] });
    server = { ok: true, synced: true, rules: [rule("R")], entries: [entry("e1"), entry("e2"), entry("e3")], deleted: {} };
    await useRulesStore.getState().syncToServer();
    expect(posts).toHaveLength(1);
    expect(ids(posts[0]!.entries)).toBe("e1,e2,e3,e9");
    // And this device now knows about them too.
    expect(ids(useRulesStore.getState().entries)).toBe("e1,e2,e3,e9");
  });

  it("a delete made here still travels", async () => {
    reset({ rules: [rule("R")], entries: [entry("e1")], deleted: { e2: new Date().toISOString() } });
    server = { ok: true, synced: true, rules: [rule("R")], entries: [entry("e1"), entry("e2")], deleted: {} };
    await useRulesStore.getState().syncToServer();
    expect(ids(posts[0]!.entries)).toBe("e1");
    expect(Object.keys(posts[0]!.deleted)).toContain("e2");
  });

  it("deleteEntry leaves a headstone and pushes it", async () => {
    reset({ rules: [rule("R")], entries: [entry("e1"), entry("e2")] });
    server = { ok: true, synced: true, rules: [rule("R")], entries: [entry("e1"), entry("e2")], deleted: {} };
    useRulesStore.getState().deleteEntry("e2");
    // deleteEntry fires syncToServer without awaiting; let it land.
    await new Promise((r) => setTimeout(r, 10));
    expect(ids(useRulesStore.getState().entries)).toBe("e1");
    expect(posts.at(-1)!.deleted.e2).toBeTruthy();
  });
});
