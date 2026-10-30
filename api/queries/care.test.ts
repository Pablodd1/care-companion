import { describe, expect, it } from "vitest";
import { dayOffset, minutesFromTime, parseTimes } from "./care";

describe("parseTimes", () => {
  it("reads a JSON array of HH:MM strings", () => {
    expect(parseTimes('["08:00","20:00"]')).toEqual(["08:00", "20:00"]);
  });
  it("drops non-string entries", () => {
    expect(parseTimes('[8, "08:00", null]')).toEqual(["08:00"]);
  });
  it("returns empty for junk instead of throwing", () => {
    expect(parseTimes("not json")).toEqual([]);
    expect(parseTimes('{"a":1}')).toEqual([]);
    expect(parseTimes("")).toEqual([]);
  });
});

describe("minutesFromTime", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(minutesFromTime("00:00")).toBe(0);
    expect(minutesFromTime("08:05")).toBe(485);
    expect(minutesFromTime("23:59")).toBe(1439);
  });
});

describe("dayOffset", () => {
  it("steps within a month", () => {
    expect(dayOffset("2026-10-28", 3)).toBe("2026-10-31");
    expect(dayOffset("2026-10-28", -27)).toBe("2026-10-01");
  });
  it("crosses month and year boundaries", () => {
    expect(dayOffset("2026-10-31", 1)).toBe("2026-11-01");
    expect(dayOffset("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayOffset("2027-01-01", -1)).toBe("2026-12-31");
  });
  it("handles leap-day arithmetic", () => {
    expect(dayOffset("2028-02-28", 1)).toBe("2028-02-29");
  });
});
