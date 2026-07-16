"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Package, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/fetcher";

export interface Product {
  id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  costPrice: number;
  sellingPrice: number;
  unit: string;
  barcode?: string | null;
}

interface ProductSearchInputProps {
  onSelect: (product: Product) => void;
  selectedProduct?: {
    id: string;
    name: string;
    sku?: string;
    unit?: string;
  } | null;
  onClear?: () => void;
  placeholder?: string;
}

export default function ProductSearchInput({
  onSelect,
  selectedProduct,
  onClear,
  placeholder = "Search product by name, SKU, barcode...",
}: ProductSearchInputProps) {
  const [query, setQuery] = useState(selectedProduct?.name || "");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  // FIX: React 19 pattern for syncing state without useEffect
  const [prevSelected, setPrevSelected] = useState(selectedProduct);
  if (selectedProduct !== prevSelected) {
    setPrevSelected(selectedProduct);
    setQuery(selectedProduct ? selectedProduct.name : "");
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || (selectedProduct && query === selectedProduct.name))
      return;

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiGet<{ products: Product[] }>(
          `/api/products?search=${encodeURIComponent(query)}&forPos=false`,
        );
        const arr = data?.products?.slice(0, 8) || [];
        setResults(arr);
        setOpen(arr.length > 0);
        setHighlighted(0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, selectedProduct]);

  // Click outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        // FIX: Reset query and results directly in the event handler
        setQuery(selectedProduct ? selectedProduct.name : "");
        setResults([]);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [selectedProduct]);

  const selectProduct = useCallback(
    (p: Product) => {
      onSelect(p);
      setQuery(p.name);
      setOpen(false);
      setResults([]); // FIX: Clear results immediately
    },
    [onSelect],
  );

  function clearSelection() {
    if (onClear) onClear();
    setQuery("");
    setOpen(false);
    setResults([]); // FIX: Clear results immediately
    inputRef.current?.focus();
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const p = results[highlighted];
        if (p) selectProduct(p);
      } else if (e.key === "Escape") {
        setOpen(false);
        setQuery(selectedProduct ? selectedProduct.name : "");
      }
    },
    [open, results, highlighted, selectProduct, selectedProduct],
  );

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {selectedProduct ? (
        <div className="flex items-center gap-2 bg-popover border border-border rounded-lg px-3 py-2 w-full">
          <Package className="w-4 h-4 text-accent-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-popover-foreground truncate">
              {selectedProduct.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedProduct.sku}{" "}
              {selectedProduct.unit ? `· Unit: ${selectedProduct.unit}` : ""}
            </p>
          </div>
          <button
            onClick={clearSelection}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition shrink-0"
            type="button"
            aria-label="Clear selected product"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 bg-popover"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (results.length > 0 && query.trim()) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          )}
        </div>
      )}

      {/* Dropdown Results */}
      {open && results.length > 0 && !selectedProduct && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden max-h-[min(18rem,calc(100vh-4rem))] overflow-y-auto">
          {results.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectProduct(p)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition ${
                idx === highlighted
                  ? "bg-accent border-l-2 border-accent-foreground"
                  : "hover:bg-muted border-l-2 border-transparent"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-popover-foreground truncate">
                  {p.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{p.sku}</span>
                  <span>·</span>
                  <span>Stock: {p.stockQuantity}</span>
                  <span>·</span>
                  <span>Cost: Rs. {Number(p.costPrice).toLocaleString()}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open &&
        !searching &&
        query.trim() &&
        results.length === 0 &&
        !selectedProduct && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-xl shadow-lg p-4 text-center">
            <Search className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-sm text-muted-foreground">No products found</p>
          </div>
        )}
    </div>
  );
}
