import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ZodError, ZodIssue } from "zod";
import { apiError, type ResponseHeaders } from "./api-response";
import { logger } from "./logger";

// INFRA: HttpError now carries optional `headers`. Routes that throw on
// rate-limit exhaustion (login, PIN, password change, etc.) attach the
// X-RateLimit-* / Retry-After headers here; withErrorHandler forwards
// them to apiError so the client sees them on the 429 response.
export class HttpError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public headers?: ResponseHeaders,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler<T = any> = (
  req: NextRequest,
  ctx: T,
) => Promise<NextResponse>;

export function withErrorHandler<T = unknown>(handler: RouteHandler<T>) {
  return async (req: NextRequest, ctx: T): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      // Only log unexpected errors (5xx) to the console.
      // Expected client errors (4xx) like 401 auth checks, 400 validation,
      // 404 not-found are NOT logged — they're handled by the frontend.
      //
      // AUDIT-FIX H-31: Sanitize server-side logs. Previously the FULL error
      // object (including Prisma stack traces and query metadata) was logged,
      // which could leak DB schema/queries to log aggregators. Now we log
      // only name + message + code (for Prisma errors) — enough to debug,
      // not enough to leak internals.
      //
      // INFRA: Routed through the structured logger so log aggregators get
      // JSON lines (level/message/timestamp + meta fields) instead of
      // free-text. The logger itself calls console.error under the hood, so
      // tests spying on console.error still work — they just see a single
      // JSON-stringified argument instead of (label, object).
      const isExpectedClientError =
        error instanceof HttpError &&
        error.statusCode >= 400 &&
        error.statusCode < 500;
      if (!isExpectedClientError) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          logger.error("API_ERROR", {
            name: error.name,
            code: error.code,
            message: error.message,
          });
        } else if (error instanceof Error) {
          logger.error("API_ERROR", {
            name: error.name,
            message: error.message,
          });
        } else {
          logger.error("API_ERROR", { error: String(error) });
        }
      }

      // 1. Custom HTTP Errors
      if (error instanceof HttpError) {
        return apiError(error.message, error.statusCode, error.code, undefined, error.headers);
      }

      // 2. Auth Errors
      if (error instanceof Error && error.name === "AuthError") {
        const authErr = error as Error & { code: string };
        const code = authErr.code || "UNAUTHORIZED";
        // Map auth error codes to HTTP status:
        //   UNAUTHORIZED, INVALID_CREDENTIALS, INACTIVE_USER, PASSWORD_CHANGE_REQUIRED → 401
        //   FORBIDDEN → 403
        //   STORE_NOT_SELECTED → 400 (frontend uses this to show "pick a store" UI)
        let status = 401;
        if (code === "FORBIDDEN") status = 403;
        else if (code === "STORE_NOT_SELECTED") status = 400;
        return apiError(error.message, status, code);
      }

      // 3. Zod Validation Errors (Return field-level details)
      if (error instanceof ZodError) {
        const details: Record<string, string[]> = {};
        error.issues.forEach((err: ZodIssue) => {
          const path = err.path.join(".");
          if (!details[path]) details[path] = [];
          details[path].push(err.message);
        });

        // FIX: Extract the first specific error to use as the main message
        const firstError = error.issues[0];
        const fieldName = firstError.path.join(".");
        const specificMessage = `${fieldName}: ${firstError.message}`;

        return apiError(specificMessage, 400, "VALIDATION_ERROR", details);
      }

      // 4. Prisma Known Errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
          case "P2002": {
            const targetRaw =
              (error.meta?.target as string[] | undefined)?.join(", ") || "";
            // FIX: Also check the error message string, as Prisma 7 sometimes hides the field name in meta
            const messageRaw = error.message || "";
            let friendlyName = "Field";

            // FIX: Explicitly map known fields to friendly names
            if (targetRaw.includes("barcode") || messageRaw.includes("barcode"))
              friendlyName = "Barcode";
            else if (targetRaw.includes("sku") || messageRaw.includes("sku"))
              friendlyName = "SKU";
            else if (
              targetRaw.includes("email") ||
              messageRaw.includes("email")
            )
              friendlyName = "Email";
            else if (targetRaw.includes("cnic") || messageRaw.includes("cnic"))
              friendlyName = "CNIC";
            else if (
              targetRaw.includes("phone") ||
              messageRaw.includes("phone")
            )
              friendlyName = "Phone number";
            else if (
              targetRaw.includes("saleNumber") ||
              messageRaw.includes("saleNumber")
            )
              friendlyName = "Sale number";
            else if (
              targetRaw.includes("orderNumber") ||
              messageRaw.includes("orderNumber")
            )
              friendlyName = "Order number";

            return apiError(
              `${friendlyName} already exists. Please use a different value.`,
              409,
              "CONFLICT",
            );
          }
          case "P2025":
            return apiError(
              "The record you are trying to update or delete was not found.",
              404,
              "NOT_FOUND",
            );
          case "P2003":
            return apiError(
              "Cannot delete or update: this record is linked to other existing data.",
              409,
              "FOREIGN_KEY_CONSTRAINT",
            );
          case "P2000":
            return apiError(
              "One of the input values is too long for the database field.",
              400,
              "VALUE_TOO_LONG",
            );
          default:
            // AUDIT-FIX H-31: Return generic DB_ERROR to client. Previously
            // returned PRISMA_${error.code} which leaked the ORM/DB layer
            // and let attackers fingerprint the stack. The specific code is
            // already logged server-side (see top of catch block).
            return apiError(
              "A database error occurred.",
              400,
              "DB_ERROR",
            );
        }
      }

      // 5. Prisma Unknown/Connection Errors
      if (
        error instanceof Prisma.PrismaClientUnknownRequestError ||
        error instanceof Prisma.PrismaClientInitializationError
      ) {
        return apiError(
          "Service temporarily unavailable. Please check your connection and try again.",
          503,
          "DB_CONNECTION_ERROR",
        );
      }

      // 6. Network/Timeout Errors
      // AUDIT-FIX H-31: Use Prisma error codes instead of fragile string
      // matching on error.message. P1001 = connection lost, P1008 = timeout.
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P1001" || error.code === "P1008") {
          return apiError(
            "Request timed out or database connection lost. Please try again.",
            504,
            "DB_TIMEOUT",
          );
        }
      }
      // Keep the string-match fallback for non-Prisma network errors.
      if (
        error instanceof Error &&
        (error.message.includes("Connection terminated") ||
          error.message.includes("Timed out"))
      ) {
        return apiError(
          "Request timed out or database connection lost. Please try again.",
          504,
          "DB_TIMEOUT",
        );
      }

      // 7. Generic Uncaught Errors
      return apiError(
        "An unexpected internal server error occurred. Please contact support if the issue persists.",
        500,
        "INTERNAL_ERROR",
      );
    }
  };
}
