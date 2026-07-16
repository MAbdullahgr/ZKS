// src/components/layout/PageContainer.tsx
"use client";

import { cn } from "@/lib/utils";

/**
 * Standard responsive page wrapper. Consistent horizontal padding that scales
 * from mobile (p-4) to desktop (md:p-8), with a max-width for readability on
 * ultra-wide screens. Use on every dashboard page.
 */
export function PageContainer({
  children,
  className,
  wide = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** wide = max-w-screen-2xl (for tables/grids). Default max-w-7xl. */
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "p-4 sm:p-6 md:p-8 w-full mx-auto animate-fade-in",
        wide ? "max-w-screen-2xl" : "max-w-7xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Responsive page header: title + optional description on the left, actions
 * on the right. Stacks vertically on mobile, row on sm+.
 */
export function PageHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6",
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">{actions}</div>
      )}
    </div>
  );
}

/**
 * Card-style empty state with an icon, title, and description. Centers
 * content and is responsive.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-gradient-to-br from-muted/30 to-card/50 p-8 sm:p-14 text-center animate-fade-in">
      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />
      {icon && (
        <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 shadow-soft">
          {icon}
        </div>
      )}
      <p className="relative font-bold text-lg text-foreground">{title}</p>
      {description && (
        <p className="relative text-sm text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="relative mt-6">{action}</div>}
    </div>
  );
}

/**
 * Compact inline KPI / stat tile for dashboard and list summaries.
 *
 * `tone` controls the icon chip color. Pass `tone="primary"` for brand-emerald
 * accent, or use semantic tones for warn/danger/info.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "primary",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "danger" | "info" | "muted";
  className?: string;
}) {
  const tones: Record<string, string> = {
    primary:
      "bg-primary/10 text-primary ring-primary/15 dark:bg-primary/15 dark:text-primary",
    success:
      "bg-success/15 text-success ring-success/20 dark:bg-success/20 dark:text-success",
    warning:
      "bg-warning/15 text-warning ring-warning/25 dark:bg-warning/20 dark:text-warning",
    danger:
      "bg-destructive/10 text-destructive ring-destructive/20 dark:bg-destructive/20 dark:text-destructive",
    info: "bg-info/15 text-info ring-info/25 dark:bg-info/20 dark:text-info",
    muted:
      "bg-muted text-muted-foreground ring-border dark:bg-muted/60",
  };
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-soft transition-all hover:shadow-soft-lg hover:-translate-y-0.5 hover:border-primary/20",
        className,
      )}
    >
      {/* Subtle gradient accent on hover */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </p>
        {icon && (
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-transform group-hover:scale-110",
              tones[tone],
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <p className="relative text-xl sm:text-2xl font-bold text-foreground tracking-tight tabular-nums">
        {value}
      </p>
      {hint && <p className="relative text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
