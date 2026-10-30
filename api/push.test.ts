import { describe, expect, it } from "vitest";
import { isWithinDeliveryWindow } from "./push";

describe("isWithinDeliveryWindow", () => {
  it("fires at the scheduled minute and within 20 minutes after", () => {
    expect(isWithinDeliveryWindow(8 * 60, 8 * 60)).toBe(true);
    expect(isWithinDeliveryWindow(8 * 60 + 20, 8 * 60)).toBe(true);
  });
  it("does not fire early or after the window closes", () => {
    expect(isWithinDeliveryWindow(8 * 60 - 1, 8 * 60)).toBe(false);
    expect(isWithinDeliveryWindow(8 * 60 + 21, 8 * 60)).toBe(false);
  });
});
