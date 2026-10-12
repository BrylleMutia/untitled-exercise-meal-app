import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRecipeImageCleanupHandler } from "./handler";

const batch = { leaseId: "lease", paths: ["owner/image.webp"] };
const deps = { authorized: vi.fn(() => true), claim: vi.fn(), remove: vi.fn(), complete: vi.fn() };
const handler = createRecipeImageCleanupHandler(deps);
const request = () => new Request("https://example.test/cleanup", { method: "POST" });
beforeEach(() => {
  vi.resetAllMocks(); deps.authorized.mockReturnValue(true);
  deps.claim.mockResolvedValue(batch); deps.remove.mockResolvedValue(undefined); deps.complete.mockResolvedValue(undefined);
});
describe("committed account media cleanup", () => {
  it("denies untrusted callers before reading jobs", async () => {
    deps.authorized.mockReturnValue(false);
    expect((await handler(request())).status).toBe(401);
    expect(deps.claim).not.toHaveBeenCalled();
  });
  it("removes through Storage before acknowledging a claimed job", async () => {
    expect(await (await handler(request())).json()).toEqual({ removed: 1 });
    expect(deps.remove).toHaveBeenCalledWith(batch.paths);
    expect(deps.complete).toHaveBeenCalledWith(batch);
    expect(deps.remove.mock.invocationCallOrder[0]).toBeLessThan(deps.complete.mock.invocationCallOrder[0]);
  });
  it("retains the job after a Storage failure without acknowledging removal", async () => {
    deps.remove.mockRejectedValue(new Error("provider detail"));
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("provider detail");
    expect(deps.complete).not.toHaveBeenCalled();
  });
  it("can retry an already removed object after acknowledgement failed", async () => {
    deps.complete.mockRejectedValueOnce(new Error("network"));
    expect((await handler(request())).status).toBe(503);
    expect((await handler(request())).status).toBe(200);
    expect(deps.remove).toHaveBeenCalledTimes(2);
  });
  it("does not call Storage when the queue is empty", async () => {
    deps.claim.mockResolvedValue({ leaseId: "lease", paths: [] });
    expect((await handler(request())).status).toBe(200);
    expect(deps.remove).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });
});
