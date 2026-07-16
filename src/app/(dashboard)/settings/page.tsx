"use client";

import { useState } from "react";
import useSWR from "swr";
import { Save, Lock, Store, Loader2, AlertCircle } from "lucide-react";
import { apiGet, apiPatch, apiPut } from "@/lib/fetcher";
import { toast } from "sonner";

interface Settings {
  storeName: string;
  address: string;
  phone: string;
  currency: string;
  taxRate: number;
  displayTaxBreakdown: boolean;
}

const defaultSettings: Settings = {
  storeName: "",
  address: "",
  phone: "",
  currency: "Rs.",
  taxRate: 0,
  displayTaxBreakdown: true,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [storeLoading, setStoreLoading] = useState(false);

  const [pinForm, setPinForm] = useState({
    currentPin: "",
    newPin: "",
    confirmPin: "",
  });
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");

  // FIX: Use SWR for data fetching
  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<{ settings: Settings }>(
    "/api/settings",
    (url: string) =>
      apiGet<{ settings: Settings }>(url) as Promise<{ settings: Settings }>,
  );

  // Check whether a PIN has been configured yet. Drives whether we render
  // the "Set PIN" (PUT, first-time) form or the "Change PIN" (PATCH) form.
  const { data: pinStatus, mutate: mutatePinStatus } = useSWR<{
    hasPin: boolean;
  }>(
    "/api/settings/pin",
    (url: string) =>
      apiGet<{ hasPin: boolean }>(url) as Promise<{ hasPin: boolean }>,
  );
  const hasPin = !!pinStatus?.hasPin;

  // FIX: Sync state when data loads (React 19 pattern)
  const [prevSettings, setPrevSettings] = useState<Settings | null>(null);
  if (data?.settings && data.settings !== prevSettings) {
    setPrevSettings(data.settings);
    setSettings({
      storeName: data.settings.storeName ?? "",
      address: data.settings.address ?? "",
      phone: data.settings.phone ?? "",
      currency: data.settings.currency ?? "Rs.",
      taxRate: Number(data.settings.taxRate ?? 0),
      displayTaxBreakdown: data.settings.displayTaxBreakdown ?? true,
    });
  }

  async function handleSaveStore() {
    if (storeLoading) return;
    setStoreLoading(true);

    try {
      // FIX: Pass showToast: false to prevent double toasts
      await apiPatch(
        "/api/settings",
        {
          storeName: settings.storeName,
          address: settings.address,
          phone: settings.phone,
          currency: settings.currency,
          taxRate: settings.taxRate,
          displayTaxBreakdown: settings.displayTaxBreakdown,
        },
        { showToast: false },
      );
      toast.success("Settings saved successfully");
      mutate(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving settings");
    } finally {
      setStoreLoading(false);
    }
  }

  function validatePinFields(): boolean {
    // First-time setup: only newPin + confirmPin required
    if (!hasPin) {
      if (!pinForm.newPin || !pinForm.confirmPin) {
        setPinError("New PIN and confirm PIN are required");
        return false;
      }
    } else {
      if (!pinForm.currentPin || !pinForm.newPin || !pinForm.confirmPin) {
        setPinError("All fields are required");
        return false;
      }
    }
    if (pinForm.newPin !== pinForm.confirmPin) {
      setPinError("New PINs do not match");
      return false;
    }
    if (pinForm.newPin.length < 4 || pinForm.newPin.length > 8) {
      setPinError("PIN must be between 4 and 8 digits");
      return false;
    }
    if (!/^\d+$/.test(pinForm.newPin)) {
      setPinError("PIN must contain only numbers");
      return false;
    }
    return true;
  }

  async function handleSetPin() {
    // First-time PIN setup → PUT /api/settings/pin
    if (pinLoading) return;
    setPinError("");
    if (!validatePinFields()) return;

    setPinLoading(true);
    try {
      await apiPut(
        "/api/settings/pin",
        { newPin: pinForm.newPin },
        { showToast: false },
      );
      toast.success("PIN set successfully");
      setPinForm({ currentPin: "", newPin: "", confirmPin: "" });
      mutatePinStatus(); // refresh hasPin → flips form to "Change PIN"
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Error setting PIN");
    } finally {
      setPinLoading(false);
    }
  }

  async function handleChangePin() {
    if (pinLoading) return;
    setPinError("");
    if (!validatePinFields()) return;

    setPinLoading(true);

    try {
      // FIX: Pass showToast: false to prevent double toasts
      await apiPatch(
        "/api/settings/pin",
        {
          currentPin: pinForm.currentPin,
          newPin: pinForm.newPin,
        },
        { showToast: false },
      );

      toast.success("PIN updated successfully");
      setPinForm({ currentPin: "", newPin: "", confirmPin: "" }); // Clear fields on success
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Error updating PIN");
    } finally {
      setPinLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto flex items-center justify-center min-h-100px">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
          <AlertCircle className="w-5 h-5" />
          <span>{fetchError.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Manage your store information and security
        </p>
      </div>

      {/* Store Info */}
      <div className="bg-card rounded-xl border border-border shadow-soft mb-6">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Store className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Store Information</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/90 mb-1">
              Store Name
            </label>
            <input
              type="text"
              maxLength={100}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition-all"
              value={settings.storeName}
              onChange={(e) =>
                setSettings((s) => ({ ...s, storeName: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/90 mb-1">
              Phone
            </label>
            <input
              type="tel"
              maxLength={30}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition-all"
              placeholder="e.g. 0300-1234567"
              value={settings.phone}
              onChange={(e) =>
                setSettings((s) => ({ ...s, phone: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/90 mb-1">
              Address
            </label>
            <textarea
              className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition-all resize-none"
              rows={2}
              maxLength={500}
              placeholder="Shop address"
              value={settings.address}
              onChange={(e) =>
                setSettings((s) => ({ ...s, address: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                Currency Symbol
              </label>
              <input
                type="text"
                maxLength={10}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition-all"
                value={settings.currency}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, currency: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground/70 mt-1">
                Displayed before all prices (e.g. Rs., PKR, $)
              </p>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                Tax Rate (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition-all"
                value={settings.taxRate}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    taxRate: Math.max(0, Math.min(100, Number(e.target.value))),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground/70 mt-1">
                Applied to sales (0 = no tax)
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg sm:col-span-2 lg:col-span-1">
              <div className="min-w-0">
                <label className="block text-sm font-medium text-foreground/90">
                  Display Tax Breakdown
                </label>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Show Subtotal + Tax on POS and receipts
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    displayTaxBreakdown: !s.displayTaxBreakdown,
                  }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-3 ${
                  settings.displayTaxBreakdown ? "bg-primary" : "bg-muted/70"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${
                    settings.displayTaxBreakdown
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          <button
            onClick={handleSaveStore}
            disabled={storeLoading}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 active:bg-primary/95 disabled:opacity-50 text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
          >
            {storeLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Set / Change PIN */}
      <div className="bg-card rounded-xl border border-border shadow-soft">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">
            {hasPin ? "Change Store PIN" : "Set Store PIN"}
          </h2>
        </div>
        <div className="p-5 space-y-4">
          {hasPin && (
            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                Current PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                autoComplete="off"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition-all tracking-widest"
                placeholder="Enter current PIN"
                value={pinForm.currentPin}
                onChange={(e) =>
                  setPinForm((f) => ({
                    ...f,
                    currentPin: e.target.value.replace(/\D/g, ""),
                  }))
                }
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-foreground/90 mb-1">
              New PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition-all tracking-widest"
              placeholder="4–8 digits"
              value={pinForm.newPin}
              onChange={(e) =>
                setPinForm((f) => ({
                  ...f,
                  newPin: e.target.value.replace(/\D/g, ""),
                }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/90 mb-1">
              Confirm New PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition-all tracking-widest"
              placeholder="Repeat new PIN"
              value={pinForm.confirmPin}
              onChange={(e) =>
                setPinForm((f) => ({
                  ...f,
                  confirmPin: e.target.value.replace(/\D/g, ""),
                }))
              }
            />
          </div>

          {!hasPin && (
            <p className="text-xs text-warning bg-warning/10 border border-amber-100 rounded-lg px-3 py-2">
              No PIN has been configured yet. Set one now to enable the POS lock
              screen.
            </p>
          )}

          {pinError && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{pinError}</span>
            </div>
          )}

          <button
            onClick={hasPin ? handleChangePin : handleSetPin}
            disabled={pinLoading}
            className="flex items-center gap-2 bg-foreground/90 hover:bg-foreground/70 active:bg-foreground/80 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
          >
            {pinLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Updating...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                {hasPin ? "Update PIN" : "Set PIN"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
