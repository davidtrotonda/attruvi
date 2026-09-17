import { describe, expect, it } from "vitest";
import { postbackRetryDelaySeconds } from "./retry";

describe("postbackRetryDelaySeconds", () => {
  it("aplica jitter acotado y respeta Retry-After", () => {
    expect(postbackRetryDelaySeconds(1, undefined, () => 0)).toBe(15);
    expect(postbackRetryDelaySeconds(3, undefined, () => 1)).toBe(120);
    expect(postbackRetryDelaySeconds(8, 77, () => 0)).toBe(77);
    expect(postbackRetryDelaySeconds(20, 99_999, () => 0)).toBe(21_600);
  });
});
