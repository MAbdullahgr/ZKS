"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSWRConfig } from "swr";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  Sun,
  Moon,
  Store,
  ChevronDown,
  LogOut,
  Bell,
  CheckCircle2,
  Loader2,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { JWTPayload } from "@/lib/auth";
import Link from "next/link";
import { toast } from "sonner";

interface StoreOption {
  id: string;
  name: string;
  type: string;
}

interface TopBarProps {
  session: JWTPayload;
  stores: StoreOption[];
  currentStore: StoreOption | null;
}

const ROLE_WEIGHT: Record<string, number> = {
  cashier: 1,
  warehouse: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

const ROLE_BADGE_STYLES: Record<string, string> = {
  owner:
    "bg-primary/15 text-primary ring-1 ring-primary/25 dark:bg-primary/20 dark:text-primary",
  admin:
    "bg-info/15 text-info ring-1 ring-info/25 dark:bg-info/20 dark:text-info",
  manager:
    "bg-warning/15 text-warning ring-1 ring-warning/25 dark:bg-warning/20 dark:text-warning",
  warehouse:
    "bg-secondary text-secondary-foreground ring-1 ring-border",
  cashier:
    "bg-muted text-muted-foreground ring-1 ring-border",
};

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function TopBar({ session, stores, currentStore }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { mutate: globalMutate } = useSWRConfig();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [storeSwitchLoading, setStoreSwitchLoading] = useState<string | null>(
    null,
  );

  const canSwitchStore = ROLE_WEIGHT[session.role] >= ROLE_WEIGHT["admin"];
  const canSwitchStoreHere = canSwitchStore && pathname === "/dashboard";

  async function handleLogout() {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
      const { clearAllPosSessions } = await import("@/lib/pos/persistence");
      clearAllPosSessions();
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Failed to logout. Please try again.");
    } finally {
      setLogoutLoading(false);
    }
  }

  async function handleStoreSwitch(storeId: string | null) {
    if (storeSwitchLoading) return;
    setStoreSwitchLoading(storeId === null ? "all" : storeId);

    try {
      const res = await fetch("/api/auth/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });

      if (!res.ok) {
        let errorMsg = "Failed to switch store";
        try {
          const errorData = await res.json();
          errorMsg = errorData?.error || errorData?.message || errorMsg;
        } catch {
          // Response body isn't JSON
        }
        throw new Error(errorMsg);
      }

      setStoreMenuOpen(false);
      await globalMutate(() => true);
      router.refresh();
      toast.success("Store context updated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to switch store";
      toast.error(msg);
      setStoreSwitchLoading(null);
    }
  }

  const roleBadgeClass =
    ROLE_BADGE_STYLES[session.role] ?? ROLE_BADGE_STYLES.cashier;

  const quickLinks = [
    { href: "/pos", label: "POS" },
    { href: "/sales", label: "Sales" },
    { href: "/customers", label: "Customers" },
    { href: "/inventory", label: "Inventory" },
    { href: "/purchases", label: "Purchases" },
    { href: "/reports", label: "Reports" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/60">
      <div className="flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8">
        {/* Left: Logo + desktop quick nav */}
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 sm:gap-2.5 shrink-0 group"
          >
            <div className="relative w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center shadow-soft ring-1 ring-primary/20 transition-transform group-hover:scale-105">
              <Store className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-primary-foreground" />
            </div>
            <div className="hidden sm:block leading-tight min-w-0">
              <p className="font-bold text-sm sm:text-base tracking-tight text-foreground truncate max-w-[8rem] md:max-w-none">
                ZKS
              </p>
              <p className="text-[10px] text-muted-foreground -mt-0.5 hidden md:block">
                Store Management
              </p>
            </div>
          </Link>

          {/* Desktop quick nav links */}
          <nav className="hidden lg:flex items-center gap-1">
            {quickLinks.map((link) => {
              const isActive =
                pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileNavOpen((v) => !v)}
            className="lg:hidden w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label="Toggle navigation"
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>

          {/* Theme Toggle */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Notifications */}
          <button
            className="relative w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full ring-2 ring-background" />
          </button>

          {/* Store Switcher */}
          <div className="relative">
            {canSwitchStoreHere ? (
              <button
                onClick={() => setStoreMenuOpen(!storeMenuOpen)}
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium bg-accent hover:bg-accent/70 transition-colors shrink-0 max-w-[10rem] sm:max-w-none"
                aria-expanded={storeMenuOpen}
              >
                <Store className="w-3.5 h-3.5 shrink-0 text-primary" />
                <span className="hidden sm:inline truncate max-w-25 md:max-w-35">
                  {currentStore?.name || "All Stores"}
                </span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              </button>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium bg-accent cursor-default shrink-0 max-w-[12rem]">
                <Store className="w-3.5 h-3.5 shrink-0 text-primary" />
                <span className="truncate max-w-25 md:max-w-35">
                  {currentStore?.name || "All Stores"}
                </span>
              </div>
            )}

            {/* Store Dropdown */}
            {storeMenuOpen && canSwitchStoreHere && (
              <>
                <div
                  className="fixed inset-0 z-[60]"
                  onClick={() => setStoreMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-56 sm:w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-popover shadow-soft-lg z-[61] py-1.5 overflow-hidden animate-scale-in">
                  <div className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Select Store
                  </div>

                  <button
                    onClick={() => handleStoreSwitch(null)}
                    disabled={storeSwitchLoading !== null}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors disabled:opacity-50 ${
                      !currentStore ? "text-primary font-medium" : ""
                    }`}
                  >
                    {storeSwitchLoading === "all" ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : !currentStore ? (
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    ) : (
                      <Store className="w-4 h-4 opacity-40 shrink-0" />
                    )}
                    <span className="truncate">All Stores</span>
                  </button>

                  <div className="my-1 h-px bg-border" />

                  {stores.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleStoreSwitch(s.id)}
                      disabled={storeSwitchLoading !== null}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors disabled:opacity-50 ${
                        currentStore?.id === s.id
                          ? "text-primary font-medium"
                          : ""
                      }`}
                    >
                      {storeSwitchLoading === s.id ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      ) : currentStore?.id === s.id ? (
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      ) : (
                        <Store className="w-4 h-4 opacity-40 shrink-0" />
                      )}
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground uppercase shrink-0 font-medium">
                        {s.type}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-1.5 sm:gap-2 pl-1 pr-1.5 sm:pr-2 py-1 rounded-lg hover:bg-accent transition-colors shrink-0"
              aria-expanded={userMenuOpen}
            >
              <div className="w-8 h-8 bg-brand-gradient rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0 ring-1 ring-primary/20">
                {(session.name || session.email || "U").charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block text-left min-w-0">
                <p className="text-sm font-medium leading-none truncate max-w-30 text-foreground">
                  {session.name || session.email.split("@")[0]}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">
                  {session.role}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden md:block shrink-0" />
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-[60]"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-popover shadow-soft-lg z-[61] py-2 overflow-hidden animate-scale-in">
                  <div className="px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-gradient rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0 ring-1 ring-primary/20">
                        {(session.name || session.email || "U")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate text-foreground">
                          {session.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {session.email}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex mt-3 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${roleBadgeClass}`}
                    >
                      {session.role}
                    </span>
                  </div>
                  <div className="p-1">
                    {["owner", "admin"].includes(session.role) && (
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          router.push("/settings");
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-accent rounded-md"
                      >
                        <Settings
                          size={16}
                          className="text-muted-foreground shrink-0"
                        />
                        <span>Store Settings</span>
                      </button>
                    )}

                    <button
                      onClick={handleLogout}
                      disabled={logoutLoading}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium text-destructive transition hover:bg-destructive/10 rounded-md disabled:opacity-50"
                    >
                      {logoutLoading ? (
                        <Loader2 size={16} className="shrink-0 animate-spin" />
                      ) : (
                        <LogOut size={16} className="shrink-0" />
                      )}
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileNavOpen && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
          <nav className="lg:hidden absolute top-full left-0 right-0 z-[56] border-b border-border bg-background shadow-soft-lg animate-fade-in">
            <div className="px-4 py-3 grid grid-cols-2 gap-1.5">
              {quickLinks.map((link) => {
                const isActive =
                  pathname === link.href ||
                  pathname.startsWith(link.href + "/");
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={`px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
