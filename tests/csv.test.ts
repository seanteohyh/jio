import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

/** Part 1 §E — lightweight CSV export. `downloadCsv` itself is a thin
 *  Blob/anchor wrapper with nothing to unit test outside a real browser;
 *  `toCsv`'s escaping is the part worth pinning down. */
describe("toCsv", () => {
  it("joins headers and rows with commas and newlines", () => {
    expect(toCsv(["name", "count"], [["Alex", 3], ["Mei", 5]])).toBe(
      "name,count\nAlex,3\nMei,5"
    );
  });

  it("quotes a field containing a comma", () => {
    expect(toCsv(["name"], [["Char, Kway Teow"]])).toBe(
      'name\n"Char, Kway Teow"'
    );
  });

  it("quotes and doubles an embedded quote", () => {
    expect(toCsv(["name"], [['Ah "Boss" Chan']])).toBe(
      'name\n"Ah ""Boss"" Chan"'
    );
  });

  it("quotes a field containing a newline", () => {
    expect(toCsv(["notes"], [["line one\nline two"]])).toBe(
      'notes\n"line one\nline two"'
    );
  });

  it("leaves a plain field unquoted", () => {
    expect(toCsv(["name"], [["Zam Zam"]])).toBe("name\nZam Zam");
  });
});
