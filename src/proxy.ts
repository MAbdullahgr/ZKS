import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

// FIX: Use lazy getter instead of module-level throw — consistent with auth.ts.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

// FIX P2-9: Public paths. /api/auth is exact-match only (login, logout, session
// check). /api/auth/store (store switching) requires auth and is NOT public.
const PUBLIC_PATHS_EXACT = [
  "/login",
  "/api/auth",
  "/api/auth/forgot-password",
  "/api/auth/password",
  "/api/health",
];

const PUBLIC_PATHS_PREFIX = [
  "/api/auth/forgot-password/",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and static assets securely
  if (
    PUBLIC_PATHS_EXACT.includes(pathname) ||
    PUBLIC_PATHS_PREFIX.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/icons") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("storeos_token")?.value;

  const isApiRoute = pathname.startsWith("/api/");

  if (!token) {
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/login") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as {
      mustChangePassword: boolean;
      role: string;
    };

    // Force password change users back to login (except password API)
    if (
      payload.mustChangePassword &&
      !pathname.startsWith("/login") &&
      pathname !== "/api/auth/password"
    ) {
      if (isApiRoute) {
        return NextResponse.json(
          { success: false, error: "Password change required", code: "PASSWORD_CHANGE_REQUIRED" },
          { status: 401 },
        );
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // FIX: Role-Based Access Control (RBAC) for frontend routes
    const role = payload.role;
    const isOwnerOrAdmin = role === "owner" || role === "admin";
    const isManagerPlus = isOwnerOrAdmin || role === "manager";
    const isWarehousePlus = isManagerPlus || role === "warehouse";
    const isCashierPlus = isWarehousePlus || role === "cashier";

    const isNotWarehouse = role !== "warehouse";

    const routePermissions = [
      { path: "/pos", allowed: isCashierPlus && isNotWarehouse },
      { path: "/sales", allowed: isCashierPlus && isNotWarehouse },
      { path: "/customers", allowed: isCashierPlus && isNotWarehouse },
      { path: "/settings", allowed: isOwnerOrAdmin },
      { path: "/staff", allowed: isOwnerOrAdmin },
      { path: "/categories", allowed: isManagerPlus },
      { path: "/brands", allowed: isManagerPlus },
      { path: "/employees", allowed: isManagerPlus },
      { path: "/expenses", allowed: isManagerPlus },
      { path: "/reports", allowed: isManagerPlus },
      { path: "/accounting", allowed: isManagerPlus },
      { path: "/suppliers", allowed: isWarehousePlus },
      { path: "/transfers", allowed: isWarehousePlus },
      { path: "/inventory", allowed: isWarehousePlus },
      { path: "/purchases", allowed: isWarehousePlus },
      { path: "/stores", allowed: isOwnerOrAdmin },
      { path: "/taxes", allowed: isManagerPlus },
      { path: "/payroll", allowed: isManagerPlus },
      { path: "/audit-logs", allowed: isManagerPlus },
      { path: "/api-docs", allowed: isManagerPlus },
    ];

    for (const route of routePermissions) {
      if (pathname.startsWith(route.path) && !route.allowed) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    return NextResponse.next();
  } catch {
    if (isApiRoute) {
      const response = NextResponse.json(
        { success: false, error: "Session expired. Please log in again.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
      response.cookies.delete("storeos_token");
      return response;
    }
    const response = NextResponse.redirect(new URL("/login", req.url));
    response.cookies.delete("storeos_token");
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.woff2|.*\\.jpg|.*\\.jpeg).*)",
  ],
};
