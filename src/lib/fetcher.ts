import { toast } from "sonner";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  raw?: boolean;
  showToast?: boolean;
  toastError?: string;
  timeout?: number;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds

export async function apiFetch<T = unknown>(
  url: string,
  options: FetchOptions = {},
): Promise<T | null> {
  const {
    raw = false,
    showToast = true,
    toastError,
    headers: customHeaders,
    body,
    timeout = DEFAULT_TIMEOUT,
    ...rest
  } = options;

  const isJsonBody =
    body && typeof body === "object" && !(body instanceof FormData);
  const headers = new Headers(customHeaders);
  if (isJsonBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...rest,
      headers,
      body: isJsonBody
        ? JSON.stringify(body)
        : (body as BodyInit | null | undefined),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // ─── Error handling ──────────────────────────────────────────────
    // IMPORTANT: The response body can only be read ONCE. We read it here
    // in a single place and branch on status code + body content.

    if (res.status === 401) {
      // Read the body to get the specific error message
      const data = await res.json().catch(() => ({
        error: "Authentication failed",
        code: "UNAUTHORIZED",
      }));

      // If we're already on the login page, this is a login attempt that
      // failed (wrong email/password) — show the error, don't redirect.
      if (
        typeof window !== "undefined" &&
        window.location.pathname.startsWith("/login")
      ) {
        const errorMessage = data.error || "Invalid email or password";
        const error = new ApiError(errorMessage, 401, data);
        if (showToast) toast.error(toastError || errorMessage);
        throw error;
      }

      // Otherwise, the session expired — redirect to login
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      return null;
    }

    if (!res.ok) {
      // Read the body ONCE for all non-401 error statuses
      const data = await res.json().catch(() => ({ error: "Request failed" }));

      // 403: Forbidden — check for password-change-required
      if (res.status === 403) {
        if (data.code === "PASSWORD_CHANGE_REQUIRED") {
          window.location.href = "/login";
          return null;
        }
        const error = new ApiError("Access denied", 403, data);
        // FIX P3: Use the actual error message from the API response when
        // available, instead of the hardcoded "You do not have permission".
        // This lets the returnService's REGISTER_REQUIRED / REGISTER_CLOSED
        // messages (and other specific 403 errors) reach the user.
        if (showToast)
          toast.error(toastError || data.error || "Access denied");
        throw error;
      }

      // All other errors (400, 404, 409, 429, 500, etc.)
      let errorMessage = data.error || `Request failed (${res.status})`;

      // If Zod validation details exist, show the first field error
      if (
        data.details &&
        typeof data.details === "object" &&
        Object.keys(data.details).length > 0
      ) {
        const firstField = Object.keys(data.details)[0];
        const firstMsg = data.details[firstField][0];
        errorMessage = `${firstField}: ${firstMsg}`;
      }

      const error = new ApiError(errorMessage, res.status, data);

      if (showToast) {
        toast.error(toastError || errorMessage);
      }

      throw error;
    }

    if (raw) return res as T;

    const contentType = res.headers.get("Content-Type");
    if (contentType?.includes("application/json")) {
      const json = await res.json();

      // FIX: Unwrap standardized { success: true, data: ... } payload
      if (json && typeof json === "object" && "success" in json) {
        if (json.success) {
          return json.data as T;
        } else {
          throw new ApiError(json.error || "Request failed", res.status, json);
        }
      }

      return json as T;
    }

    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      const msg = "Request timed out. Please try again.";
      if (showToast) toast.error(toastError || msg);
      throw new ApiError(msg, 0);
    }
    const message = err instanceof Error ? err.message : "Network error";
    if (showToast) toast.error(toastError || message);
    throw new ApiError(message, 0);
  }
}

export const apiGet = <T>(url: string, options?: FetchOptions) =>
  apiFetch<T>(url, { ...options, method: "GET" });

export const apiPost = <T>(
  url: string,
  body: unknown,
  options?: FetchOptions,
) => apiFetch<T>(url, { ...options, method: "POST", body });

export const apiPut = <T>(url: string, body: unknown, options?: FetchOptions) =>
  apiFetch<T>(url, { ...options, method: "PUT", body });

export const apiPatch = <T>(
  url: string,
  body: unknown,
  options?: FetchOptions,
) => apiFetch<T>(url, { ...options, method: "PATCH", body });

export const apiDelete = <T>(url: string, options?: FetchOptions) =>
  apiFetch<T>(url, { ...options, method: "DELETE" });
