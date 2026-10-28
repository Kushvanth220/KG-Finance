import { describe, expect, it } from "vitest";
import { resolveBar } from "./nav-config";

const hrefs = (saved: string[] | null) => resolveBar(saved).map((choice) => choice.href);

describe("resolveBar", () => {
  it("starts with Home, History and Balance", () => {
    expect(hrefs(null)).toEqual(["/", "/history", "/balance"]);
  });

  it("keeps the saved pages in their order", () => {
    expect(hrefs(["/accounts", "/", "/flex"])).toEqual(["/accounts", "/", "/flex"]);
  });

  it("drops unknown pages and repeats, and tops up from the usual ones", () => {
    expect(hrefs(["/accounts", "/accounts", "/nowhere"])).toEqual(["/accounts", "/", "/history"]);
  });

  it("never holds more than three", () => {
    expect(hrefs(["/", "/history", "/balance", "/accounts"])).toHaveLength(3);
  });
});
