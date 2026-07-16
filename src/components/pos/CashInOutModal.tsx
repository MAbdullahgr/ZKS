"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePos } from "@/lib/pos-store";
import { apiPost } from "@/lib/fetcher";
import { X, ArrowDown, ArrowUp, SpinnerIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function CashInOutModal() {
  const { state, dispatch } = usePos();
  const [type, setType] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  // Auto-focus amount input on mount
  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const val = parseFloat(amount);
    const trimmedReason = reason.trim();

    // Validation
    if (isNaN(val) || val <= 0) {
      setError("Please enter a valid amount greater than 0");
      return;
    }
    if (!trimmedReason) {
      setError("Please enter a reason");
      return;
    }

    // FIX: Drawer Overdraft Protection for Cash Out
    if (type === "out" && state.registerSession) {
      const session = state.registerSession;
      // Note: local session might not have totalCashSales, but it's a good safety check
      const availableCash =
        session.openingCash + session.cashInTotal - session.cashOutTotal;
      if (val > availableCash) {
        setError(
          `Insufficient drawer cash. Available: Rs. ${availableCash.toLocaleString("en-PK")}`,
        );
        return;
      }
    }

    setError("");
    setLoading(true);

    try {
      if (state.registerSession?.id) {
        await apiPost(
          `/api/register-sessions/${state.registerSession.id}/cash`,
          {
            type: type === "in" ? "cash_in" : "cash_out",
            amount: val,
            reason: trimmedReason,
          },
        );
      } else {
        throw new Error("No active register session");
      }

      // Only update local state after confirmed DB save
      dispatch({
        type: "CASH_IN_OUT",
        payload: {
          id: crypto.randomUUID(),
          type,
          amount: val,
          reason: trimmedReason,
          createdAt: Date.now(),
        },
      });
      dispatch({ type: "CLOSE_MODAL" });
      toast.success(
        `Cash ${type === "in" ? "added to" : "removed from"} drawer`,
      );
    } catch (err) {
      console.error("Failed to record cash transaction:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save transaction. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [amount, reason, type, state.registerSession, dispatch]);

  const handleClose = useCallback(() => {
    if (!loading) {
      dispatch({ type: "CLOSE_MODAL" });
    }
  }, [loading, dispatch]);

  // FIX: Keyboard shortcut for Enter (Dialog provides Escape natively).
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && document.activeElement?.tagName !== "BUTTON") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Dialog calls onOpenChange(false) on Escape / overlay click / X.
        if (!open) handleClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-2xl bg-card p-6 sm:max-w-sm dark:bg-muted"
      >
        <DialogHeader className="mb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-black text-foreground dark:text-foreground">
              Cash In / Out
            </DialogTitle>
            <button
              onClick={handleClose}
              disabled={loading}
              aria-label="Close cash in/out dialog"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50 dark:hover:bg-muted"
            >
              <X size={20} />
            </button>
          </div>
        </DialogHeader>

        {/* Type toggle */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setType("in")}
            disabled={loading}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-black ${
              type === "in"
                ? "border-success bg-success/10 text-success dark:bg-success/90/20 dark:text-success/70"
                : "border-border text-foreground/80 dark:border-border dark:text-muted-foreground/60"
            }`}
          >
            <ArrowDown size={16} /> Cash In
          </button>
          <button
            onClick={() => setType("out")}
            disabled={loading}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-black ${
              type === "out"
                ? "border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/90/20 dark:text-destructive/60"
                : "border-border text-foreground/80 dark:border-border dark:text-muted-foreground/60"
            }`}
          >
            <ArrowUp size={16} /> Cash Out
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-3 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive dark:bg-destructive/90/20 dark:text-destructive/70">
            {error}
          </div>
        )}

        {/* Amount */}
        <div className="mb-3">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Amount (Rs.)
          </label>
          <input
            ref={amountRef}
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError("");
            }}
            disabled={loading}
            placeholder="0.00"
            className="w-full rounded-xl border border-border py-3 px-4 text-xl font-black focus:border-success focus:outline-none focus:ring-1 focus:ring-success disabled:opacity-50 dark:border-border dark:bg-muted dark:text-foreground"
          />
        </div>

        {/* Reason */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Reason
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError("");
            }}
            disabled={loading}
            placeholder="e.g. Tea money, Owner withdrawal..."
            className="w-full rounded-xl border border-border py-2.5 px-4 text-sm focus:border-success focus:outline-none disabled:opacity-50 dark:border-border dark:bg-muted dark:text-foreground"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-success py-3 text-sm font-black text-primary-foreground hover:bg-success/90 disabled:bg-muted disabled:text-muted-foreground dark:bg-success/90 dark:hover:bg-success dark:disabled:bg-muted"
        >
          {loading ? (
            <>
              <SpinnerIcon size={16} className="animate-spin" />
              Recording...
            </>
          ) : (
            `Record ${type === "in" ? "Cash In" : "Cash Out"}`
          )}
        </button>
      </DialogContent>
    </Dialog>
  );
}
