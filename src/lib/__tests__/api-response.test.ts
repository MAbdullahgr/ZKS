import { describe, it, expect } from "vitest";
import { apiSuccess, apiError } from "@/lib/api-response";

describe("apiSuccess", () => {
  it("returns a 200 response by default", () => {
    const response = apiSuccess({ id: 1, name: "test" });
    expect(response.status).toBe(200);
  });

  it("accepts a custom status code", () => {
    const response = apiSuccess({ id: 1 }, "Created", 201);
    expect(response.status).toBe(201);
  });

  it("accepts a message", () => {
    const response = apiSuccess({ id: 1 }, "Sale completed");
    expect(response.status).toBe(200);
  });

  it("handles null data", () => {
    const response = apiSuccess(null);
    expect(response.status).toBe(200);
  });

  it("handles array data", () => {
    const response = apiSuccess([1, 2, 3]);
    expect(response.status).toBe(200);
  });
});

describe("apiError", () => {
  it("defaults to 500 when no status is provided", () => {
    const response = apiError("Something went wrong");
    expect(response.status).toBe(500);
  });

  it("uses the provided status code", () => {
    const response = apiError("Not found", 404, "NOT_FOUND");
    expect(response.status).toBe(404);
  });

  it("accepts field-level validation details", () => {
    const response = apiError("Validation failed", 400, "VALIDATION_ERROR", {
      email: ["Invalid email format"],
      password: ["Password is required"],
    });
    expect(response.status).toBe(400);
  });

  it("accepts a 429 rate-limit status", () => {
    const response = apiError("Too many attempts", 429, "RATE_LIMIT_EXCEEDED");
    expect(response.status).toBe(429);
  });
});
