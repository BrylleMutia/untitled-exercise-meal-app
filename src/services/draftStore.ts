import type { DraftEnvelope, ExpectedVersions } from "@/types/backend";

const DB_NAME = "calicoach-drafts";
const STORE_NAME = "drafts";
const LOCAL_PREFIX = "calicoach:draft:v1:";

function browserAvailable() {
  return typeof window !== "undefined";
}

function localKey(userId: string, draftType: string) {
  return `${LOCAL_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(draftType)}`;
}

function isFresh<T>(value: unknown, userId?: string, draftType?: string): value is DraftEnvelope<T> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DraftEnvelope<T>>;
  if (candidate.schemaVersion !== 1 || typeof candidate.userId !== "string" || typeof candidate.draftType !== "string") return false;
  if (userId !== undefined && candidate.userId !== userId) return false;
  if (draftType !== undefined && candidate.draftType !== draftType) return false;
  if (typeof candidate.updatedAt !== "string" || typeof candidate.expiresAt !== "string") return false;
  const expiresAt = Date.parse(candidate.expiresAt);
  const updatedAt = Date.parse(candidate.updatedAt);
  return Number.isFinite(expiresAt) && Number.isFinite(updatedAt) && expiresAt > Date.now();
}

function readLocal<T>(userId: string, draftType: string): DraftEnvelope<T> | null {
  if (!browserAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(localKey(userId, draftType));
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    if (!isFresh<T>(value, userId, draftType)) {
      window.localStorage.removeItem(localKey(userId, draftType));
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function writeLocal<T>(value: DraftEnvelope<T>) {
  if (!browserAvailable()) return;
  try {
    window.localStorage.setItem(localKey(value.userId, value.draftType), JSON.stringify(value));
  } catch {
    // Storage can be unavailable or full; the in-memory form remains authoritative until retry.
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (!browserAvailable() || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbKey(userId: string, draftType: string) {
  return `${userId}:${draftType}`;
}

export function createDraftEnvelope<T>(input: {
  userId: string;
  draftType: string;
  payload: T;
  baseVersions?: ExpectedVersions;
  ttlMs: number;
}): DraftEnvelope<T> {
  const now = new Date();
  return {
    schemaVersion: 1,
    userId: input.userId,
    draftType: input.draftType,
    baseVersions: input.baseVersions ?? {},
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlMs).toISOString(),
    payload: input.payload,
  };
}

export async function readDraft<T>(userId: string, draftType: string): Promise<DraftEnvelope<T> | null> {
  const fallback = readLocal<T>(userId, draftType);
  const db = await openDb();
  if (!db) return fallback;
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(idbKey(userId, draftType));
    request.onsuccess = () => {
      const value = request.result?.value as DraftEnvelope<T> | undefined;
      if (!isFresh<T>(value ?? null, userId, draftType)) {
        if (value) void clearDraft(userId, draftType);
        resolve(fallback);
        return;
      }
      resolve(value ?? fallback);
    };
    request.onerror = () => resolve(fallback);
  });
}

export async function writeDraft<T>(value: DraftEnvelope<T>): Promise<void> {
  writeLocal(value);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ ...value, key: idbKey(value.userId, value.draftType) });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

export async function clearDraft(userId: string, draftType: string): Promise<void> {
  if (browserAvailable()) {
    try { window.localStorage.removeItem(localKey(userId, draftType)); } catch { /* best effort */ }
  }
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(idbKey(userId, draftType));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

export async function clearUserDrafts(userId: string): Promise<void> {
  if (browserAvailable()) {
    try {
      const prefix = `${LOCAL_PREFIX}${encodeURIComponent(userId)}:`;
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
      }
    } catch { /* best effort */ }
  }
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const value = cursor.value as { key?: string };
      if (value.key?.startsWith(`${userId}:`)) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}
