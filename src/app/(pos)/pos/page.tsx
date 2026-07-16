"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  CashRegister,
  ArrowRight,
  X,
  Calendar,
  Wallet,
  ShoppingCart,
  User,
  Lock,
  Spinner,
  Warning,
  Storefront,
} from "@phosphor-icons/react";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface RegisterSession {
  id: string;
  storeId: string;
  userId: string;
  openingCash: number;
  cashInTotal: number;
  cashOutTotal: number;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  user: {
    id: string;
    email: string;
    role: string;
    employee: { name: string } | null;
  };
  store: { id: string; name: string };
  totalSales: number;
  totalCashSales: number;
}

interface UserSession {
  user: {
    userId: string;
    role: string;
    name: string;
    storeId?: string | null;
  };
}

export default function PosDashboardPage() {
  const router = useRouter();
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [openingNote, setOpeningNote] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);

  const { data: sessionData } = useSWR<UserSession>(
    "/api/auth",
    (url: string) =>
      apiGet<UserSession>(url, { showToast: false }) as Promise<UserSession>,
  );

  const {
    data: sessionsData,
    isLoading,
    mutate,
  } = useSWR<{ sessions: RegisterSession[] }>(
    "/api/register-sessions?status=open",
    (url: string) =>
      apiGet<{ sessions: RegisterSession[] }>(url, {
        showToast: false,
      }) as Promise<{ sessions: RegisterSession[] }>,
    { refreshInterval: 10000 },
  );

  const sessions = sessionsData?.sessions;

  const handleOpenRegister = async () => {
    setModalLoading(true);
    try {
      await apiPost("/api/register-sessions", {
        openingCash: parseFloat(openingCash) || 0,
        openingNote,
      });
      toast.success("Register opened successfully");
      router.push("/pos/register");
    } catch (err) {
      console.error("Failed to open register:", err);
    } finally {
      setModalLoading(false);
    }
  };

  const handleForceClose = async (sessionId: string, expectedCash: number) => {
    const input = window.prompt(
      `Force-close this register?\n\nExpected cash in drawer: Rs ${expectedCash.toLocaleString("en-PK")}\n\nEnter the COUNTED cash amount:`,
      String(expectedCash),
    );
    if (input === null) {
      setClosingSessionId(null);
      return;
    }

    const closingCash = parseFloat(input);
    if (isNaN(closingCash) || closingCash < 0) {
      toast.error("Invalid cash amount");
      setClosingSessionId(null);
      return;
    }

    const difference = closingCash - expectedCash;
    const requiresNote = Math.abs(difference) > 100;
    let closingNote = "Force closed by manager from dashboard";
    if (requiresNote) {
      const note = window.prompt(
        `Cash discrepancy of Rs ${Math.abs(difference).toLocaleString("en-PK")} detected.\n\nA mandatory note is required to explain the difference:`,
      );
      if (!note || !note.trim()) {
        toast.error(
          "A closing note is required for cash discrepancies over Rs 100",
        );
        setClosingSessionId(null);
        return;
      }
      closingNote = `Force closed. Difference: Rs ${difference.toFixed(2)}. Note: ${note.trim()}`;
    }

    setClosingSessionId(sessionId);
    try {
      await apiPatch(`/api/register-sessions/${sessionId}`, {
        closingCash,
        closingNote,
      });
      toast.success("Register closed successfully");
      mutate();
    } catch {
      toast.error("Failed to close register");
    } finally {
      setClosingSessionId(null);
    }
  };

  if (isLoading || !sessionData) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            Loading registers...
          </p>
        </div>
      </div>
    );
  }

  const currentUserId = sessionData.user.userId;
  const isManagerOrAbove = ["manager", "admin", "owner"].includes(
    sessionData.user.role,
  );

  const isAllStoresMode =
    (sessionData.user.role === "owner" || sessionData.user.role === "admin") &&
    !sessionData.user.storeId;

  const allOpenSessions = sessions?.filter((s) => s.status === "open") || [];
  const myOpenSession = allOpenSessions.find((s) => s.userId === currentUserId);
  const visibleSessions = isManagerOrAbove
    ? allOpenSessions
    : myOpenSession
      ? [myOpenSession]
      : [];

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border bg-muted/40 px-3 sm:px-6 dark:border-border dark:bg-card">
        <h1 className="text-base sm:text-lg font-bold text-foreground truncate">
          Point of Sale{" "}
          {isAllStoresMode ? (
            <span className="text-xs sm:text-sm font-normal text-warning ml-1 sm:ml-2">
              (All Stores — View / Close Only)
            </span>
          ) : isManagerOrAbove ? (
            <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1 sm:ml-2">
              (Manager View)
            </span>
          ) : null}
        </h1>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg cursor-pointer px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-muted-foreground transition hover:text-foreground/80 dark:text-muted-foreground dark:hover:text-muted-foreground/60"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        {isAllStoresMode && (
          <div className="mb-4 sm:mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 sm:p-4 dark:border-warning/20">
            <Warning
              size={20}
              weight="bold"
              className="mt-0.5 shrink-0 text-warning"
            />
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-warning">
                All Stores View — Read / Close Only
              </h3>
              <p className="mt-1 text-[11px] sm:text-xs text-warning">
                You are viewing open register sessions across all your stores.
                You can force-close any session, but you cannot open a new
                register or continue selling from this view. To open a register
                or resume selling, switch to a specific store first using the
                store selector in the top bar.
              </p>
            </div>
          </div>
        )}

        {isAllStoresMode && allOpenSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40/50 p-8 sm:p-12 text-center dark:border-border dark:bg-card/50">
            <div className="mb-4 flex h-12 sm:h-16 w-12 sm:w-16 items-center justify-center rounded-2xl bg-muted dark:bg-muted">
              <Storefront
                size={24}
                className="text-muted-foreground sm:hidden"
              />
              <Storefront
                size={32}
                className="text-muted-foreground hidden sm:block"
              />
            </div>
            <h3 className="mb-1 text-base sm:text-lg font-bold text-foreground">
              No Open Registers
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              There are no open register sessions across any of your stores.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {visibleSessions.map((session) => {
              const expectedCash =
                Number(session.openingCash || 0) +
                Number(session.cashInTotal || 0) -
                Number(session.cashOutTotal || 0) +
                Number(session.totalCashSales || 0);
              const isMine = session.userId === currentUserId;

              const showContinueSelling = isMine && !isAllStoresMode;

              return (
                <div
                  key={session.id}
                  className={`group relative overflow-hidden rounded-2xl border p-4 sm:p-6 shadow-soft transition-all hover:shadow-soft-lg dark:bg-card ${showContinueSelling ? "border-primary/30 bg-primary/5 dark:border-primary/40" : "border-border bg-card dark:border-border"}`}
                >
                  <div className="mb-4 sm:mb-5 flex items-center justify-between">
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-foreground truncate">
                        {showContinueSelling
                          ? "My Register"
                          : session.user.employee?.name || session.user.email}
                      </h3>
                      <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">
                        Store: {session.store?.name || "N/A"} · Reg #
                        {session.id.slice(0, 8)}
                      </p>
                    </div>
                    <span className="rounded-full bg-success/15 px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-bold text-success shrink-0 ml-2 shrink-0 ml-2">
                      Open
                    </span>
                  </div>

                  {showContinueSelling ? (
                    <button
                      onClick={() => router.push("/pos/register")}
                      className="mb-4 sm:mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 sm:py-3 text-sm font-bold text-primary-foreground shadow-soft-lg shadow-primary/15 transition-all hover:bg-primary/90 active:scale-[0.98] dark:bg-primary dark:shadow-primary/10 dark:hover:bg-primary/90"
                    >
                      Continue Selling <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleForceClose(session.id, expectedCash)}
                      disabled={closingSessionId === session.id}
                      className="mb-4 sm:mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 py-2.5 sm:py-3 text-sm font-bold text-destructive transition-all hover:bg-destructive/15 disabled:opacity-50"
                    >
                      {closingSessionId === session.id ? (
                        <Spinner size={16} className="animate-spin" />
                      ) : (
                        <Lock size={16} />
                      )}
                      Force Close
                    </button>
                  )}

                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar size={14} />
                        <span>Opened</span>
                      </div>
                      <span className="font-medium text-foreground/80 dark:text-muted-foreground">
                        {new Date(session.openedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Wallet size={14} />
                        <span>Opening</span>
                      </div>
                      <span className="font-medium text-foreground/80 dark:text-muted-foreground">
                        {Number(session.openingCash || 0).toLocaleString(
                          "en-PK",
                        )}{" "}
                        Rs.
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <ShoppingCart size={14} />
                        <span>Total Sales</span>
                      </div>
                      <span className="font-medium text-success">
                        {Number(session.totalSales || 0).toLocaleString(
                          "en-PK",
                        )}{" "}
                        Rs.
                      </span>
                    </div>

                    <div className="mt-2 rounded-lg bg-muted p-2 dark:bg-muted">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-bold text-foreground/80 dark:text-muted-foreground">
                          Expected Cash
                        </span>
                        <span className="font-black text-foreground">
                          {expectedCash.toLocaleString("en-PK")} Rs.
                        </span>
                      </div>
                    </div>

                    {isManagerOrAbove && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User size={14} />
                          <span>Cashier</span>
                        </div>
                        <span className="font-medium text-foreground/80 dark:text-muted-foreground truncate max-w-30">
                          {session.user.employee?.name || session.user.email}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {!isAllStoresMode && !myOpenSession && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40/50 p-6 sm:p-6 text-center dark:border-border dark:bg-card/50">
                <div className="mb-4 flex h-12 sm:h-16 w-12 sm:w-16 items-center justify-center rounded-2xl bg-primary/10 dark:bg-primary/10">
                  <CashRegister
                    size={24}
                    className="text-primary sm:hidden"
                  />
                  <CashRegister
                    size={32}
                    className="text-primary hidden sm:block"
                  />
                </div>
                <h3 className="mb-1 text-base sm:text-lg font-bold text-foreground">
                  New Register
                </h3>
                <p className="mb-4 sm:mb-5 text-xs sm:text-sm text-muted-foreground">
                  Start a new shift
                </p>
                <button
                  onClick={() => setShowOpenModal(true)}
                  className="rounded-xl bg-primary px-5 sm:px-6 py-2 sm:py-2.5 text-sm font-bold text-primary-foreground shadow-soft-lg shadow-primary/15 transition-all hover:bg-primary/90 active:scale-[0.98]"
                >
                  Open Register
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-soft-lg dark:border-border dark:bg-card">
            <h2 className="mb-4 sm:mb-6 text-base sm:text-lg font-bold text-foreground">
              Opening Control
            </h2>
            <div className="mb-4 sm:mb-5">
              <label className="mb-2 block text-sm font-semibold text-foreground/80 dark:text-muted-foreground">
                Opening cash
              </label>
              <div className="relative flex items-center">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/40 py-2.5 pl-3 pr-12 text-base text-foreground transition focus:border-ring focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30 dark:border-border dark:bg-muted dark:text-white"
                />
                <button
                  onClick={() => setOpeningCash("0")}
                  className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground/80 dark:hover:bg-muted/70 dark:hover:text-muted-foreground"
                  title="Clear"
                  aria-label="Clear opening cash"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="mb-4 sm:mb-6">
              <label className="mb-2 block text-sm font-semibold text-foreground/80 dark:text-muted-foreground">
                Opening note
              </label>
              <textarea
                rows={3}
                value={openingNote}
                onChange={(e) => setOpeningNote(e.target.value)}
                placeholder="Add an opening note..."
                className="w-full rounded-xl border border-border bg-muted/40 p-3 text-sm text-foreground placeholder:text-muted-foreground transition focus:border-ring focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30 dark:border-border dark:bg-muted dark:text-white dark:placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleOpenRegister}
                disabled={modalLoading}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 sm:px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft-lg shadow-primary/15 transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
              >
                {modalLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {modalLoading ? "Opening..." : "Open Register"}
              </button>
              <button
                onClick={() => setShowOpenModal(false)}
                disabled={modalLoading}
                className="rounded-xl border border-border bg-card px-4 sm:px-5 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-muted/40 disabled:opacity-50 dark:border-border dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted/70"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
