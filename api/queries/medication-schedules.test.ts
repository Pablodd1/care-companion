import { describe, expect, it } from "vitest";
import { dayAndMinutesInTimezone, dayInTimezone, isValidTimezone } from "./medication-schedules";

describe("dayInTimezone", () => {
  it("maps an instant to the profile-local calendar day", () => {
    // 2026-10-28T02:30Z is still Oct 27 in New York (UTC-4, DST).
    expect(dayInTimezone(new Date("2026-10-28T02:30:00Z"), "America/New_York")).toBe("2026-10-27");
    expect(dayInTimezone(new Date("2026-10-28T02:30:00Z"), "UTC")).toBe("2026-10-28");
  });
  it("uses standard time after DST ends", () => {
    // 2026-11-05T04:30Z is Nov 4 in New York (UTC-5, standard time).
    expect(dayInTimezone(new Date("2026-11-05T04:30:00Z"), "America/New_York")).toBe("2026-11-04");
  });
});

describe("dayAndMinutesInTimezone", () => {
  it("returns the local day and minutes-since-midnight", () => {
    const { day, minutes } = dayAndMinutesInTimezone(new Date("2026-10-28T19:05:00Z"), "America/New_York");
    expect(day).toBe("2026-10-28");
    expect(minutes).toBe(15 * 60 + 5);
  });
});

describe("isValidTimezone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});
