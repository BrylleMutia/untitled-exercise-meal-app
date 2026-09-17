import { afterEach, describe, expect, it } from "vitest";
import {
  clearDraft,
  createDraftEnvelope,
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
});
