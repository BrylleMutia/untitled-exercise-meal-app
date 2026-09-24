import type { DraftEnvelope, ExpectedVersions } from "@/types/backend";

const DB_NAME = "calicoach-drafts";
const STORE_NAME = "drafts";
const LOCAL_PREFIX = "calicoach:draft:v1:";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Draft lifetimes are intentionally separate from durable domain retention.
 * The prefix match keeps future feature-local draft types on the same policy
 * until their dedicated editor is introduced.
 */
export const DRAFT_TTL_MS = {
  profile: 30 * DAY,
  onboarding: 30 * DAY,
  // Workout drafts are cleared on confirmed completion or abandonment.
  workout: Number.POSITIVE_INFINITY,
  nutrition: 7 * DAY,
  textMeal: 7 * DAY,
  plannedMeal: 7 * DAY,
  recipe: 7 * DAY,
  grocery: 7 * DAY,
} as const;

export function draftTtlMs(draftType: string): number {
  if (draftType === "onboarding" || draftType === "profile") return DRAFT_TTL_MS.profile;
  if (draftType.startsWith("workout-session:")) return DRAFT_TTL_MS.workout;
  if (draftType.startsWith("nutrition-") || draftType.startsWith("text-meal:")) {
    return draftType.startsWith("text-meal:") ? DRAFT_TTL_MS.textMeal : DRAFT_TTL_MS.nutrition;
  }
  if (draftType.startsWith("planned-meal:")) return DRAFT_TTL_MS.plannedMeal;
  if (draftType.startsWith("recipe:")) return DRAFT_TTL_MS.recipe;
  if (draftType.startsWith("grocery-")) return DRAFT_TTL_MS.grocery;
  return DRAFT_TTL_MS.nutrition;
}

function browserAvailable() {
  return typeof window !== "undefined";
}

function localKey(userId: string, draftType: string) {
  return `${LOCAL_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(draftType)}`;
}

function isFresh<T>(value: unknown, userId?: string, draftType?: string): value is DraftEnvelope<T> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DraftEnvelope<T>>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.userId !== "string" ||
    candidate.userId.length === 0 ||
    typeof candidate.draftType !== "string" ||
    candidate.draftType.length === 0 ||
    !candidate.baseVersions ||
    typeof candidate.baseVersions !== "object" ||
    Array.isArray(candidate.baseVersions)
  ) return false;
  if (userId !== undefined && candidate.userId !== userId) return false;
  if (draftType !== undefined && candidate.draftType !== draftType) return false;
  if (typeof candidate.updatedAt !== "string" || typeof candidate.expiresAt !== "string") return false;
  const expiresAt = Date.parse(candidate.expiresAt);
  const updatedAt = Date.parse(candidate.updatedAt);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(updatedAt) || expiresAt <= updatedAt || expiresAt <= Date.now()) {
    return false;
  }
  return Object.values(candidate.baseVersions as Record<string, unknown>).every(
    (version) => typeof version === "number" && Number.isInteger(version) && version >= 1,
  );
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

function readLegacyLocal<T>(userId: string, draftType: string): DraftEnvelope<T> | null {
  if (!browserAvailable() || draftType !== "onboarding") return null;
  try {
    const raw = window.localStorage.getItem(`calicoach:onboarding-draft:${userId}`);
    if (!raw) return null;
    const payload = JSON.parse(raw) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return createDraftEnvelope({
      userId,
      draftType,
      payload: payload as T,
      ttlMs: DRAFT_TTL_MS.onboarding,
    });
  } catch {
    return null;
  }
}

