import { afterEach, describe, expect, it } from "vitest";
import {
  clearDraft,
  clearUserDrafts,
  createDraftEnvelope,
  draftTtlMs,
  listDrafts,
  readDraft,
  writeDraft,
} from "./draftStore";

function installLocalStorage() {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    clear: () => values.clear(),
  } as Storage;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage } as unknown as Window & typeof globalThis,
  });
  return values;
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
});

describe("draftStore", () => {
  it("round-trips an envelope and isolates accounts", async () => {
    installLocalStorage();
    const envelope = createDraftEnvelope({
      userId: "user-a",
      draftType: "profile",
      payload: { name: "A" },
      baseVersions: { profileRevision: 3 },
      ttlMs: 60_000,
    });
    await writeDraft(envelope);

    expect((await readDraft<{ name: string }>("user-a", "profile"))?.payload.name).toBe("A");
    expect(await readDraft("user-b", "profile")).toBeNull();
  });

  it("fails closed for expired and corrupt values", async () => {
    const values = installLocalStorage();
    const expired = createDraftEnvelope({
      userId: "user-a",
      draftType: "nutrition",
      payload: { text: "old" },
      ttlMs: -1,
    });
    await writeDraft(expired);
    expect(await readDraft("user-a", "nutrition")).toBeNull();

    values.set("calicoach:draft:v1:user-a:corrupt", "not-json");
    expect(await readDraft("user-a", "corrupt")).toBeNull();
  });

  it("clears a draft without affecting another draft type", async () => {
    installLocalStorage();
    await writeDraft(createDraftEnvelope({ userId: "user-a", draftType: "one", payload: 1, ttlMs: 60_000 }));
    await writeDraft(createDraftEnvelope({ userId: "user-a", draftType: "two", payload: 2, ttlMs: 60_000 }));
    await clearDraft("user-a", "one");

    expect(await readDraft("user-a", "one")).toBeNull();
    expect((await readDraft<number>("user-a", "two"))?.payload).toBe(2);
  });

  it("uses the documented lifetimes and lists only the current account", async () => {
    installLocalStorage();
    await writeDraft(createDraftEnvelope({ userId: "user-a", draftType: "recipe:one", payload: { name: "A" }, ttlMs: draftTtlMs("recipe:one") }));
    await writeDraft(createDraftEnvelope({ userId: "user-b", draftType: "recipe:one", payload: { name: "B" }, ttlMs: draftTtlMs("recipe:one") }));

    expect(draftTtlMs("onboarding")).toBe(30 * 24 * 60 * 60 * 1000);
    expect(draftTtlMs("workout-session:session-1")).toBe(Number.POSITIVE_INFINITY);
    expect(draftTtlMs("nutrition-custom:2026-09-18:breakfast")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(await listDrafts("user-a")).toHaveLength(1);
    expect((await listDrafts("user-a"))[0]?.payload).toEqual({ name: "A" });

    await clearUserDrafts("user-a");
    expect(await listDrafts("user-a")).toHaveLength(0);
    expect(await listDrafts("user-b")).toHaveLength(1);
  });

  it("normalizes optional base versions and fails closed for malformed versions", async () => {
    const values = installLocalStorage();
    const envelope = createDraftEnvelope({
      userId: "user-a",
      draftType: "profile",
      payload: { name: "A" },
      baseVersions: { profileRevision: 2, goalVersion: undefined },
      ttlMs: 60_000,
    });
    expect(await writeDraft(envelope)).toBe(true);
    expect((await readDraft<{ name: string }>("user-a", "profile"))?.baseVersions).toEqual({ profileRevision: 2 });

    values.set(
      "calicoach:draft:v1:user-a:broken",
      JSON.stringify({ ...envelope, draftType: "broken", baseVersions: { profileRevision: 1.5 } }),
    );
    expect(await readDraft("user-a", "broken")).toBeNull();
  });

  it("reports when no browser storage accepts a draft", async () => {
    const values = installLocalStorage();
    const storage = (window as Window & typeof globalThis).localStorage;
    storage.setItem = () => { throw new Error("quota"); };
    values.clear();
    expect(await writeDraft(createDraftEnvelope({ userId: "user-a", draftType: "profile", payload: {}, ttlMs: 60_000 }))).toBe(false);
  });
});
