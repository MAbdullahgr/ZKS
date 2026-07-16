import { describe, it, expect, vi } from "vitest";
import { HttpError, withErrorHandler } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

describe("HttpError", () => {
  it("stores message, statusCode, and code", () => {
    const error = new HttpError("Not found", 404, "NOT_FOUND");
    expect(error.message).toBe("Not found");
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.name).toBe("HttpError");
  });

  it("defaults statusCode to 500", () => {
    const error = new HttpError("Something went wrong");
    expect(error.statusCode).toBe(500);
  });

  it("defaults code to undefined", () => {
    const error = new HttpError("Error");
    expect(error.code).toBeUndefined();
  });
});

describe("withErrorHandler", () => {
  function makeRequest(url = "http://localhost:3000/api/test") {
    return new NextRequest(url, {
      method: "GET",
      headers: new Headers({ "content-type": "application/json" }),
    });
  }

  it("returns the handler's response on success", async () => {
    const handler = async () =>
      NextResponse.json({ ok: true }, { status: 200 });
    const wrapped = withErrorHandler(handler);
    const req = makeRequest();
    const res = await wrapped(req, {} as unknown);
    expect(res.status).toBe(200);
  });

  it("maps HttpError to its status code", async () => {
    const handler = async () => {
      throw new HttpError("Custom error", 418, "TEAPOT");
    };
    const wrapped = withErrorHandler(handler);
    const req = makeRequest();
    const res = await wrapped(req, {} as unknown);
    expect(res.status).toBe(418);
    const body = await res.json();
    expect(body.error).toBe("Custom error");
    expect(body.code).toBe("TEAPOT");
  });

  it("maps generic Error to 500", async () => {
    const handler = async () => {
      throw new Error("Unexpected");
    };
    const wrapped = withErrorHandler(handler);
    const req = makeRequest();
    const res = await wrapped(req, {} as unknown);
    expect(res.status).toBe(500);
  });
});

// ─── Additional withErrorHandler coverage ────────────────────────────────

describe("withErrorHandler — ZodError handling", () => {
  function makeRequest(url = "http://localhost:3000/api/test") {
    return new NextRequest(url, {
      method: "GET",
      headers: new Headers({ "content-type": "application/json" }),
    });
  }

  it("maps ZodError to 400 VALIDATION_ERROR with field-level details", async () => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });

    const handler = async () => {
      // Will throw a ZodError because password is too short.
      schema.parse({ email: "not-an-email", password: "short" });
      return NextResponse.json({});
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details).toBeDefined();
    expect(body.details.email).toBeDefined();
    expect(body.details.password).toBeDefined();
  });

  it("uses the first error path as the main message", async () => {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
    });

    const handler = async () => {
      schema.parse({ name: "", email: "bad" });
      return NextResponse.json({});
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    const body = await res.json();
    // The first issue should be either "name" or "email" — both are valid.
    expect(body.error).toMatch(/^(name|email):/);
  });
});

