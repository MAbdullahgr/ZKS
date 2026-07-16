import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the fetcher by mocking global.fetch
// The fetcher is a client-side module, so we mock window and fetch

describe("fetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("apiGet calls fetch with GET method", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 1 } }),
      headers: new Headers({ "content-type": "application/json" }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse as unknown as Response),
    );

    const { apiGet } = await import("@/lib/fetcher");
    const result = await apiGet<{ id: number }>("/api/test");
    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toEqual({ id: 1 });
  });

  it("apiPost calls fetch with POST method and JSON body", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 1 } }),
      headers: new Headers({ "content-type": "application/json" }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse as unknown as Response),
    );

    const { apiPost } = await import("@/lib/fetcher");
    await apiPost("/api/test", { name: "test" });

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toBe("/api/test");
    expect(callArgs[1].method).toBe("POST");
    expect(callArgs[1].body).toBe(JSON.stringify({ name: "test" }));
    // Headers is a Headers object — check via .get() not property access
    expect(callArgs[1].headers.get("content-type")).toBe("application/json");
  });

  it("apiPatch calls fetch with PATCH method", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 1 } }),
      headers: new Headers({ "content-type": "application/json" }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse as unknown as Response),
    );

    const { apiPatch } = await import("@/lib/fetcher");
    await apiPatch("/api/test", { name: "updated" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "updated" }),
      }),
    );
  });

  it("apiDelete calls fetch with DELETE method", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: null }),
      headers: new Headers({ "content-type": "application/json" }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse as unknown as Response),
    );

    const { apiDelete } = await import("@/lib/fetcher");
    await apiDelete("/api/test/123");
    expect(fetch).toHaveBeenCalledWith(
      "/api/test/123",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("unwraps { success: true, data: ... } envelope", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 42, name: "test" } }),
      headers: new Headers({ "content-type": "application/json" }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse as unknown as Response),
    );

    const { apiGet } = await import("@/lib/fetcher");
    const result = await apiGet<{ id: number; name: string }>("/api/test");
    expect(result).toEqual({ id: 42, name: "test" });
  });

  it("throws on { success: false } envelope", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        error: "Something failed",
        statusCode: 400,
      }),
      headers: new Headers({ "content-type": "application/json" }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse as unknown as Response),
    );

    const { apiGet } = await import("@/lib/fetcher");
    await expect(apiGet("/api/test", { showToast: false })).rejects.toThrow(
      "Something failed",
    );
  });

  it("returns null on 401 (session expired)", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: "Unauthorized" }),
      headers: new Headers({ "content-type": "application/json" }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse as unknown as Response),
    );

    const { apiGet } = await import("@/lib/fetcher");
    const result = await apiGet("/api/test", { showToast: false });
    expect(result).toBe(null);
  });

  it("throws ApiError on non-ok response", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
      headers: new Headers({ "content-type": "application/json" }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse as unknown as Response),
    );

    const { apiGet } = await import("@/lib/fetcher");
    await expect(apiGet("/api/test", { showToast: false })).rejects.toThrow(
      "Server error",
    );
  });
});
