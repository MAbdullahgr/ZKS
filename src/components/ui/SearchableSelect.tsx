"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, ChevronDown } from "lucide-react";

interface Option {
  id: string;
  name: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search...",
  emptyMessage = "No items found",
}: SearchableSelectProps) {
  const selected = options.find((o) => o.id === value);
  const [query, setQuery] = useState(selected ? selected.name : "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // FIX: React 19 pattern for syncing state without useEffect
  const [prevSelected, setPrevSelected] = useState(selected);
  if (selected !== prevSelected) {
    setPrevSelected(selected);
    setQuery(selected ? selected.name : "");
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter options based on query
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    return options.filter((o) =>
      o.name.toLowerCase().includes(query.toLowerCase()),
    );
  }, [options, query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        // FIX: Reset query directly in handler instead of useEffect
        setQuery(selected ? selected.name : "");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [selected]);

  // Scroll active item into view
  useEffect(() => {
    if (open && listRef.current) {
      const activeElement = listRef.current.children[
        activeIndex
      ] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [activeIndex, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIndex]) {
        selectOption(filtered[activeIndex].id);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery(selected ? selected.name : "");
    }
  };

  function selectOption(id: string) {
    onChange(id);
    const opt = options.find((o) => o.id === id);
    if (opt) setQuery(opt.name);
    setOpen(false);
    inputRef.current?.blur();
  }

  function clearSelection(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setQuery("");
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          className="w-full pl-9 pr-8 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-400 bg-popover transition"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0); // FIX: Reset active index directly in handler
          }}
          onFocus={() => {
            setOpen(true);
            inputRef.current?.select();
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 ml-2">
          {selected && (
            <button
              type="button"
              onClick={clearSelection}
              className="flex h-9 w-9 items-center justify-center rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
              aria-label="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {open && (
        <div
          ref={listRef}
          className="absolute z-9999 mt-1 w-full bg-popover border border-border rounded-lg shadow-xl flex flex-col max-h-[min(12rem,calc(100vh-4rem))] overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            filtered.map((o, index) => (
              <button
                type="button"
                key={o.id}
                onClick={() => selectOption(o.id)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`w-full text-left px-3 py-2 text-sm transition outline-none ${
                  index === activeIndex
                    ? "bg-accent text-accent-foreground font-medium"
                    : o.id === value
                      ? "bg-muted text-popover-foreground font-medium"
                      : "text-foreground hover:bg-muted"
                }`}
              >
                {o.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
