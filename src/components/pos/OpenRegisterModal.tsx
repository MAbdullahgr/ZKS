"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePos } from "@/lib/pos-store";
import { apiPost } from "@/lib/fetcher";
import { X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function OpenRegisterModal() {
  const { dispatch } = usePos();
  const router = useRouter();
  const [cash, setCash] = useState("0");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const cashInputRef = useRef<HTMLInputElement>(null);
  const cashStateRef = useRef(cash);
  const noteStateRef = useRef(note);
  const loadingStateRef = useRef(loading);

  useEffect(() => {
    cashStateRef.current = cash;
  }, [cash]);
  useEffect(() => {
    noteStateRef.current = note;
  }, [note]);
  useEffect(() => {
    loadingStateRef.current = loading;
  }, [loading]);

  useEffect(() => {
    cashInputRef.current?.focus();
    cashInputRef.current?.select();
  }, []);

  const handleOpen = useCallback(async () => {
    const val = parseFloat(cashStateRef.current) || 0;
    setLoading(true);

    try {
      const result = await apiPost<{
        id: string;
        openingCash: number;
        openingNote: string;
      }>("/api/register-sessions", {
        openingCash: val,
        openingNote: noteStateRef.current,
      });

      if (result) {
        dispatch({
          type: "OPEN_REGISTER",
          payload: {
            openingCash: val,
            openingNote: noteStateRef.current,
            id: result.id,
          },
        });
        toast.success("Register opened successfully");
      }
    } catch (err) {
      console.error("Failed to open register:", err);
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  const handleDiscard = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (loadingStateRef.current) return;
      if (e.key === "Enter" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        handleOpen();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleOpen]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !loadingStateRef.current) handleDiscard();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-lg sm:rounded-xl bg-card p-4 sm:p-6 max-w-sm sm:max-w-lg dark:bg-muted mx-4"
      >
        <DialogHeader className="mb-4 sm:mb-6">
          <DialogTitle className="text-base sm:text-lg font-semibold text-foreground dark:text-foreground">
            Opening Control
          </DialogTitle>
        </DialogHeader>

        <div className="mb-4 sm:mb-5">
          <label className="mb-2 block text-sm text-foreground/80 dark:text-muted-foreground/60">
            Opening cash
          </label>
          <div className="relative flex items-center">
            <input
              ref={cashInputRef}
              type="number"
              min="0"
              step="0.01"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg sm:rounded-xl border border-border py-2.5 pl-3 pr-12 text-base text-foreground focus:border-info focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50 dark:border-border dark:bg-muted dark:text-foreground"
            />
            <button
              onClick={() => setCash("0")}
              disabled={loading}
              className="absolute right-2 flex h-9 w-9 items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground/80 disabled:opacity-50 dark:hover:bg-muted"
              title="Clear"
              aria-label="Clear opening cash"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="mb-4 sm:mb-6">
          <label className="mb-2 block text-sm text-foreground/80 dark:text-muted-foreground/60">
            Opening note
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={loading}
            placeholder="Add an opening note..."
            className="w-full rounded-lg sm:rounded-xl border border-border p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-info focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50 dark:border-border dark:bg-muted dark:text-foreground dark:placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={handleDiscard}
            disabled={loading}
            className="rounded-lg sm:rounded-xl border border-border bg-card px-4 sm:px-5 py-2.5 text-sm font-semibold text-foreground/80 hover:bg-muted/30 disabled:opacity-50 dark:border-border dark:bg-muted dark:text-muted-foreground/50 dark:hover:bg-muted"
          >
            Discard
          </button>
          <button
            onClick={handleOpen}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-lg sm:rounded-xl bg-info/90 px-4 sm:px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-info/90 disabled:opacity-50 dark:bg-info/90 dark:hover:bg-info/90"
          >
            {loading ? "Opening..." : "Open Register"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
