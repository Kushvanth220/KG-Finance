import { describe, expect, it } from "vitest";
import { suggestCategoryName } from "./category-typos";

describe("suggestCategoryName", () => {
  it("fixes the misspelled names in the workspace", () => {
    expect(suggestCategoryName("Settelment")).toBe("Settlement");
    expect(suggestCategoryName("Eduction Loan")).toBe("Education Loan");
    expect(suggestCategoryName("Entertinment")).toBe("Entertainment");
    expect(suggestCategoryName("Cousmetics")).toBe("Cosmetics");
  });

  it("leaves names that read fine alone", () => {
    for (const name of [
      "Food", "Groceries", "Gas", "Cash withdraw", "Subscription", "Car loan", "Car maintenance", "Room Rent",
      "College Fee", "India", "Debt Clear", "Hair Cut", "DD Account", "Transfer to another Account",
      "G Birthday", "Mobile bill", "Shopping", "Netflix", "Costco",
    ]) {
      expect(suggestCategoryName(name), name).toBeNull();
    }
  });

  it("never turns a plural into a singular", () => {
    expect(suggestCategoryName("Movie")).toBeNull();
  });

  it("keeps lower case when the name was written that way", () => {
    expect(suggestCategoryName("settelment")).toBe("settlement");
  });
});
