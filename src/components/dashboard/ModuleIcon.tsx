"use client";

import {
  Truck,
  Tag,
  Gear,
  Lock,
  Users,
  Bookmarks,
  Receipt,
  Storefront,
  Percent,
  BookOpen,
  CurrencyDollar,
  ArrowsLeftRight,
  Package,
  ShoppingCart,
  ChartBar,
  UserCircle,
  IdentificationCard,
  type Icon,
} from "@phosphor-icons/react";
import type { ModuleConfig } from "./modules";

const iconMap: Record<string, Icon> = {
  Truck,
  Tag,
  Gear,
  Lock,
  Users,
  Bookmarks,
  Receipt,
  Storefront,
  Percent,
  ScrollText: BookOpen, // phosphor doesn't export ScrollText — fall back to BookOpen
  BookOpen,
  CurrencyDollar,
  ArrowsLeftRight,
  Package,
  ShoppingCart,
  ChartBar,
  UserCircle,
  IdentificationCard,
};

/**
 * Maps a harmonious palette color name to the full set of utility classes
 * needed to render a tinted icon container that looks great in both light
 * and dark mode.
 */
const COLOR_STYLES: Record<
  string,
  { container: string; icon: string }
> = {
  emerald: {
    container:
      "bg-emerald-500/10 ring-emerald-500/15 dark:bg-emerald-400/10 dark:ring-emerald-400/20",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  teal: {
    container:
      "bg-teal-500/10 ring-teal-500/15 dark:bg-teal-400/10 dark:ring-teal-400/20",
    icon: "text-teal-600 dark:text-teal-400",
  },
  amber: {
    container:
      "bg-amber-500/10 ring-amber-500/15 dark:bg-amber-400/10 dark:ring-amber-400/20",
    icon: "text-amber-600 dark:text-amber-400",
  },
  rose: {
    container:
      "bg-rose-500/10 ring-rose-500/15 dark:bg-rose-400/10 dark:ring-rose-400/20",
    icon: "text-rose-600 dark:text-rose-400",
  },
  slate: {
    container:
      "bg-slate-500/10 ring-slate-500/15 dark:bg-slate-400/10 dark:ring-slate-400/20",
    icon: "text-slate-600 dark:text-slate-300",
  },
};

function getColorStyles(colorName: string) {
  return COLOR_STYLES[colorName] ?? COLOR_STYLES.emerald;
}

export function ModuleIcon({
  mod,
  hasAccess,
}: {
  mod: ModuleConfig;
  hasAccess: boolean;
}) {
  const opacityClass = hasAccess ? "" : "opacity-50 grayscale";
  const styles = getColorStyles(mod.color);

  // Image-type icons (legacy PNGs) — still supported but we render them
  // inside the same tinted container for visual consistency.
  if (mod.iconType === "image") {
    return (
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-soft ring-1 ${styles.container} ${opacityClass} transition-transform duration-200`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mod.iconSrc}
          alt={mod.label}
          className="w-8 h-8 object-contain"
          draggable={false}
        />
      </div>
    );
  }

  const IconComponent = iconMap[mod.iconName];
  if (!IconComponent) {
    return (
      <div
        className={`w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4 shadow-soft ring-1 ring-border ${opacityClass}`}
      >
        <Lock className="w-7 h-7 text-muted-foreground" weight="fill" />
      </div>
    );
  }

  return (
    <div
      className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-soft ring-1 ${styles.container} ${opacityClass} transition-transform duration-200`}
    >
      <IconComponent
        className={`w-7 h-7 ${styles.icon}`}
        weight={mod.weight || "fill"}
      />
    </div>
  );
}

export function LockIcon() {
  return <Lock className="w-5 h-5 text-muted-foreground" />;
}
