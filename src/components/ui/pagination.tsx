"use client";

import { useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface PaginationBarProps {
  meta: PaginationMeta;
  /** Called with the new page number (1-indexed) when the user navigates. */
  onPageChange: (page: number) => void;
  /** Optional className for the outer container. */
  className?: string;
  /** Show "Showing X–Y of Z" summary. Default true. */
  showSummary?: boolean;
}

// ─── Helper: build a compact page window ──────────────────────────────────
// Always show first + last page; show a window of 5 around the current page.
// Example for page 6 of 12:  1 … 4 5 [6] 7 8 … 12
function buildPageWindow(current: number, pages: number): (number | "…")[] {
  if (pages <= 7) {
    return Array.from({ length: pages }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 2);
  const end = Math.min(pages - 1, current + 2);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

// ─── Main component ───────────────────────────────────────────────────────
export function PaginationBar({
  meta,
  onPageChange,
  className,
  showSummary = true,
}: PaginationBarProps) {
  const { page, limit, total, pages, hasNext, hasPrev } = meta;

  // AUDIT-FIX (lint): useMemo MUST be called unconditionally, before any early
  // return — React's rules-of-hooks require hooks to run in the same order on
  // every render. Previously this was below the `if (pages <= 1) return` block,
  // which is a conditional hook call.
  const window = useMemo(() => buildPageWindow(page, pages), [page, pages]);

  // Nothing to paginate (0 or 1 page).
  if (pages <= 1) {
    if (total === 0) return null;
    return showSummary ? (
      <div className={cn("text-xs text-muted-foreground px-1", className)}>
        Showing all {total} {total === 1 ? "item" : "items"}.
      </div>
    ) : null;
  }

  const rangeStart = (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1",
        className,
      )}
    >
      {showSummary && (
        <p className="text-xs text-muted-foreground order-2 sm:order-1">
          Showing{" "}
          <span className="font-medium text-foreground">{rangeStart}</span>–
          <span className="font-medium text-foreground">{rangeEnd}</span> of{" "}
          <span className="font-medium text-foreground">{total}</span>
        </p>
      )}

      <nav
        aria-label="Pagination"
        className="flex items-center gap-1 order-1 sm:order-2 mx-auto sm:mx-0"
      >
        {/* First + Prev — hidden on very small screens to save space */}
        <PagerButton
          onClick={() => onPageChange(1)}
          disabled={!hasPrev}
          ariaLabel="First page"
          className="hidden sm:inline-flex"
        >
          <ChevronsLeft className="h-4 w-4" />
        </PagerButton>
        <PagerButton
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          ariaLabel="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </PagerButton>

        {/* Page window */}
        {window.map((p, i) =>
          p === "…" ? (
            <span
              key={`ellipsis-${i}`}
              className="px-2 text-muted-foreground select-none"
              aria-hidden
            >
              …
            </span>
          ) : (
            <PagerButton
              key={p}
              onClick={() => onPageChange(p)}
              active={p === page}
              ariaLabel={`Page ${p}`}
              ariaCurrent={p === page ? "page" : undefined}
            >
              {p}
            </PagerButton>
          ),
        )}

        <PagerButton
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          ariaLabel="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </PagerButton>
        <PagerButton
          onClick={() => onPageChange(pages)}
          disabled={!hasNext}
          ariaLabel="Last page"
          className="hidden sm:inline-flex"
        >
          <ChevronsRight className="h-4 w-4" />
        </PagerButton>
      </nav>
    </div>
  );
}

// ─── PagerButton sub-component ────────────────────────────────────────────
function PagerButton({
  children,
  onClick,
  disabled,
  active,
  ariaLabel,
  ariaCurrent,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel?: string;
  ariaCurrent?: "page";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-soft"
          : "border-border bg-background text-foreground hover:bg-muted hover:border-accent-foreground/20",
        disabled &&
          "opacity-40 cursor-not-allowed hover:bg-background hover:border-border",
        className,
      )}
    >
      {children}
    </button>
  );
}
