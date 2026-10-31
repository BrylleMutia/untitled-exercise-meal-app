import { afterEach, describe, expect, it, vi } from "vitest";
import { createUuid } from "./uuid";

afterEach(() => vi.unstubAllGlobals());

describe("createUuid", () => {
  it("uses native UUID generation when available", () => {
    const randomUUID = vi.fn(() => "12345678-1234-4123-8123-123456789abc");
    vi.stubGlobal("crypto", { randomUUID });
    expect(createUuid()).toBe("12345678-1234-4123-8123-123456789abc");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("generates v4 UUIDs with the correct variant on HTTP without randomUUID", () => {
    for (const value of [0, 255]) {
      vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(value) });
      expect(createUuid()).toBe(value === 0
        ? "00000000-0000-4000-8000-000000000000"
        : "ffffffff-ffff-4fff-bfff-ffffffffffff");
    }
  });

  it("draws fresh cryptographic randomness for each fallback ID", () => {
    const crypto = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const ids = Array.from({ length: 100 }, createUuid);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  });

  it("fails clearly if the browser has no cryptographic random source", () => {
    vi.stubGlobal("crypto", undefined);
    expect(createUuid).toThrow("Secure random ID generation is unavailable");
  });
});