describe("withErrorHandler — Prisma error codes", () => {
  function makeRequest() {
    return new NextRequest("http://localhost:3000/api/test", {
      method: "GET",
      headers: new Headers({ "content-type": "application/json" }),
    });
  }

  function makePrismaKnownError(
    code: string,
    meta?: Record<string, unknown>,
    message = "Prisma error",
  ) {
    return new Prisma.PrismaClientKnownRequestError(message, {
      code,
      clientVersion: "7.8.0",
      meta,
    });
  }

  it("P2002 (unique constraint) maps to 409 CONFLICT with friendly field name", async () => {
    const handler = async () => {
      throw makePrismaKnownError("P2002", { target: ["email"] });
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("CONFLICT");
    expect(body.error).toContain("Email");
  });

  it("P2002 maps 'barcode' to 'Barcode' friendly name", async () => {
    const handler = async () => {
      throw makePrismaKnownError("P2002", { target: ["barcode"] });
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    const body = await res.json();
    expect(body.error).toContain("Barcode");
  });

  it("P2002 maps 'sku' to 'SKU' friendly name", async () => {
    const handler = async () => {
      throw makePrismaKnownError("P2002", { target: ["sku"] });
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    const body = await res.json();
    expect(body.error).toContain("SKU");
  });

  it("P2002 falls back to 'Field' when target is unknown", async () => {
    const handler = async () => {
      throw makePrismaKnownError("P2002", { target: ["unknown_field"] });
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    const body = await res.json();
    expect(body.error).toContain("Field");
  });

  it("P2025 (record not found) maps to 404 NOT_FOUND", async () => {
    const handler = async () => {
      throw makePrismaKnownError("P2025");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("P2003 (foreign key constraint) maps to 409 FOREIGN_KEY_CONSTRAINT", async () => {
    const handler = async () => {
      throw makePrismaKnownError("P2003");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("FOREIGN_KEY_CONSTRAINT");
  });

  it("P2000 (value too long) maps to 400 VALUE_TOO_LONG", async () => {
    const handler = async () => {
      throw makePrismaKnownError("P2000");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALUE_TOO_LONG");
  });

  it("unknown Prisma code maps to 400 DB_ERROR (no Prisma code leaked)", async () => {
    const handler = async () => {
      throw makePrismaKnownError("P9999");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("DB_ERROR");
    // The specific Prisma code MUST NOT be leaked to the client.
    expect(body.code).not.toContain("P9999");
  });
});

describe("withErrorHandler — AuthError mapping", () => {
  function makeRequest() {
    return new NextRequest("http://localhost:3000/api/test", {
      method: "GET",
      headers: new Headers({ "content-type": "application/json" }),
    });
  }

  function makeAuthError(code: string, message = "Auth error") {
    // AuthError is identified by `error.name === "AuthError"` and a `code`
    // property. We construct a plain Error with the right shape so we don't
    // need to import the AuthError class (which would load Prisma transitively).
    const err = new Error(message) as Error & { code: string };
    err.name = "AuthError";
    err.code = code;
    return err;
  }

  it("FORBIDDEN maps to 403", async () => {
    const handler = async () => {
      throw makeAuthError("FORBIDDEN");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });

  it("UNAUTHORIZED maps to 401", async () => {
    const handler = async () => {
      throw makeAuthError("UNAUTHORIZED");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(401);
  });

  it("INVALID_CREDENTIALS maps to 401", async () => {
    const handler = async () => {
      throw makeAuthError("INVALID_CREDENTIALS");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(401);
  });

  it("PASSWORD_CHANGE_REQUIRED maps to 401", async () => {
    const handler = async () => {
      throw makeAuthError("PASSWORD_CHANGE_REQUIRED");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(401);
  });

  it("STORE_NOT_SELECTED maps to 400 (frontend uses this to prompt store pick)", async () => {
    const handler = async () => {
      throw makeAuthError("STORE_NOT_SELECTED");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("STORE_NOT_SELECTED");
  });
});

describe("withErrorHandler — network / timeout errors", () => {
  function makeRequest() {
    return new NextRequest("http://localhost:3000/api/test", {
      method: "GET",
      headers: new Headers({ "content-type": "application/json" }),
    });
  }

  // NOTE: The source code's step 6 (network/timeout check for P1001/P1008) is
  // currently dead code — step 4 (Prisma Known Errors) catches all
  // PrismaClientKnownRequestError first and falls through to DB_ERROR (400)
  // for unknown codes like P1001/P1008. These tests document the actual
  // behavior. Step 6 only fires for non-Prisma errors with messages
  // containing "Connection terminated" or "Timed out".

  it("Prisma P1001 (connection lost) currently maps to 400 DB_ERROR (dead-code in step 6)", async () => {
    const handler = async () => {
      throw new Prisma.PrismaClientKnownRequestError("Connection lost", {
        code: "P1001",
        clientVersion: "7.8.0",
      });
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    // Step 4 catches PrismaClientKnownRequestError first and falls through to
    // the default DB_ERROR case.
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("DB_ERROR");
  });

  it("Prisma P1008 (timeout) currently maps to 400 DB_ERROR (dead-code in step 6)", async () => {
    const handler = async () => {
      throw new Prisma.PrismaClientKnownRequestError("Timed out", {
        code: "P1008",
        clientVersion: "7.8.0",
      });
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(400);
  });

  it("non-Prisma 'Connection terminated' error maps to 504 DB_TIMEOUT", async () => {
    const handler = async () => {
      throw new Error("Connection terminated unexpectedly");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(504);
    expect((await res.json()).code).toBe("DB_TIMEOUT");
  });

  it("non-Prisma 'Timed out' error maps to 504 DB_TIMEOUT", async () => {
    const handler = async () => {
      throw new Error("Operation Timed out");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(504);
  });

  it("non-Prisma error without 'Connection terminated' / 'Timed out' falls through to 500", async () => {
    const handler = async () => {
      throw new Error("Some other network issue");
    };
    const wrapped = withErrorHandler(handler);
    const res = await wrapped(makeRequest(), {} as unknown);
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });
});

describe("withErrorHandler — expected vs unexpected error logging", () => {
  function makeRequest() {
    return new NextRequest("http://localhost:3000/api/test", {
      method: "GET",
      headers: new Headers({ "content-type": "application/json" }),
    });
  }

  it("does NOT log 4xx HttpErrors (expected client errors)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = async () => {
      throw new HttpError("Not found", 404, "NOT_FOUND");
    };
    const wrapped = withErrorHandler(handler);
    await wrapped(makeRequest(), {} as unknown);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("DOES log 5xx HttpErrors (unexpected server errors)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = async () => {
      throw new HttpError("Server error", 500);
    };
    const wrapped = withErrorHandler(handler);
    await wrapped(makeRequest(), {} as unknown);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("DOES log generic Errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = async () => {
      throw new Error("Unexpected");
    };
    const wrapped = withErrorHandler(handler);
    await wrapped(makeRequest(), {} as unknown);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("logs Prisma errors with name + code + message (sanitized)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = async () => {
      throw new Prisma.PrismaClientKnownRequestError("DB error", {
        code: "P2002",
        clientVersion: "7.8.0",
      });
    };
    const wrapped = withErrorHandler(handler);
    await wrapped(makeRequest(), {} as unknown);
    expect(consoleSpy).toHaveBeenCalled();
    // INFRA: withErrorHandler now routes through the structured logger, which
    // emits a single JSON-stringified log line. The sanitized fields (name +
    // code + message) must be present; stack traces must NOT be.
    const loggedString = String(consoleSpy.mock.calls[0][0]);
    expect(loggedString).toContain("P2002");
    expect(loggedString).toContain("DB error");
    // Stack traces must not leak — the logger only spreads the explicit meta
    // fields passed by withErrorHandler (name/code/message), never the
    // Error.stack property.
    expect(loggedString).not.toContain("at ");
    consoleSpy.mockRestore();
  });
});
