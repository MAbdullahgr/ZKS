"use client";

import React, { useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { usePrintReceipt } from "@/hooks/usePrintReceipt";
import { apiGet } from "@/lib/fetcher";
import { setCurrentPosUserId } from "@/lib/pos/persistence";
import { WifiSlash } from "@phosphor-icons/react";
import { Toaster } from "@/components/ui/sonner";

class PosErrorBoundary extends React.Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-4 text-center">
          <h1 className="mb-2 text-xl sm:text-2xl font-bold text-primary-foreground">
            System Glitch
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            The POS encountered an unexpected error. Don&lsquo;t worry, your
            data is safe.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Reload POS
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
  return isOnline;
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const { printReceipt } = usePrintReceipt();
  const isOnline = useOnlineStatus();

  useEffect(() => {
    const handlePrint = (e: Event) => {
      if (e instanceof CustomEvent && e.detail) {
        printReceipt(e.detail);
      }
    };
    window.addEventListener("pos:print-receipt", handlePrint);
    return () => window.removeEventListener("pos:print-receipt", handlePrint);
  }, [printReceipt]);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const data = await apiGet<{
          user: {
            userId: string;
            name: string;
            role: string;
            storeId?: string | null;
          };
        }>("/api/auth");
        if (!data?.user) {
          if (!cancelled) router.replace("/login");
          return;
        }

        setCurrentPosUserId(data.user.userId);

        const isOwnerOrAdmin =
          data.user.role === "owner" || data.user.role === "admin";

        if (!data.user.storeId && !isOwnerOrAdmin) {
          if (!cancelled) router.replace("/dashboard");
          return;
        }
      } catch {
        if (!cancelled) router.replace("/login");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    checkAuth();

    const interval = setInterval(checkAuth, 120000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading POS...</p>
        </div>
      </div>
    );
  }

  return (
    <PosErrorBoundary>
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-100 flex items-center justify-center gap-2 bg-destructive py-1.5 px-4 text-xs font-bold text-primary-foreground">
          <WifiSlash size={14} weight="bold" />
          <span className="hidden sm:inline">
            Internet Disconnected — Some features may be unavailable
          </span>
          <span className="sm:hidden">Offline</span>
        </div>
      )}
      <div
        id="main-content"
        className={`flex h-screen w-screen flex-col overflow-hidden bg-muted dark:bg-background ${!isOnline ? "pt-7 sm:pt-6" : ""}`}
      >
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            className: "text-sm sm:text-base",
          }}
        />
      </div>
    </PosErrorBoundary>
  );
}
