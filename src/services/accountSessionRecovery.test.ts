import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { createSupabaseRepository } from "./supabaseRepository";

const { loadSnapshot } = vi.hoisted(() => ({ loadSnapshot: vi.fn() }));
vi.mock("./supabaseSnapshot", () => ({ loadAppSnapshot: loadSnapshot }));

const expired = () => new Error("invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired");
const getClaims = vi.fn();
const refreshSession = vi.fn();
const client = { auth: { getClaims, refreshSession } } as unknown as SupabaseClient<Database>;
const claims = (id = "owner") => ({ data: { claims: { sub: id } }, error: null });
const snapshot = { userId: "owner", profile: { calendarRevision: 1 } };

beforeEach(() => {
  vi.resetAllMocks();
  getClaims.mockResolvedValue(claims());
  refreshSession.mockResolvedValue({ data: { session: { user: { id: "owner" } } }, error: null });
  loadSnapshot.mockResolvedValue(snapshot);
});

describe("initial account session recovery", () => {
  it("does not refresh a successful account read", async () => {
    expect(await createSupabaseRepository(client).load()).toBe(snapshot);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes a server-expired token even when local claims appear current", async () => {
    loadSnapshot.mockRejectedValueOnce(expired());
    expect(await createSupabaseRepository(client).load()).toBe(snapshot);
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(getClaims).toHaveBeenCalledTimes(2);
  });

  it("also recovers expiry rejected during claims verification", async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: { message: "JWT expired", status: 400 } });
    expect(await createSupabaseRepository(client).load()).toBe(snapshot);
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(loadSnapshot).toHaveBeenCalledOnce();
  });

  it("retries only once if the refreshed token is also rejected", async () => {
    loadSnapshot.mockRejectedValue(expired());
    await expect(createSupabaseRepository(client).load()).rejects.toThrow("token is expired");
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it("preserves network failures without attempting authentication recovery", async () => {
    loadSnapshot.mockRejectedValue(new Error("Failed to fetch"));
    await expect(createSupabaseRepository(client).load()).rejects.toThrow("Failed to fetch");
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("returns a typed error when the refresh fails", async () => {
    loadSnapshot.mockRejectedValueOnce(expired());
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "Refresh token not found", status: 401 } });
    await expect(createSupabaseRepository(client).load()).rejects.toMatchObject({ repositoryError: { code: "not_authenticated" } });
    expect(loadSnapshot).toHaveBeenCalledOnce();
  });

  it("does not load another account if the session changes during refresh", async () => {
    loadSnapshot.mockRejectedValueOnce(expired());
    refreshSession.mockResolvedValue({ data: { session: { user: { id: "other" } } }, error: null });
    await expect(createSupabaseRepository(client).load()).rejects.toMatchObject({ repositoryError: { code: "not_authenticated" } });
    expect(loadSnapshot).toHaveBeenCalledOnce();
  });

  it("checks account identity again after refresh before loading data", async () => {
    loadSnapshot.mockRejectedValueOnce(expired());
    getClaims.mockResolvedValueOnce(claims()).mockResolvedValueOnce(claims("other"));
    await expect(createSupabaseRepository(client).load()).rejects.toMatchObject({ repositoryError: { code: "not_authenticated" } });
    expect(loadSnapshot).toHaveBeenCalledOnce();
  });

  it("leaves a missing session unsigned-in", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect(await createSupabaseRepository(client).load()).toBeNull();
    expect(refreshSession).not.toHaveBeenCalled();
    expect(loadSnapshot).not.toHaveBeenCalled();
  });
});
