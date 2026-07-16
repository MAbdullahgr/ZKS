"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { usePos } from "@/lib/pos-store";
import {
  User,
  Note,
  X,
  MagnifyingGlass,
  Trash,
  ArrowCounterClockwise,
  Receipt,
  DotsThree,
  FileText,
  ChatText,
  Check,
  ArrowUp,
  ArrowDown,
  Keyboard,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export default function ActionBar() {
  const { state, dispatch } = usePos();
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1 sm:gap-1.5 border-t border-border bg-card p-1.5 sm:p-2 dark:border-border dark:bg-card">
        <button
          onClick={() =>
            dispatch({ type: "OPEN_MODAL", payload: { modal: "customer" } })
          }
          className="flex flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-lg border border-border py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold text-foreground/80 hover:bg-muted/30 dark:border-border dark:text-muted-foreground/60 dark:hover:bg-muted"
        >
          <User size={12} weight="bold" className="sm:hidden" />
          <User size={14} weight="bold" className="hidden sm:block" />
          {state.customer ? (
            <span className="truncate max-w-16 sm:max-w-20">
              {state.customer.name}
            </span>
          ) : (
            "Customer"
          )}
        </button>

        <button
          onClick={() =>
            dispatch({ type: "OPEN_MODAL", payload: { modal: "note" } })
          }
          className="flex flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-lg border border-border py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold text-foreground/80 hover:bg-muted/30 dark:border-border dark:text-muted-foreground/60 dark:hover:bg-muted"
        >
          <Note size={12} weight="bold" className="sm:hidden" />
          <Note size={14} weight="bold" className="hidden sm:block" />
          Note
        </button>

        <button
          onClick={() => {
            dispatch({ type: "OPEN_MODAL", payload: { modal: "actions" } });
            setActionsOpen(true);
          }}
          className="flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg border border-border px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold text-foreground/80 hover:bg-muted/30 dark:border-border dark:text-muted-foreground/60 dark:hover:bg-muted"
        >
          <DotsThree size={14} weight="bold" className="sm:hidden" />
          <DotsThree size={16} weight="bold" className="hidden sm:block" />
          Actions
        </button>
      </div>

      {/* Modals */}
      {state.activeModal === "customer" && <CustomerModal />}
      {state.activeModal === "note" && <NoteModal />}
      {state.activeModal === "customerNote" && <CustomerNoteModal />}
      {state.activeModal === "actions" && actionsOpen && (
        <ActionsModal
          onClose={() => {
            setActionsOpen(false);
            dispatch({ type: "CLOSE_MODAL" });
          }}
          hasSelectedItem={!!state.selectedItemId}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// ACTIONS MODAL
// ═══════════════════════════════════════════════════════════

function ActionsModal({
  onClose,
  hasSelectedItem,
}: {
  onClose: () => void;
  hasSelectedItem: boolean;
}) {
  const { dispatch } = usePos();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const actions = useMemo(
    () => [
      {
        icon: <FileText size={20} weight="duotone" className="sm:hidden" />,
        iconLg: (
          <FileText size={24} weight="duotone" className="hidden sm:block" />
        ),
        label: "General Note",
        shortcut: "N",
        onClick: () => {
          dispatch({ type: "OPEN_MODAL", payload: { modal: "note" } });
        },
      },
      {
        icon: <Receipt size={20} weight="duotone" className="sm:hidden" />,
        iconLg: (
          <Receipt size={24} weight="duotone" className="hidden sm:block" />
        ),
        label: "Quotation",
        shortcut: "Q",
        onClick: () => {
          dispatch({ type: "HOLD_ORDER" });
          toast.success("Order parked as quotation.");
          onClose();
        },
      },
      {
        icon: <ChatText size={20} weight="duotone" className="sm:hidden" />,
        iconLg: (
          <ChatText size={24} weight="duotone" className="hidden sm:block" />
        ),
        label: "Customer Note",
        shortcut: "C",
        onClick: () => {
          if (!hasSelectedItem) {
            toast.error("Please select a product in the cart first.");
            onClose();
            return;
          }
          dispatch({ type: "OPEN_MODAL", payload: { modal: "customerNote" } });
        },
      },
      {
        icon: (
          <ArrowCounterClockwise
            size={20}
            weight="duotone"
            className="sm:hidden"
          />
        ),
        iconLg: (
          <ArrowCounterClockwise
            size={24}
            weight="duotone"
            className="hidden sm:block"
          />
        ),
        label: "Return",
        shortcut: "R",
        onClick: () => {
          dispatch({ type: "OPEN_MODAL", payload: { modal: "return" } });
        },
      },
      {
        icon: <Trash size={20} weight="duotone" className="sm:hidden" />,
        iconLg: (
          <Trash size={24} weight="duotone" className="hidden sm:block" />
        ),
        label: "Cancel Order",
        shortcut: "Del",
        danger: true,
        onClick: () => {
          dispatch({ type: "CANCEL_ORDER" });
          toast.success("Order cancelled.");
          onClose();
        },
      },
    ],
    [dispatch, hasSelectedItem, onClose],
  );

  const cols = 3;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;

      const key = e.key.toLowerCase();
      const shortcutAction = actions.find(
        (a) => a.shortcut.toLowerCase() === key,
      );
      if (shortcutAction) {
        e.preventDefault();
        shortcutAction.onClick();
        return;
      }

      if (e.key === "Delete") {
        e.preventDefault();
        const delAction = actions.find((a) => a.shortcut === "Del");
        if (delAction) delAction.onClick();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        actions[selectedIndex]?.onClick();
        return;
      }

      let nextIndex = selectedIndex;

      if (e.key === "ArrowRight") {
        nextIndex =
          selectedIndex % cols < cols - 1 ? selectedIndex + 1 : selectedIndex;
      } else if (e.key === "ArrowLeft") {
        nextIndex =
          selectedIndex % cols > 0 ? selectedIndex - 1 : selectedIndex;
      } else if (e.key === "ArrowDown") {
        nextIndex =
          selectedIndex + cols < actions.length
            ? selectedIndex + cols
            : selectedIndex;
      } else if (e.key === "ArrowUp") {
        nextIndex =
          selectedIndex - cols >= 0 ? selectedIndex - cols : selectedIndex;
      }

      if (nextIndex !== selectedIndex) {
        e.preventDefault();
        setSelectedIndex(nextIndex);
        itemRefs.current[nextIndex]?.focus();
      }
    },
    [actions, selectedIndex, cols],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    itemRefs.current[0]?.focus();
  }, []);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          itemRefs.current[0]?.focus();
        }}
        className="gap-0 overflow-hidden rounded-2xl bg-card p-0 max-w-sm sm:max-w-lg dark:bg-card mx-4"
      >
        <div className="flex items-center justify-between border-b border-border px-4 sm:px-6 py-3 sm:py-4 dark:border-border">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base sm:text-lg font-bold text-foreground dark:text-foreground">
              Actions
            </DialogTitle>
            <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[9px] sm:text-[10px] font-medium text-muted-foreground dark:bg-muted dark:text-muted-foreground">
              <Keyboard size={10} /> Press letter or Enter
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close actions menu"
            className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground/80 dark:hover:bg-muted dark:hover:text-muted-foreground/60"
          >
            <X size={16} className="sm:hidden" />
            <X size={18} className="hidden sm:block" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 p-4 sm:p-6">
          {actions.map((action, index) => (
            <button
              key={action.label}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              onClick={action.onClick}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`flex flex-col items-center justify-center gap-1.5 sm:gap-2 rounded-xl border-2 p-3 sm:p-5 text-center transition-all outline-none focus:ring-2 focus:ring-ring/70 ${
                selectedIndex === index
                  ? action.danger
                    ? "border-destructive/30 bg-destructive/10 ring-2 ring-red-200 dark:border-red-700 dark:bg-destructive/90/20 dark:ring-red-800"
                    : "border-border bg-muted ring-2 ring-border dark:border-border dark:bg-muted dark:ring-ring"
                  : action.danger
                    ? "border-destructive/20 bg-destructive/10 text-destructive hover:border-destructive/20 hover:bg-destructive/15 dark:border-destructive/80/20 dark:bg-destructive/90/10 dark:text-destructive/70 dark:hover:bg-destructive/90/20"
                    : "border-border bg-muted/30 text-foreground/80 hover:border-border hover:bg-muted dark:border-border dark:bg-muted dark:text-muted-foreground/60 dark:hover:border-border dark:hover:bg-muted"
              }`}
            >
              {action.icon}
              {action.iconLg}
              <span className="text-[10px] sm:text-xs font-semibold">
                {action.label}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold text-muted-foreground dark:bg-muted dark:text-muted-foreground">
                {action.shortcut}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// CUSTOMER NOTE MODAL
// ═══════════════════════════════════════════════════════════

function CustomerNoteModal() {
  const { state, dispatch } = usePos();
  const selectedItem = state.cart.find((i) => i.id === state.selectedItemId);
  const [text, setText] = useState(() => selectedItem?.note || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!selectedItem) {
      dispatch({ type: "CLOSE_MODAL" });
    }
  }, [selectedItem, dispatch]);

  const handleSave = useCallback(() => {
    if (state.selectedItemId) {
      dispatch({
        type: "UPDATE_CART_ITEM_NOTE",
        payload: { id: state.selectedItemId, note: text },
      });
    }
    dispatch({ type: "CLOSE_MODAL" });
  }, [dispatch, state.selectedItemId, text]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dispatch({ type: "CLOSE_MODAL" });
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
    },
    [dispatch, handleSave],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  if (!selectedItem) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm sm:max-w-md overflow-hidden rounded-2xl bg-card shadow-soft-lg dark:bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 sm:px-6 py-3 sm:py-4 dark:border-border">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-foreground dark:text-foreground">
              Customer Note
            </h3>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground">
              For: {selectedItem.name}
              {selectedItem.variantName ? ` (${selectedItem.variantName})` : ""}
            </p>
          </div>
          <button
            onClick={() => dispatch({ type: "CLOSE_MODAL" })}
            aria-label="Close customer note dialog"
            className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground/80 dark:hover:bg-muted dark:hover:text-muted-foreground/60"
          >
            <X size={16} className="sm:hidden" />
            <X size={18} className="hidden sm:block" />
          </button>
        </div>
        <div className="p-4 sm:p-6">
          <textarea
            ref={textareaRef}
            autoFocus
            rows={3}
            maxLength={120}
            placeholder="Add a note for this item..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-xl border border-border p-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring dark:border-border dark:bg-muted dark:text-foreground"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {text.length}/120
          </p>
          <div className="mt-3 sm:mt-4 flex justify-end gap-2">
            <button
              onClick={() => dispatch({ type: "CLOSE_MODAL" })}
              className="rounded-xl border border-border px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-muted-foreground transition hover:bg-muted/30 dark:border-border dark:text-muted-foreground dark:hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-xl bg-card px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-primary-foreground transition hover:bg-muted dark:bg-card dark:text-foreground dark:hover:bg-muted"
            >
              Add Note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CUSTOMER MODAL
// ═══════════════════════════════════════════════════════════

function CustomerModal() {
  const { state, dispatch, customers, customersLoading } = usePos();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () =>
      customers.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.phone.includes(search),
      ),
    [search, customers],
  );

  const visibleCustomers = useMemo(() => filtered.slice(0, 50), [filtered]);

  const handleSelect = useCallback(
    (customer: (typeof customers)[0] | null) => {
      dispatch({ type: "SET_CUSTOMER", payload: customer });
      dispatch({ type: "CLOSE_MODAL" });
    },
    [dispatch],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dispatch({ type: "CLOSE_MODAL" });
        return;
      }

      if (document.activeElement === searchInputRef.current) {
        if (e.key === "Enter" && visibleCustomers.length > 0) {
          e.preventDefault();
          handleSelect(visibleCustomers[selectedIndex]);
        }
        if (e.key === "ArrowDown" && visibleCustomers.length > 0) {
          e.preventDefault();
          const next =
            selectedIndex < visibleCustomers.length - 1 ? selectedIndex + 1 : 0;
          setSelectedIndex(next);
          itemRefs.current[next]?.focus();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next =
          selectedIndex < visibleCustomers.length - 1 ? selectedIndex + 1 : 0;
        setSelectedIndex(next);
        itemRefs.current[next]?.focus();
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev =
          selectedIndex > 0 ? selectedIndex - 1 : visibleCustomers.length - 1;
        setSelectedIndex(prev);
        itemRefs.current[prev]?.focus();
        return;
      }

      if (e.key === "Enter" && visibleCustomers.length > 0) {
        e.preventDefault();
        handleSelect(visibleCustomers[selectedIndex]);
        return;
      }

      if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        searchInputRef.current?.focus();
      }
    },
    [dispatch, visibleCustomers, selectedIndex, handleSelect],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setSelectedIndex(0);
    },
    [],
  );

  const hasSelectedCustomer = state.customer !== null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex h-[80vh] sm:h-[75vh] w-full max-w-sm sm:max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-soft-lg dark:bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 sm:px-6 py-3 sm:py-4 dark:border-border">
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-foreground dark:text-foreground">
              Select Customer
            </h3>
            <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[9px] sm:text-[10px] font-medium text-muted-foreground dark:bg-muted dark:text-muted-foreground">
              <Keyboard size={10} /> ↑↓ Enter Esc
            </span>
          </div>
          <button
            onClick={() => dispatch({ type: "CLOSE_MODAL" })}
            aria-label="Close customer selector"
            className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground/80 dark:hover:bg-muted dark:hover:text-muted-foreground/60"
          >
            <X size={16} className="sm:hidden" />
            <X size={18} className="hidden sm:block" />
          </button>
        </div>

        <div className="px-4 sm:px-6 pt-3 sm:pt-4">
          <div className="relative">
            <MagnifyingGlass
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={handleSearchChange}
              className="w-full rounded-xl border border-border py-2.5 sm:py-3 pl-10 sm:pl-11 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring dark:border-border dark:bg-muted dark:text-foreground"
            />
          </div>
          <p className="mt-2 text-[11px] sm:text-xs text-muted-foreground">
            {customersLoading
              ? "Loading customers..."
              : `${filtered.length} customer${filtered.length !== 1 ? "s" : ""} found${filtered.length > 50 ? " (showing first 50)" : ""}`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 sm:py-3">
          {customersLoading ? (
            <div className="grid grid-cols-1 gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 sm:gap-4 rounded-xl border border-border p-3 sm:p-4 dark:border-border"
                >
                  <div className="h-10 w-10 sm:h-12 sm:w-12 animate-pulse rounded-full bg-muted dark:bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 sm:h-4 w-1/3 animate-pulse rounded bg-muted dark:bg-muted" />
                    <div className="h-2.5 sm:h-3 w-1/4 animate-pulse rounded bg-muted dark:bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <button
                onClick={() => handleSelect(null)}
                className={`mb-2 sm:mb-3 flex w-full items-center justify-between rounded-xl border-2 p-3 sm:p-4 text-left transition-all ${
                  !hasSelectedCustomer
                    ? "border-success/40 bg-success/10 ring-2 ring-emerald-200 dark:border-emerald-600 dark:bg-success/90/20 dark:ring-emerald-800"
                    : "border-dashed border-border hover:border-border dark:border-border dark:hover:border-border"
                }`}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-muted text-base sm:text-lg font-bold text-muted-foreground dark:bg-muted">
                    <User size={16} className="sm:hidden" />
                    <User size={20} className="hidden sm:block" />
                  </div>
                  <div>
                    <p className="text-sm sm:text-base font-semibold text-foreground dark:text-foreground">
                      Walk-in Customer
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground dark:text-muted-foreground">
                      No customer account
                    </p>
                  </div>
                </div>
                {!hasSelectedCustomer && (
                  <div className="flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-success/100 text-primary-foreground">
                    <Check size={14} weight="bold" className="sm:hidden" />
                    <Check
                      size={16}
                      weight="bold"
                      className="hidden sm:block"
                    />
                  </div>
                )}
              </button>

              {visibleCustomers.length === 0 ? (
                <div className="flex h-32 sm:h-40 items-center justify-center">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    No customers found
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
                  {visibleCustomers.map((customer, index) => {
                    const isSelected = selectedIndex === index;
                    const isActive = state.customer?.id === customer.id;
                    return (
                      <button
                        key={customer.id}
                        ref={(el) => {
                          itemRefs.current[index] = el;
                        }}
                        onClick={() => handleSelect(customer)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`flex items-center justify-between rounded-xl border-2 p-3 sm:p-4 text-left transition-all outline-none focus:ring-2 focus:ring-ring/70 ${
                          isSelected
                            ? "border-foreground/30 bg-muted/30 ring-2 ring-border dark:border-white dark:bg-muted dark:ring-ring"
                            : isActive
                              ? "border-success/25 bg-success/10 dark:border-emerald-800 dark:bg-success/90/20"
                              : "border-border hover:border-border dark:border-border dark:hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                          <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-muted text-base sm:text-lg font-bold text-muted-foreground dark:bg-muted dark:text-muted-foreground shrink-0">
                            {customer.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm sm:text-base font-semibold text-foreground dark:text-foreground truncate">
                              {customer.name}
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground dark:text-muted-foreground">
                              {customer.phone}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground">
                              Balance
                            </p>
                            <p
                              className={`text-sm sm:text-base font-bold ${customer.balance > 0 ? "text-warning" : "text-foreground/80 dark:text-muted-foreground/60"}`}
                            >
                              {customer.balance.toLocaleString("en-PK")}{" "}
                              <span className="text-[10px] sm:text-xs font-normal">
                                Rs.
                              </span>
                            </p>
                          </div>
                          <div className="text-right hidden md:block">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Limit
                            </p>
                            <p className="text-sm sm:text-base font-bold text-foreground/80 dark:text-muted-foreground/60">
                              {customer.creditLimit.toLocaleString("en-PK")}{" "}
                              <span className="text-xs font-normal">Rs.</span>
                            </p>
                          </div>
                          {isActive && (
                            <div className="flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-success/100 text-primary-foreground shrink-0">
                              <Check
                                size={14}
                                weight="bold"
                                className="sm:hidden"
                              />
                              <Check
                                size={16}
                                weight="bold"
                                className="hidden sm:block"
                              />
                            </div>
                          )}
                          {isSelected && !isActive && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                              <ArrowUp size={12} />
                              <ArrowDown size={12} />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 sm:px-6 py-3 sm:py-4 dark:border-border">
          <div className="flex items-center gap-2 sm:gap-3">
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Press{" "}
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px] sm:text-[10px]">
                Enter
              </kbd>{" "}
              to select
            </p>
            {hasSelectedCustomer && (
              <button
                onClick={() => handleSelect(null)}
                className="flex items-center gap-1 rounded-md border border-destructive/20 bg-destructive/10 px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs font-medium text-destructive transition hover:bg-destructive/15 dark:border-destructive/80/30 dark:bg-destructive/90/10 dark:text-destructive/70"
              >
                <Trash size={10} className="sm:hidden" />
                <Trash size={12} className="hidden sm:block" /> Clear Customer
              </button>
            )}
          </div>
          <button
            onClick={() => dispatch({ type: "CLOSE_MODAL" })}
            className="rounded-lg border border-border px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-foreground/80 hover:bg-muted/30 dark:border-border dark:text-muted-foreground/60 dark:hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// NOTE MODAL
// ═══════════════════════════════════════════════════════════

function NoteModal() {
  const { state, dispatch } = usePos();
  const [text, setText] = useState(() => state.internalNote);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = useCallback(() => {
    dispatch({ type: "SET_NOTE", payload: text });
    dispatch({ type: "CLOSE_MODAL" });
  }, [dispatch, text]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dispatch({ type: "CLOSE_MODAL" });
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSave();
      }
    },
    [dispatch, handleSave],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm sm:max-w-md overflow-hidden rounded-2xl bg-card shadow-soft-lg dark:bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 sm:px-6 py-3 sm:py-4 dark:border-border">
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-foreground dark:text-foreground">
              Internal Note
            </h3>
            <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[9px] sm:text-[10px] font-medium text-muted-foreground dark:bg-muted dark:text-muted-foreground">
              <Keyboard size={10} /> Ctrl+Enter to save
            </span>
          </div>
          <button
            onClick={() => dispatch({ type: "CLOSE_MODAL" })}
            aria-label="Close note dialog"
            className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground/80 dark:hover:bg-muted dark:hover:text-muted-foreground/60"
          >
            <X size={16} className="sm:hidden" />
            <X size={18} className="hidden sm:block" />
          </button>
        </div>
        <div className="p-4 sm:p-6">
          <textarea
            ref={textareaRef}
            rows={3}
            maxLength={120}
            placeholder="Add a note for this order..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-xl border border-border p-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring dark:border-border dark:bg-muted dark:text-foreground"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {text.length}/120
          </p>
          <div className="mt-3 sm:mt-4 flex justify-end gap-2">
            <button
              onClick={() => dispatch({ type: "CLOSE_MODAL" })}
              className="rounded-xl border border-border px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-muted-foreground transition hover:bg-muted/30 dark:border-border dark:text-muted-foreground dark:hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-xl bg-card px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-primary-foreground transition hover:bg-muted dark:bg-card dark:text-foreground dark:hover:bg-muted"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
