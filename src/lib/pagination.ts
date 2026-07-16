// src/lib/pagination.ts
//
// Shared pagination helpers for list API routes. Standardizes page/limit
// parsing + the response envelope so every paginated route behaves the same
// way and the frontend can use one reusable Pagination component.
//
// USAGE in a route:
//   const { page, limit, skip } = parsePagination(req);
//   const [items, total] = await Promise.all([
//     prisma.model.findMany({ where, skip, take: limit, orderBy }),
//     prisma.model.count({ where }),
//   ]);
//   return apiSuccess({ items, ...paginatedMeta(page, limit, total) });
//
// The frontend <PaginationBar> component reads `page`, `limit`, `total`,
// `pages` from the response and emits `?page=N&limit=M` query params.

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse `page` and `limit` from a NextRequest's URL search params.
 * - page: 1-indexed, minimum 1
 * - limit: default 20, clamped to [1, 100]
 * - skip: (page - 1) * limit, ready for Prisma's findMany
 */
export function parsePagination(req: Request): {
  page: number;
  limit: number;
  skip: number;
} {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const requestedLimit = parseInt(
    url.searchParams.get("limit") ?? String(DEFAULT_LIMIT),
    10,
  );
  const limit = Math.max(
    1,
    Math.min(
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? requestedLimit
        : DEFAULT_LIMIT,
      MAX_LIMIT,
    ),
  );
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Build the standard pagination metadata envelope from page/limit/total.
 */
export function paginatedMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  const pages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
}
