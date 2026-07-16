"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePos } from "@/lib/pos-store";
import { LockKey, Eye, EyeSlash, Spinner } from "@phosphor-icons/react";
import { apiPost } from "@/lib/fetcher";

export default function LockScreen() {
  const { dispatch } = usePos();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleUnlock = useCallback(async () => {
    if (pin.length < 4) {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    setLoading(true);
    try {
      const data = await apiPost<{ valid: boolean }>("/api/settings/pin", {
        pin,
      });

      if (data?.valid) {
        dispatch({ type: "UNLOCK" });
        setPin("");
        setError(false);
      } else {
        setError(true);
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch {
      // Error toast is handled by apiFetch, but we still shake the input
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  }, [pin, dispatch]);

  // FIX: Handle Enter key directly on the input to prevent double-triggering with the button
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!loading) handleUnlock();
      }
    },
    [handleUnlock, loading],
  );

  return (
    <div className="fixed inset-0 z-80 flex flex-col items-center justify-center bg-card">
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }}
      />

      <div
        className={`relative w-full max-w-sm rounded-2xl border border-border bg-muted p-8 shadow-soft-lg transition-transform ${
          shake ? "animate-[shake_0.4s_ease-in-out]" : ""
        }`}
      >
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 ring-1 ring-teal-500/20">
            <LockKey size={32} weight="fill" className="text-success/80" />
          </div>
          <h2 className="text-xl font-bold text-primary-foreground">Screen Locked</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your PIN to continue
          </p>
        </div>

        <div className="relative mb-4">
          <input
            ref={inputRef}
            autoFocus
            type={showPin ? "text" : "password"}
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
              setPin(digits);
              setError(false);
            }}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className={`w-full rounded-xl border-2 bg-muted px-4 py-4 text-center text-3xl font-bold tracking-[0.3em] text-primary-foreground placeholder:text-muted-foreground transition-all focus:outline-none ${
              error
                ? "border-destructive/30 focus:border-ring"
                : "border-border focus:border-success"
            } disabled:opacity-50`}
            placeholder="••••"
          />
          <button
            onClick={() => setShowPin(!showPin)}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            type="button"
            tabIndex={-1}
            aria-label={showPin ? "Hide PIN" : "Show PIN"}
          >
            {showPin ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {error && (
          <p className="mb-4 text-center text-sm font-medium text-destructive/70">
            Incorrect PIN
          </p>
        )}

        {/* FIX: Updated dots to match maxLength of 8 */}
        <div className="mb-6 flex justify-center gap-2">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-all ${
                i < pin.length ? "scale-110 bg-primary" : "bg-muted-foreground/40"
              }`}
            />
          ))}
        </div>

        <button
          onClick={handleUnlock}
          disabled={pin.length === 0 || loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-success py-3.5 text-sm font-bold text-primary-foreground shadow-soft-lg shadow-teal-600/20 transition-all hover:bg-success/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
        >
          {loading ? (
            <>
              <Spinner size={18} className="animate-spin" />
              Verifying...
            </>
          ) : (
            "Unlock"
          )}
        </button>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Session locked after 10 minutes of inactivity
        </p>
      </div>
    </div>
  );
}
