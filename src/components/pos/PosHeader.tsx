"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { usePos } from "@/lib/pos-store";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  MagnifyingGlass,
  Barcode,
  Plus,
  X,
  Sun,
  Moon,
  CashRegister,
  DoorOpen,
  ArrowClockwise,
  Desktop,
  WifiSlash,
  List,
  Receipt,
  Camera,
  Spinner,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Html5Qrcode } from "html5-qrcode";

interface PosHeaderProps {
  userName?: string;
  userRole?: string;
}

function useOnlineStatus() {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener("online", callback);
      window.addEventListener("offline", callback);
      return () => {
        window.removeEventListener("online", callback);
        window.removeEventListener("offline", callback);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export default function PosHeader({
  userName = "User",
  userRole = "cashier",
}: PosHeaderProps) {
  const { state, dispatch, products } = usePos();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef(0);
  const lastScannedCodeRef = useRef<string | null>(null);

  useEffect(() => {
    lastScannedCodeRef.current = lastScannedCode;
  }, [lastScannedCode]);

  const handleSearch = useCallback(
    (value: string) => dispatch({ type: "SET_SEARCH", payload: value }),
    [dispatch],
  );

  const handleNewSale = useCallback(() => {
    dispatch({ type: "NEW_SALE" });
    toast.success("New sale started. Previous order parked.");
  }, [dispatch]);

  const onScanSuccess = useCallback(
    (decodedText: string) => {
      const now = Date.now();
      if (
        now - lastScanTimeRef.current < 1500 &&
        decodedText === lastScannedCodeRef.current
      ) {
        return;
      }
      lastScanTimeRef.current = now;
      setLastScannedCode(decodedText);

      const product = products.find((p) => p.barcode === decodedText);
      if (product) {
        if (product.stock <= 0) {
          toast.error(`Out of stock: ${product.name}`);
        } else {
          dispatch({ type: "ADD_TO_CART", payload: { product } });
          toast.success(`Added: ${product.name}`, { duration: 1500 });

          try {
            const AudioContextClass =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext;
            const audioCtx = new AudioContextClass();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.frequency.value = 880;
            oscillator.type = "sine";
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(
              0.001,
              audioCtx.currentTime + 0.15,
            );
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.15);
          } catch {
            // Ignore audio errors
          }
        }
      } else {
        toast.error(`Barcode not found: ${decodedText}`);
      }
    },
    [products, dispatch],
  );

  // const stopCameraScanner = useCallback(async () => {
  //   if (scannerRef.current) {
  //     try {
  //       await scannerRef.current.stop();
  //       await scannerRef.current.clear();
  //     } catch (err) {
  //       console.error("Failed to stop camera:", err);
  //     }
  //     scannerRef.current = null;
  //   }
  //   setScannerOpen(false);
  //   setLastScannedCode(null);
  // }, []);

  const stopCameraScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        // Html5QrcodeScannerState.SCANNING is usually state value 2
        // Checking if it is actively running prevents the "not running" error
        if (
          scannerRef.current.isScanning ||
          scannerRef.current.getState() === 2
        ) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.error("Failed to stop camera:", err);
      }
      // Always nullify the ref to clean up memory
      scannerRef.current = null;
    }
    setScannerOpen(false);
    setLastScannedCode(null);
  }, []);

  const startCameraScanner = useCallback(async () => {
    setScannerOpen(true);
    setScannerLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const html5Qrcode = new Html5Qrcode("camera-scanner-container");
      scannerRef.current = html5Qrcode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.333,
      };

      await html5Qrcode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        () => {},
      );
    } catch (err) {
      console.error("Camera start failed:", err);
      toast.error(
        "Camera access denied or not available. Please use a USB barcode scanner.",
      );
      setScannerOpen(false);
    } finally {
      setScannerLoading(false);
    }
  }, [onScanSuccess]);

  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, [stopCameraScanner]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (state.activeModal !== "none" || state.isPaymentScreen) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        if (scannerOpen) {
          stopCameraScanner();
        } else {
          setMenuOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    state.activeModal,
    state.isPaymentScreen,
    scannerOpen,
    stopCameraScanner,
  ]);

  const handleCashInOut = useCallback(() => {
    dispatch({ type: "OPEN_MODAL", payload: { modal: "cashInOut" } });
    setMenuOpen(false);
  }, [dispatch]);

  const handleCloseRegister = useCallback(() => {
    if (state.parkedOrders.length > 0) {
      toast.error(
        "You have parked orders. Complete or cancel them before closing the register.",
      );
      setMenuOpen(false);
      return;
    }
    dispatch({ type: "OPEN_MODAL", payload: { modal: "closeRegister" } });
    setMenuOpen(false);
  }, [dispatch, state.parkedOrders.length]);

  const handleReload = useCallback(() => {
    router.refresh();
    setMenuOpen(false);
  }, [router]);

  const handleBackend = useCallback(() => {
    router.push("/dashboard");
    setMenuOpen(false);
  }, [router]);

  const visibleParkedOrders = state.parkedOrders.slice(0, 3);
  const hiddenParkedCount =
    state.parkedOrders.length - visibleParkedOrders.length;

  return (
    <>
      {/* Camera Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-sm sm:max-w-md rounded-2xl bg-card p-3 sm:p-4 shadow-soft-lg">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-primary-foreground">
                <Camera size={18} className="text-success/80" />
                Camera Barcode Scanner
              </h3>
              <button
                onClick={stopCameraScanner}
                aria-label="Close camera scanner"
                className="flex h-10 sm:h-11 w-10 sm:w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-primary-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <div
              className="relative overflow-hidden rounded-xl bg-black"
              style={{ minHeight: 240 }}
            >
              <div id="camera-scanner-container" className="w-full" />

              {scannerLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <Spinner
                      size={24}
                      className="animate-spin text-success/80"
                    />
                    <p className="text-xs text-muted-foreground">
                      Starting camera...
                    </p>
                  </div>
                </div>
              )}

              {!scannerLoading && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-32 sm:h-40 w-48 sm:w-60 rounded-lg border-2 border-success/70/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]" />
                </div>
              )}
            </div>

            {lastScannedCode && (
              <div className="mt-3 rounded-lg bg-success/90/20 px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wider text-success/80">
                  Last Scanned
                </p>
                <p className="text-sm font-mono font-bold text-primary-foreground">
                  {lastScannedCode}
                </p>
              </div>
            )}

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Point camera at barcode. Keep scanning — it won&apos;t close.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex h-14 sm:h-16 shrink-0 items-center gap-2 sm:gap-3 border-b border-border bg-card px-2 sm:px-4 shadow-soft dark:border-border dark:bg-card">
        {/* Left section */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-success text-primary-foreground shadow-soft">
            <Receipt size={18} weight="fill" className="sm:hidden" />
            <Receipt size={20} weight="fill" className="hidden sm:block" />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
              Sale
            </span>
            <span className="text-xs sm:text-sm font-bold text-foreground dark:text-foreground">
              #{state.currentSaleNumber}
            </span>
          </div>
        </div>

        <div className="mx-0.5 sm:mx-1 h-6 sm:h-8 w-px bg-muted dark:bg-muted shrink-0" />

        <button
          onClick={handleNewSale}
          className="group flex h-8 sm:h-9 items-center gap-1 sm:gap-1.5 rounded-lg border border-border bg-card px-2 sm:px-3 text-xs sm:text-sm font-medium text-foreground/80 shadow-soft transition-all hover:border-teal-300 hover:bg-success/10 hover:text-success active:scale-95 dark:border-border dark:bg-muted dark:text-muted-foreground/60 dark:hover:border-success dark:hover:bg-success/90/20 dark:hover:text-success/70 shrink-0"
          title="New Sale (creates new order)"
          aria-label="New Sale"
        >
          <Plus
            size={14}
            weight="bold"
            className="transition group-hover:scale-110 sm:hidden"
          />
          <Plus
            size={16}
            weight="bold"
            className="transition group-hover:scale-110 hidden sm:block"
          />
          <span className="hidden sm:inline">New</span>
        </button>

        {/* Parked orders - scrollable on small screens */}
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto max-w-20 sm:max-w-30 md:max-w-50 no-scrollbar">
          {visibleParkedOrders.map((order) => (
            <button
              key={order.id}
              onClick={() =>
                dispatch({ type: "RESUME_ORDER", payload: order.id })
              }
              className="flex h-7 sm:h-8 items-center gap-1 rounded-md border border-border bg-muted/30 px-1.5 sm:px-2.5 text-[10px] sm:text-xs font-medium text-foreground/80 transition hover:border-success/70 hover:bg-success/10 hover:text-success dark:border-border dark:bg-muted dark:text-muted-foreground/60 dark:hover:border-success dark:hover:bg-success/90/20 shrink-0"
              title={`Resume order #${order.saleNumber}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              {order.saleNumber}
            </button>
          ))}
          {hiddenParkedCount > 0 && (
            <span className="flex h-7 sm:h-8 items-center rounded-md border border-border bg-muted/30 px-1.5 sm:px-2 text-[10px] sm:text-xs font-medium text-muted-foreground dark:border-border dark:bg-muted shrink-0">
              +{hiddenParkedCount}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Right section */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Search - hidden on very small screens, expandable on larger */}
          <div className="relative hidden sm:block">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              ref={searchRef}
              type="text"
              value={state.searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search products... (Ctrl+K)"
              className="h-9 w-36 md:w-48 rounded-lg border border-border bg-muted/30 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground shadow-soft transition focus:border-success focus:bg-card focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-border dark:bg-muted dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:bg-muted"
            />
            {state.searchQuery && (
              <button
                onClick={() => handleSearch("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground/80 dark:hover:bg-muted"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Camera Scanner Button */}
          <button
            onClick={startCameraScanner}
            className="flex h-9 sm:h-11 w-9 sm:w-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-soft transition hover:border-teal-300 hover:bg-success/10 hover:text-success active:scale-95 dark:border-border dark:bg-muted dark:text-muted-foreground dark:hover:border-success dark:hover:bg-success/90/20 dark:hover:text-success/70 shrink-0"
            title="Scan Barcode with Camera"
            aria-label="Scan Barcode with Camera"
          >
            <Barcode size={16} className="sm:hidden" />
            <Barcode size={18} className="hidden sm:block" />
          </button>

          {/* User Badge */}
          <div className="flex h-8 sm:h-9 items-center gap-1.5 sm:gap-2 rounded-lg bg-primary px-2 sm:px-3 text-primary-foreground shadow-soft shrink-0">
            <div className="flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-primary/70 text-[9px] sm:text-[10px] font-bold">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="hidden text-xs font-semibold md:inline">
              {userName}
            </span>
          </div>

          {/* Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="relative flex h-9 sm:h-11 w-9 sm:w-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-soft transition hover:border-border hover:bg-muted/30 active:scale-95 dark:border-border dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted shrink-0"
              title="Menu"
              aria-label="Open menu"
            >
              <List size={16} className="sm:hidden" />
              <List size={18} className="hidden sm:block" />
              {!isOnline && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 sm:right-1.5 sm:top-1.5 sm:h-2 sm:w-2 animate-pulse rounded-full bg-destructive" />
              )}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-52 sm:w-56 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border bg-card shadow-soft-lg dark:border-border dark:bg-muted">
                <div className="flex items-center gap-2 border-b border-border px-3 sm:px-4 py-2.5 sm:py-3 dark:border-border">
                  <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-primary/15 text-primary dark:bg-primary/90/30 dark:text-primary/70">
                    <span className="text-xs font-bold">
                      {userName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-foreground dark:text-foreground truncate">
                      {userName}
                    </span>
                    <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                      {userRole}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs text-muted-foreground dark:text-muted-foreground">
                  {isOnline ? (
                    <span className="flex items-center gap-1.5 text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />{" "}
                      Online
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-destructive">
                      <WifiSlash size={14} /> Offline
                    </span>
                  )}
                </div>

                <div className="my-1 border-t border-border dark:border-border" />

                <button
                  onClick={() => {
                    setTheme(theme === "dark" ? "light" : "dark");
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 text-left text-xs sm:text-sm text-foreground/80 transition hover:bg-muted/30 dark:text-muted-foreground/50 dark:hover:bg-muted"
                >
                  {theme === "dark" ? (
                    <Sun size={16} className="sm:hidden" />
                  ) : (
                    <Moon size={16} className="sm:hidden" />
                  )}
                  {theme === "dark" ? (
                    <Sun size={18} className="hidden sm:block" />
                  ) : (
                    <Moon size={18} className="hidden sm:block" />
                  )}
                  <span>
                    Switch to {theme === "dark" ? "Light" : "Dark"} Mode
                  </span>
                </button>

                <button
                  onClick={handleCashInOut}
                  className="flex w-full items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 text-left text-xs sm:text-sm text-foreground/80 transition hover:bg-muted/30 dark:text-muted-foreground/50 dark:hover:bg-muted"
                >
                  <CashRegister size={16} className="sm:hidden" />
                  <CashRegister size={18} className="hidden sm:block" />
                  <span>Cash In/Out</span>
                </button>
                <button
                  onClick={handleReload}
                  className="flex w-full items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 text-left text-xs sm:text-sm text-foreground/80 transition hover:bg-muted/30 dark:text-muted-foreground/50 dark:hover:bg-muted"
                >
                  <ArrowClockwise size={16} className="sm:hidden" />
                  <ArrowClockwise size={18} className="hidden sm:block" />
                  <span>Reload Data</span>
                </button>
                <button
                  onClick={handleBackend}
                  className="flex w-full items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 text-left text-xs sm:text-sm text-foreground/80 transition hover:bg-muted/30 dark:text-muted-foreground/50 dark:hover:bg-muted"
                >
                  <Desktop size={16} className="sm:hidden" />
                  <Desktop size={18} className="hidden sm:block" />
                  <span>Backend</span>
                </button>

                <div className="my-1 border-t border-border dark:border-border" />

                <button
                  onClick={handleCloseRegister}
                  className="flex w-full items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 text-left text-xs sm:text-sm font-medium text-destructive transition hover:bg-destructive/10 dark:text-destructive/70 dark:hover:bg-destructive/90/20"
                >
                  <DoorOpen size={16} className="sm:hidden" />
                  <DoorOpen size={18} className="hidden sm:block" />
                  <span>Close Register</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