function writeLocal<T>(value: DraftEnvelope<T>): boolean {
  if (!browserAvailable()) return false;
  try {
    window.localStorage.setItem(localKey(value.userId, value.draftType), JSON.stringify(value));
    return true;
  } catch {
    // Storage can be unavailable or full; the in-memory form remains authoritative until retry.
    return false;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (!browserAvailable() || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbKey(userId: string, draftType: string) {
  return `${userId}:${draftType}`;
}

function unpackIndexedDraft<T>(raw: unknown): DraftEnvelope<T> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as { value?: unknown };
  // Older records were written flat; newer records use an explicit value
  // field. Read both shapes so a browser upgrade never loses a recoverable
  // draft.
  const value = "value" in record ? record.value : raw;
  return isFresh<T>(value, undefined, undefined) ? value : null;
}

export function createDraftEnvelope<T>(input: {
  userId: string;
  draftType: string;
  payload: T;
  baseVersions?: ExpectedVersions;
  ttlMs: number;
}): DraftEnvelope<T> {
  const now = new Date();
  const baseVersions = Object.fromEntries(
    Object.entries(input.baseVersions ?? {}).filter(([, version]) => version !== undefined),
  ) as ExpectedVersions;
  const expiresAt = input.ttlMs === Number.POSITIVE_INFINITY
    ? "9999-12-31T23:59:59.999Z"
    : new Date(now.getTime() + input.ttlMs).toISOString();
  return {
    schemaVersion: 1,
    userId: input.userId,
    draftType: input.draftType,
    baseVersions,
    updatedAt: now.toISOString(),
    expiresAt,
    payload: input.payload,
  };
}

function newest<T>(...values: Array<DraftEnvelope<T> | null>): DraftEnvelope<T> | null {
  return values
    .filter((value): value is DraftEnvelope<T> => Boolean(value))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}

async function readIndexed<T>(
  db: IDBDatabase,
  userId: string,
  draftType: string,
): Promise<DraftEnvelope<T> | null> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(idbKey(userId, draftType));
      request.onsuccess = () => {
        const value = unpackIndexedDraft<T>(request.result);
        resolve(value && isFresh<T>(value, userId, draftType) ? value : null);
      };
      request.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function readDraft<T>(userId: string, draftType: string): Promise<DraftEnvelope<T> | null> {
  const fallback = newest(readLocal<T>(userId, draftType), readLegacyLocal<T>(userId, draftType));
  const db = await openDb();
  if (!db) return fallback;
  const primary = await readIndexed<T>(db, userId, draftType);
  return newest(primary, fallback);
}

async function writeIndexed<T>(value: DraftEnvelope<T>, db: IDBDatabase): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ key: idbKey(value.userId, value.draftType), value });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** Returns false when neither IndexedDB nor the localStorage fallback accepted the draft. */
export async function writeDraft<T>(value: DraftEnvelope<T>): Promise<boolean> {
  const db = await openDb();
  if (db && await writeIndexed(value, db)) return true;
  return writeLocal(value);
}

export async function clearDraft(userId: string, draftType: string): Promise<void> {
  if (browserAvailable()) {
    try {
      window.localStorage.removeItem(localKey(userId, draftType));
      // Remove the pre-envelope keys written by the first draft implementation.
      if (draftType === "onboarding") {
        window.localStorage.removeItem(`calicoach:onboarding-draft:${userId}`);
      }
    } catch { /* best effort */ }
  }
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(idbKey(userId, draftType));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearUserDrafts(userId: string): Promise<void> {
  if (browserAvailable()) {
    try {
      const prefix = `${LOCAL_PREFIX}${encodeURIComponent(userId)}:`;
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (
          key?.startsWith(prefix) ||
          key === `calicoach:onboarding-draft:${userId}`
        ) window.localStorage.removeItem(key);
      }
    } catch { /* best effort */ }
  }
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
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
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Inspect recoverable drafts without exposing another account's records. */
export async function listDrafts(userId: string): Promise<DraftEnvelope<unknown>[]> {
  if (!browserAvailable() || !userId) return [];
  const localValues: DraftEnvelope<unknown>[] = [];
  try {
    const prefix = `${LOCAL_PREFIX}${encodeURIComponent(userId)}:`;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const draftType = decodeURIComponent(key.slice(prefix.length));
      const value = readLocal<unknown>(userId, draftType);
      if (value) localValues.push(value);
    }
  } catch {
    // IndexedDB can still provide the list when localStorage is unavailable.
  }
  const legacyOnboarding = readLegacyLocal<unknown>(userId, "onboarding");
  if (legacyOnboarding) localValues.push(legacyOnboarding);

  const db = await openDb();
  if (!db) return localValues;
  const indexedValues = await new Promise<DraftEnvelope<unknown>[]>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).openCursor();
      const values: DraftEnvelope<unknown>[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(values);
          return;
        }
        const value = unpackIndexedDraft<unknown>(cursor.value);
        if (value && isFresh<unknown>(value, userId)) values.push(value);
        cursor.continue();
      };
      request.onerror = () => resolve(values);
      transaction.onabort = () => resolve(values);
    } catch {
      resolve([]);
    }
  });

  const byType = new Map<string, DraftEnvelope<unknown>>();
  for (const value of [...localValues, ...indexedValues]) {
    const current = byType.get(value.draftType);
    if (!current || Date.parse(value.updatedAt) > Date.parse(current.updatedAt)) {
      byType.set(value.draftType, value);
    }
  }
  return [...byType.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
