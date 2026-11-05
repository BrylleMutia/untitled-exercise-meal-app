import { describe, expect, it } from "vitest";
import { swipeDecision } from "./cardSwiper";

describe("swipe decision threshold and final direction mapping", () => {
  it.each([200, 320, 700])("requires the full bounded horizontal threshold at width %i", width => {
    const threshold = Math.min(96, Math.max(56, width * .22));
    expect(swipeDecision(threshold - .01, width)).toBeNull();
    expect(swipeDecision(1 - threshold, width)).toBeNull();
    expect(swipeDecision(threshold, width)).toBe("add");
    expect(swipeDecision(-threshold, width)).toBe("skip");
  });
  it("never commits unavailable geometry or invalid coordinates", () => {
    for (const [distance, width] of [[100, 0], [100, -20], [100, Infinity], [NaN, 320]]) expect(swipeDecision(distance, width)).toBeNull();
  });
});
