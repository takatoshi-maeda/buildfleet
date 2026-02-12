import { describe, expect, it } from "vitest";
import { createUlid } from "../src/shared/ulid.js";

describe("createUlid", () => {
  it("creates a 26-char Crockford base32 identifier", () => {
    const ulid = createUlid(1_705_000_000_000);
    expect(ulid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/u);
  });

  it("sorts lexicographically by timestamp", () => {
    const a = createUlid(1_705_000_000_000);
    const b = createUlid(1_705_000_000_001);
    expect(a < b).toBe(true);
  });
});
