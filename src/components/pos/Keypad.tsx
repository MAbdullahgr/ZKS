"use client";

import { usePos, type PosAction } from "@/lib/pos-store";
import { Backspace, Eraser } from "@phosphor-icons/react";

export default function Keypad() {
  const { state, dispatch } = usePos();

  return (
    <div className="shrink-0 border-t border-border bg-card dark:border-border dark:bg-card">
      <div className="grid grid-cols-4 gap-px bg-muted dark:bg-muted">
        <DigitButton digit="1" dispatch={dispatch} />
        <DigitButton digit="2" dispatch={dispatch} />
        <DigitButton digit="3" dispatch={dispatch} />
        <ModeButton
          active={state.keypadMode === "qty"}
          onClick={() => dispatch({ type: "SET_KEYPAD_MODE", payload: "qty" })}
          label="Qty"
        />

        <DigitButton digit="4" dispatch={dispatch} />
        <DigitButton digit="5" dispatch={dispatch} />
        <DigitButton digit="6" dispatch={dispatch} />
        <ModeButton
          active={state.keypadMode === "price"}
          onClick={() =>
            dispatch({ type: "SET_KEYPAD_MODE", payload: "price" })
          }
          label="Price"
        />

        <DigitButton digit="7" dispatch={dispatch} />
        <DigitButton digit="8" dispatch={dispatch} />
        <DigitButton digit="9" dispatch={dispatch} />
        <button
          onClick={() => {
            if (state.keypadMode === "qty") {
              dispatch({
                type: "UPDATE_CART_ITEM_QTY",
                payload: { id: state.selectedItemId!, quantity: 0 },
              });
              dispatch({ type: "SET_KEYPAD_VALUE", payload: "0" });
            } else {
              dispatch({
                type: "UPDATE_CART_ITEM_PRICE",
                payload: { id: state.selectedItemId!, price: 0 },
              });
              dispatch({ type: "SET_KEYPAD_VALUE", payload: "0" });
            }
          }}
          className="flex h-12 sm:h-14 items-center justify-center bg-muted text-muted-foreground transition hover:bg-muted dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted"
          title="Clear quantity"
          aria-label="Clear quantity"
        >
          <Eraser size={14} className="sm:hidden" />
          <Eraser size={16} className="hidden sm:block" />
        </button>

        <button
          onClick={() =>
            dispatch({ type: "SET_KEYPAD_MODE", payload: state.keypadMode })
          }
          className="flex h-12 sm:h-14 items-center justify-center bg-muted/30 text-sm sm:text-base font-bold text-muted-foreground hover:bg-muted dark:bg-muted dark:text-muted-foreground"
        >
          C
        </button>
        <DigitButton digit="0" dispatch={dispatch} />
        <DigitButton digit="." dispatch={dispatch} />
        <button
          onClick={() => {
            if (state.selectedItemId) {
              dispatch({
                type: "REMOVE_CART_ITEM",
                payload: state.selectedItemId,
              });
            }
          }}
          className="flex h-12 sm:h-14 items-center justify-center bg-destructive/10 text-destructive transition hover:bg-destructive/15 dark:bg-destructive/90/20 dark:text-destructive/70"
          aria-label="Remove selected cart item"
        >
          <Backspace size={16} className="sm:hidden" />
          <Backspace size={18} className="hidden sm:block" />
        </button>
      </div>
    </div>
  );
}

function DigitButton({
  digit,
  dispatch,
}: {
  digit: string;
  dispatch: React.Dispatch<PosAction>;
}) {
  return (
    <button
      onClick={() => dispatch({ type: "APPLY_KEYPAD_DIGIT", payload: digit })}
      className="flex h-12 sm:h-14 items-center justify-center bg-card text-base sm:text-lg font-bold text-foreground/80 transition active:bg-muted dark:bg-card dark:text-muted-foreground/50 dark:active:bg-muted"
    >
      {digit}
    </button>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-12 sm:h-14 items-center justify-center text-[10px] sm:text-xs font-bold transition ${
        active
          ? "bg-success/10 text-success ring-1 ring-inset ring-teal-300 dark:bg-success/90/30 dark:text-success/70 dark:ring-teal-700"
          : "bg-muted text-foreground/80 hover:bg-muted dark:bg-muted dark:text-muted-foreground/60 dark:hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}
