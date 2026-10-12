import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { POST, GET } from "./route";

const owner = "00000000-0000-0000-0000-000000000001";
const uploadId = "00000000-0000-0000-0000-000000000002";
const path = `${owner}/${uploadId}.webp`;
const { auth, rpc, upload, signed, remove } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), upload: vi.fn(), signed: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: auth }, rpc,
  storage: { from: () => ({ upload, createSignedUrl: signed, remove }) },
}) }));

beforeEach(() => {
  vi.clearAllMocks(); auth.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  rpc.mockImplementation(async (name: string) => ({ data: name === "register_recipe_image" ? { path } : [], error: null }));
  upload.mockResolvedValue({ error: null }); signed.mockResolvedValue({ data: { signedUrl: "https://storage.example.com/signed" }, error: null });
  remove.mockResolvedValue({ error: null });
});
async function request(bytes?: Uint8Array, type = "image/png") {
  const buffer = bytes ?? await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toBuffer();
  const body = new FormData(); body.set("uploadId", uploadId); body.set("image", new Blob([new Uint8Array(buffer).buffer], { type }), "cover.png");
  return new Request("http://localhost/api/recipe-images", { method: "POST", headers: { Origin: "http://localhost" }, body });
}

describe("authenticated recipe image boundary", () => {
  it("rejects unauthenticated uploads and cross-origin submissions", async () => {
    auth.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(await request())).status).toBe(401);
    const crossOrigin = await request(); crossOrigin.headers.set("Origin", "https://other.example.com");
    expect((await POST(crossOrigin)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  });
  it("rejects malformed content and excessive byte sizes before staging", async () => {
    expect((await POST(await request(new Uint8Array([1, 2, 3])))).status).toBe(400);
    const large = await request(); large.headers.set("Content-Length", "6000000");
    expect((await POST(large)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("re-encodes the cover and stages its exact checksum before upload", async () => {
    const input = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "white" } })
      .withExif({ IFD0: { Artist: "Private test metadata" } }).jpeg().toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const response = await POST(await request(input, "image/jpeg"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ image: { kind: "upload", path } });
    expect(rpc).toHaveBeenCalledWith("register_recipe_image", { p_payload: { uploadId, checksum: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(upload).toHaveBeenCalledWith(path, expect.any(Buffer), { contentType: "image/webp", upsert: false });
    const metadata = await sharp(upload.mock.calls[0][1]).metadata();
    expect(metadata.format).toBe("webp"); expect(metadata.exif).toBeUndefined();
    expect(metadata.width).toBe(1600); expect(metadata.height).toBeLessThanOrEqual(1600);
  });
  it("returns a retained-draft message when the migration is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    const response = await POST(await request());
    expect(response.status).toBe(409); expect((await response.json()).message).toContain("draft is retained");
    expect(upload).not.toHaveBeenCalled();
  });
  it("allows an exact retry that already uploaded the registered path", async () => {
    upload.mockResolvedValue({ error: { message: "Already exists" } });
    expect((await POST(await request())).status).toBe(200);
    expect(signed).toHaveBeenCalledWith(path, 60);
  });
  it("keeps failed uploads retryable rather than reporting an image as persisted", async () => {
    upload.mockResolvedValue({ error: { message: "Unavailable" } }); signed.mockResolvedValue({ error: { message: "Missing" } });
    const response = await POST(await request());
    expect(response.status).toBe(503); expect((await response.json()).message).toContain("draft is retained");
  });
  it("rejects a cross-user image without issuing a signed URL", async () => {
    const otherPath = path.replace(owner, "00000000-0000-0000-0000-000000000003");
    expect((await GET(new Request(`http://localhost/api/recipe-images?path=${otherPath}`))).status).toBe(404);
    expect(signed).not.toHaveBeenCalled();
  });
  it("returns a private, non-cacheable signed read URL", async () => {
    const response = await GET(new Request(`http://localhost/api/recipe-images?path=${path}`));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(signed).toHaveBeenCalledWith(path, 3600);
  });
});
