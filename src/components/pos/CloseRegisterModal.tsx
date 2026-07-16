"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePos } from "@/lib/pos-store";
import { useRouter } from "next/navigation";
import { apiPatch, apiGet } from "@/lib/fetcher";
import { SpinnerIcon, X } from "@phosphor-icons/react";
import { toast } from "sonner";

interface DbSession {
  id: string;
  openingCash: number;
  cashInTotal: number;
  cashOutTotal: number;
  status: string;
  totalSales: number;
  totalCashSales: number;
  totalKhataSales: number;
  totalCardSales: number;
  totalMobileSales: number;
  totalJazzcashSales?: number;
  totalEasypaisaSales?: number;
  expectedCash?: number;
}

export default function CloseRegisterModal() {
  const { state, dispatch } = usePos();
  const router = useRouter();
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [dbSession, setDbSession] = useState<DbSession | null>(null);
  const [fetchError, setFetchError] = useState("");
  const countedCashRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchSession = async () => {
      const sessionId = state.registerSession?.id;
      if (!sessionId) {
        setFetching(false);
        setFetchError("No active session found");
        return;
      }

      try {
        const session = await apiGet<DbSession>(
          `/api/register-sessions/${sessionId}`,
        );
        if (session) {
          setDbSession({
            id: session.id,
            openingCash: Number(session.openingCash),
            cashInTotal: Number(session.cashInTotal || 0),
            cashOutTotal: Number(session.cashOutTotal || 0),
            status: session.status,
            totalSales: Number(session.totalSales || 0),
            totalCashSales: Number(session.totalCashSales || 0),
            totalKhataSales: Number(session.totalKhataSales || 0),
            totalCardSales: Number(session.totalCardSales || 0),
            totalMobileSales: Number(session.totalMobileSales || 0),
            totalJazzcashSales: Number(session.totalJazzcashSales || 0),
            totalEasypaisaSales: Number(session.totalEasypaisaSales || 0),
            // Issue 14 & 15: Prefer the server-computed expectedCash when
            // available; otherwise fall back to a local derivation.
            expectedCash:
              typeof session.expectedCash === "number"
                ? Number(session.expectedCash)
                : Number(session.openingCash || 0) +
                  Number(session.cashInTotal || 0) -
                  Number(session.cashOutTotal || 0) +
                  Number(session.totalCashSales || 0),
          });
        } else {
          setFetchError("Session not found in database");
        }
      } catch {
        setFetchError("Failed to load session data. Using local data.");
        if (state.registerSession) {
          setDbSession({
            id: state.registerSession.id,
            openingCash: state.registerSession.openingCash,
            cashInTotal: state.registerSession.cashInTotal,
            cashOutTotal: state.registerSession.cashOutTotal,
            status: state.registerSession.status,
            totalSales: 0,
            totalCashSales: 0,
            totalKhataSales: 0,
            totalCardSales: 0,
            totalMobileSales: 0,
          });
        }
      } finally {
        setFetching(false);
      }
    };
    fetchSession();
  }, [state.registerSession]);

  // FIX: Auto-focus counted cash input when data is ready
  useEffect(() => {
    if (!fetching && dbSession) {
      countedCashRef.current?.focus();
    }
  }, [fetching, dbSession]);

  const expectedCash = dbSession
    ? typeof dbSession.expectedCash === "number"
      ? dbSession.expectedCash
      : dbSession.openingCash +
        dbSession.cashInTotal -
        dbSession.cashOutTotal +
        dbSession.totalCashSales
    : 0;
  const counted = parseFloat(countedCash) || 0;
  const difference = counted - expectedCash;

  const handleClose = useCallback(async () => {
    if (!dbSession) return;

    // Frontend enforcement of the 100 Rs discrepancy rule
    if (Math.abs(difference) > 100 && !note.trim()) {
      toast.error(
        "Cash discrepancy of over Rs. 100 detected. A mandatory closing note is required to explain the difference.",
      );
      return;
    }

    setLoading(true);
    try {
      await apiPatch(`/api/register-sessions/${dbSession.id}`, {
        closingCash: counted,
        closingNote: note,
      });

      dispatch({
        type: "CLOSE_REGISTER",
        payload: { closingCash: counted, closingNote: note },
      });
      dispatch({ type: "CLOSE_MODAL" });
      toast.success("Register closed successfully");
      router.push("/pos");
    } catch {
      toast.error("Failed to close register. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [dbSession, difference, note, counted, dispatch, router]);

  // FIX: Keyboard shortcuts for Enter (submit) and Escape (cancel)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dispatch({ type: "CLOSE_MODAL" });
      }
      if (e.key === "Enter" && !loading && !fetching && dbSession) {
        // Prevent Enter from submitting if the user is typing in the note textarea
        // (they can use Ctrl+Enter for the note, or just click the button)
        if (document.activeElement?.tagName !== "TEXTAREA") {
          e.preventDefault();
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, fetching, dbSession, handleClose, dispatch]);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-card p-4 sm:p-6 shadow-soft-lg dark:bg-muted">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-black text-foreground dark:text-foreground">
            Close Register
          </h3>
          <button
            onClick={() => dispatch({ type: "CLOSE_MODAL" })}
            disabled={loading}
            aria-label="Close close-register dialog"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50 dark:hover:bg-muted"
          >
            <X size={20} />
          </button>
        </div>

        {fetching && (
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-muted/30 p-4 dark:bg-muted/50">
            <SpinnerIcon size={20} className="animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading session data...</p>
          </div>
        )}

        {fetchError && !fetching && (
          <div className="mb-4 rounded-xl bg-warning/10 p-3 text-sm text-warning dark:bg-warning/90/20 dark:text-warning/80">
            {fetchError}
          </div>
        )}

        {!fetching && !dbSession && (
          <div className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/90/20 dark:text-destructive/70">
            No active register session found. Please reload the page.
          </div>
        )}

        {dbSession && (
          <>
            <div className="mb-4 space-y-2 rounded-xl bg-muted/30 p-4 dark:bg-muted/50">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Opening Cash</span>
                <span className="font-bold">
                  {dbSession.openingCash.toLocaleString("en-PK")} Rs.
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cash Sales</span>
                <span className="font-bold text-success">
                  +{dbSession.totalCashSales.toLocaleString("en-PK")} Rs.
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Khata Sales</span>
                <span className="font-medium text-warning">
                  {dbSession.totalKhataSales?.toLocaleString("en-PK") || 0} Rs
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Card Sales</span>
                <span className="font-medium text-primary">
                  {dbSession.totalCardSales?.toLocaleString("en-PK") || 0} Rs
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Mobile Sales</span>
                <span className="font-medium text-info">
                  {dbSession.totalMobileSales?.toLocaleString("en-PK") || 0} Rs
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Jazzcash Sales</span>
                <span className="font-medium text-info">
                  {dbSession.totalJazzcashSales?.toLocaleString("en-PK") || 0} Rs
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Easypaisa Sales</span>
                <span className="font-medium text-info">
                  {dbSession.totalEasypaisaSales?.toLocaleString("en-PK") || 0} Rs
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cash In</span>
                <span className="font-bold text-success">
                  +{dbSession.cashInTotal.toLocaleString("en-PK")} Rs.
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cash Out</span>
                <span className="font-bold text-destructive">
                  -{dbSession.cashOutTotal.toLocaleString("en-PK")} Rs.
                </span>
              </div>
              <div className="border-t border-border pt-2 dark:border-border">
                <div className="flex justify-between text-sm font-black">
                  <span className="text-foreground/80">Expected</span>
                  <span className="text-foreground">
                    {expectedCash.toLocaleString("en-PK")} Rs.
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Counted Cash
              </label>
              <input
                ref={countedCashRef}
                type="number"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-border py-3 px-4 text-xl font-black focus:border-success focus:outline-none focus:ring-1 focus:ring-success disabled:opacity-50 dark:border-border dark:bg-muted dark:text-foreground"
              />
            </div>

            {countedCash && (
              <div
                className={`mb-3 rounded-xl p-3 text-center text-sm font-black ${difference === 0 ? "bg-success/10 text-success dark:bg-success/90/20" : difference > 0 ? "bg-warning/10 text-warning dark:bg-warning/90/20" : "bg-destructive/10 text-destructive dark:bg-destructive/90/20"}`}
              >
                {difference === 0
                  ? "Perfect match!"
                  : difference > 0
                    ? `Surplus: ${difference.toLocaleString("en-PK")} Rs.`
                    : `Shortage: ${Math.abs(difference).toLocaleString("en-PK")} Rs.`}
              </div>
            )}

            <div className="mb-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Closing Note{" "}
                {Math.abs(difference) > 100 && (
                  <span className="text-destructive">(Mandatory)</span>
                )}
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={loading}
                placeholder="Any notes..."
                className="w-full rounded-xl border border-border p-3 text-sm focus:border-success focus:outline-none disabled:opacity-50 dark:border-border dark:bg-muted dark:text-foreground"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => dispatch({ type: "CLOSE_MODAL" })}
                disabled={loading}
                className="flex-1 rounded-xl border border-border py-3 text-sm font-bold text-foreground/80 hover:bg-muted/30 disabled:opacity-50 dark:border-border dark:text-muted-foreground/60 dark:hover:bg-muted"
              >
                Discard
              </button>
              <button
                onClick={handleClose}
                disabled={!countedCash || loading || fetching}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground transition-colors"
              >
                {loading ? "Closing..." : "Close Register"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
