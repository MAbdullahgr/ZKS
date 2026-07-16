"use client";

import { useMemo } from "react";
import { usePos } from "@/lib/pos-store";
import { Trash, Note } from "@phosphor-icons/react";

export default function CartPanel() {
  const { state, dispatch, products } = usePos();

  const productMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => map.set(p.id, p.stock));
    return map;
  }, [products]);

  return (
    <div className="flex h-full flex-col">
      {/* Return Mode Banner */}
      {state.returnMode && state.originalSale && (
        <div className="flex items-center justify-between bg-warning/10 px-3 sm:px-4 py-2 dark:bg-warning/90/20">
          <div className="flex items-center gap-2">
            <span className="text-[11px] sm:text-xs font-bold text-warning dark:text-warning/80">
              RETURN — {state.originalSale.saleNumber}
            </span>
          </div>
          <button
            onClick={() => dispatch({ type: "EXIT_RETURN_MODE" })}
            className="text-[10px] sm:text-[11px] font-medium text-warning hover:text-warning dark:text-warning/80"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto">
        {state.cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground/60 dark:text-foreground/80 px-4">
            <p className="text-xs font-medium">Scan or click a product</p>
          </div>
        ) : (
          <div className="divide-y divide-border dark:divide-border">
            {state.cart.map((item) => {
              const lineTotal =
                item.unitPrice * item.quantity * (item.isReturn ? -1 : 1);
              const isSelected = state.selectedItemId === item.id;
              const isZeroed = item.isZeroed;

              const dbStock = productMap.get(item.productId) ?? 0;
              const isOverStock = !item.isReturn && item.quantity > dbStock;

              return (
                <div
                  key={item.id}
                  onClick={() =>
                    dispatch({ type: "SELECT_CART_ITEM", payload: item.id })
                  }
                  className={`group relative flex cursor-pointer items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 transition-all ${
                    isSelected
                      ? "bg-muted dark:bg-muted"
                      : "hover:bg-muted/30 dark:hover:bg-muted/30"
                  } ${isZeroed ? "opacity-40" : ""}`}
                >
                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="absolute left-0 top-0 h-full w-0.5 bg-card dark:bg-card" />
                  )}

                  {/* Name + variant + note */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-xs sm:text-sm font-medium ${item.isReturn ? "text-warning dark:text-warning/80" : "text-foreground dark:text-muted-foreground/50"}`}
                    >
                      {item.name}
                    </p>
                    {item.variantName && (
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground dark:text-muted-foreground">
                        {item.variantName}
                      </p>
                    )}

                    {/* Item note */}
                    {item.note && (
                      <div className="mt-1 sm:mt-1.5 inline-flex items-center gap-1 sm:gap-1.5 rounded-md bg-warning/10 px-1.5 sm:px-2 py-0.5 sm:py-1 dark:bg-warning/90/20">
                        <Note
                          size={9}
                          weight="fill"
                          className="text-warning dark:text-warning/80 sm:hidden"
                        />
                        <Note
                          size={10}
                          weight="fill"
                          className="text-warning dark:text-warning/80 hidden sm:block"
                        />
                        <p className="text-[9px] sm:text-[10px] font-medium text-warning dark:text-warning/80 truncate max-w-30 sm:max-w-45">
                          {item.note}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Price: qty × unit price */}
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-xs sm:text-sm font-semibold ${item.isReturn ? "text-warning dark:text-warning/80" : "text-foreground dark:text-muted-foreground/50"}`}
                    >
                      {lineTotal.toLocaleString("en-PK")}
                    </p>
                    <p
                      className={`text-[9px] sm:text-[10px] ${isOverStock ? "font-bold text-destructive dark:text-destructive/70" : "text-muted-foreground dark:text-muted-foreground"}`}
                    >
                      {item.quantity} × {item.unitPrice.toLocaleString("en-PK")}
                      {isOverStock && ` (Max: ${dbStock})`}
                    </p>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "REMOVE_CART_ITEM", payload: item.id });
                    }}
                    className="mt-0.5 flex h-9 w-9 sm:h-9 sm:w-9 items-center justify-center rounded text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive dark:text-muted-foreground dark:hover:bg-destructive/90/20"
                    title="Remove item"
                    aria-label={`Remove ${item.name} from cart`}
                  >
                    <Trash size={12} weight="bold" className="sm:hidden" />
                    <Trash
                      size={14}
                      weight="bold"
                      className="hidden sm:block"
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
