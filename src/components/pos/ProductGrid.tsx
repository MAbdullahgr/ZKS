"use client";

import { usePos, type PosAction, type Product } from "@/lib/pos-store";
import {
  Image as ImageIcon,
  X,
  Package,
  Info,
  Plus,
  Minus,
  Barcode,
  Tag,
  Cube,
  Warning,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";

/* ────────────────────────────────────────────────
   RESPONSIVE GRID LAYOUT ENGINE
   ──────────────────────────────────────────────── */

interface GridLayout {
  cols: number;
  gap: number;
  padding: number;
  cardImageHeight: number; // NOT square — controlled aspect ratio
  nameLines: number;
  fontSize: "xs" | "sm" | "base";
  touchSize: number; // min touch target in px
}

/**
 * Calculate grid layout from container width.
 * Uses a controlled image aspect ratio instead of square to prevent
 * overly tall cards on mobile.
 */
const getGridLayout = (width: number): GridLayout => {
  // Mobile portrait (< 400px)
  if (width < 400) {
    return {
      cols: 2,
      gap: 10,
      padding: 16,
      cardImageHeight: 110, // 4:3-ish, not square
      nameLines: 2,
      fontSize: "xs",
      touchSize: 44, // WCAG 2.5.5 target size
    };
  }
  // Mobile landscape / small tablet (400–639px)
  if (width < 640) {
    return {
      cols: 2,
      gap: 12,
      padding: 20,
      cardImageHeight: 130,
      nameLines: 2,
      fontSize: "xs",
      touchSize: 44,
    };
  }
  // Tablet portrait (640–767px)
  if (width < 768) {
    return {
      cols: 3,
      gap: 14,
      padding: 24,
      cardImageHeight: 150,
      nameLines: 2,
      fontSize: "sm",
      touchSize: 44,
    };
  }
  // Tablet landscape / small desktop (768–1023px)
  if (width < 1024) {
    return {
      cols: 4,
      gap: 16,
      padding: 28,
      cardImageHeight: 160,
      nameLines: 2,
      fontSize: "sm",
      touchSize: 40,
    };
  }
  // Desktop (1024–1279px)
  if (width < 1280) {
    return {
      cols: 5,
      gap: 18,
      padding: 32,
      cardImageHeight: 170,
      nameLines: 2,
      fontSize: "sm",
      touchSize: 40,
    };
  }
  // Large desktop (1280px+)
  return {
    cols: 6,
    gap: 20,
    padding: 40,
    cardImageHeight: 180,
    nameLines: 2,
    fontSize: "base",
    touchSize: 40,
  };
};

/* ────────────────────────────────────────────────
   MAIN COMPONENT
   ──────────────────────────────────────────────── */

export default function ProductGrid() {
  const { state, dispatch, filteredProducts, categories, productsLoading } =
    usePos();

  const parentRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<GridLayout>({
    cols: 4,
    gap: 16,
    padding: 32,
    cardImageHeight: 160,
    nameLines: 2,
    fontSize: "sm",
    touchSize: 40,
  });

  // ResizeObserver with debounce for performance
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    let rafId: number;
    const update = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const width = el.clientWidth;
        setLayout(getGridLayout(width));
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Row height = image + name (2 lines) + price + gaps
  const estimateRowHeight = useCallback(() => {
    const nameH =
      layout.fontSize === "xs" ? 32 : layout.fontSize === "sm" ? 36 : 40;
    const priceH =
      layout.fontSize === "xs" ? 18 : layout.fontSize === "sm" ? 22 : 24;
    return layout.cardImageHeight + nameH + priceH + layout.gap * 2;
  }, [layout]);

  const rowCount = Math.ceil(filteredProducts.length / layout.cols);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: estimateRowHeight,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 5,
  });

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
    gap: `${layout.gap}px`,
  };

  return (
    <div className="flex h-full flex-col bg-card dark:bg-background">
      {/* ─── Category Pills with scroll affordance ─── */}
      <CategoryPills
        categories={categories}
        selectedCategory={state.selectedCategory || ""}
        dispatch={dispatch}
        loading={productsLoading}
        layout={layout}
      />

      {/* ─── Content area ─── */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{
          contain: "strict",
          padding: `${layout.padding / 2}px ${layout.padding}px`,
        }}
      >
        {productsLoading ? (
          <div style={gridStyle}>
            {Array.from({ length: layout.cols * 3 }).map((_, i) => (
              <ProductSkeleton key={i} layout={layout} />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <EmptyState layout={layout} />
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIndex = virtualRow.index * layout.cols;
              const rowProducts = filteredProducts.slice(
                startIndex,
                startIndex + layout.cols,
              );
              return (
                <div
                  key={virtualRow.key}
                  data-row-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    willChange: "transform",
                  }}
                >
                  <div
                    style={{
                      ...gridStyle,
                      paddingBottom: `${layout.gap}px`,
                    }}
                  >
                    {rowProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        dispatch={dispatch}
                        layout={layout}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}
      {state.activeModal === "variant" && state.modalProductId && (
        <VariantSelectorModal productId={state.modalProductId} />
      )}
      {state.activeModal === "productDetail" && state.modalProductId && (
        <ProductDetailModal productId={state.modalProductId} />
      )}
    </div>
  );
}

/* ─── Category Pills with scroll buttons ───────────────── */

function CategoryPills({
  categories,
  selectedCategory,
  dispatch,
  loading,
  layout,
}: {
  categories: { id: string; name: string }[];
  selectedCategory: string;
  dispatch: React.Dispatch<PosAction>;
  loading: boolean;
  layout: GridLayout;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, categories]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  };

  const pillPadding = layout.fontSize === "xs" ? "px-3 py-1.5" : "px-4 py-2";
  const pillText = layout.fontSize === "xs" ? "text-xs" : "text-sm";

  return (
    <div className="shrink-0 border-b border-border dark:border-border relative">
      {/* Left scroll button */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center h-8 w-8 rounded-full bg-card/90 dark:bg-card/90 shadow-md border border-border dark:border-border text-muted-foreground"
          aria-label="Scroll categories left"
        >
          <CaretLeft size={16} />
        </button>
      )}

      {/* Right scroll button */}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center h-8 w-8 rounded-full bg-card/90 dark:bg-card/90 shadow-md border border-border dark:border-border text-muted-foreground"
          aria-label="Scroll categories right"
        >
          <CaretRight size={16} />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide py-3"
        style={{ paddingLeft: layout.padding, paddingRight: layout.padding }}
      >
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-8 w-20 animate-pulse rounded-md bg-muted dark:bg-muted shrink-0"
              />
            ))
          : categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() =>
                    dispatch({ type: "SET_CATEGORY", payload: cat.id })
                  }
                  className={`shrink-0 rounded-lg font-medium transition-all ${pillPadding} ${pillText} ${
                    isActive
                      ? "bg-card text-primary-foreground dark:bg-card dark:text-foreground shadow-soft"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground/80 dark:bg-card dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-muted-foreground/50"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
      </div>
    </div>
  );
}

/* ─── Product Skeleton ─────────────────────────────────── */

function ProductSkeleton({ layout }: { layout: GridLayout }) {
  return (
    <div className="flex flex-col" style={{ gap: `${layout.gap / 2}px` }}>
      <div
        className="w-full animate-pulse rounded-lg bg-muted dark:bg-muted"
        style={{ height: `${layout.cardImageHeight}px` }}
      />
      <div
        className="animate-pulse rounded bg-muted dark:bg-muted"
        style={{ height: "16px", width: "75%" }}
      />
      <div
        className="animate-pulse rounded bg-muted dark:bg-muted"
        style={{ height: "14px", width: "50%" }}
      />
    </div>
  );
}

/* ─── Empty State ──────────────────────────────────────── */

function EmptyState({ layout }: { layout: GridLayout }) {
  const iconSize = layout.fontSize === "xs" ? 24 : 28;
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4">
      <div
        className="flex items-center justify-center rounded-2xl bg-muted/30 dark:bg-muted"
        style={{
          height: `${layout.touchSize * 1.5}px`,
          width: `${layout.touchSize * 1.5}px`,
        }}
      >
        <Package
          size={iconSize}
          className="text-muted-foreground/60 dark:text-foreground/80"
        />
      </div>
      <p
        className={`mt-4 font-medium text-muted-foreground dark:text-muted-foreground ${
          layout.fontSize === "xs" ? "text-sm" : "text-base"
        }`}
      >
        No products found
      </p>
    </div>
  );
}

/* ─── Product Card ─────────────────────────────────────── */

function ProductCard({
  product,
  dispatch,
  layout,
}: {
  product: Product;
  dispatch: React.Dispatch<PosAction>;
  layout: GridLayout;
}) {
  const [imageError, setImageError] = useState(false);
  const isOutOfStock = product.stock <= 0;
  const isLowStock =
    product.stock > 0 && product.stock <= product.minStockLevel;

  const handleClick = useCallback(() => {
    if (isOutOfStock) {
      toast.error(`Out of stock: ${product.name}`);
      return;
    }
    if (product.hasVariants && product.variants?.length) {
      dispatch({
        type: "OPEN_MODAL",
        payload: { modal: "variant", productId: product.id },
      });
    } else {
      dispatch({ type: "ADD_TO_CART", payload: { product } });
    }
  }, [product, dispatch, isOutOfStock]);

  const handleInfoClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch({
        type: "OPEN_MODAL",
        payload: { modal: "productDetail", productId: product.id },
      });
    },
    [dispatch, product.id],
  );

  const priceRange =
    product.hasVariants && product.variants
      ? {
          min: Math.min(...product.variants.map((v) => v.price)),
          max: Math.max(...product.variants.map((v) => v.price)),
        }
      : null;

  const nameClass =
    layout.fontSize === "xs"
      ? "text-xs leading-tight"
      : layout.fontSize === "sm"
        ? "text-sm leading-snug"
        : "text-base leading-snug";

  const priceClass =
    layout.fontSize === "xs"
      ? "text-xs"
      : layout.fontSize === "sm"
        ? "text-sm"
        : "text-base";

  const badgeText = layout.fontSize === "xs" ? "text-[9px]" : "text-[10px]";
  const infoBtnSize = layout.touchSize >= 44 ? 40 : 36;
  const infoIconSize = layout.fontSize === "xs" ? 14 : 16;

  return (
    <div
      className={`group flex flex-col ${isOutOfStock ? "opacity-60" : ""}`}
      style={{ gap: `${Math.max(6, layout.gap / 2)}px` }}
    >
      <div className="relative">
        <button
          onClick={handleClick}
          className={`relative w-full overflow-hidden rounded-lg bg-muted/30 transition-colors hover:bg-muted dark:bg-card dark:hover:bg-muted ${
            isOutOfStock ? "ring-2 ring-red-300 dark:ring-red-700" : ""
          }`}
          style={{ height: `${layout.cardImageHeight}px` }}
        >
          {!imageError && product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes={`(max-width: 400px) 50vw, (max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw`}
              className="object-contain p-2 sm:p-3 md:p-4 transition-transform duration-300 group-hover:scale-105"
              onError={() => setImageError(true)}
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon
                size={layout.fontSize === "xs" ? 24 : 32}
                className="text-muted-foreground/50 dark:text-foreground/80"
              />
            </div>
          )}

          {isOutOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <span
                className={`rounded-full bg-destructive px-2 py-0.5 font-bold text-primary-foreground ${badgeText}`}
              >
                OUT OF STOCK
              </span>
            </div>
          )}
          {isLowStock && (
            <div
              className={`absolute left-2 top-2 rounded-full bg-warning px-1.5 py-0.5 font-bold text-primary-foreground ${badgeText}`}
            >
              LOW: {product.stock}
            </div>
          )}
          {!isOutOfStock && !isLowStock && (
            <div
              className={`absolute left-2 top-2 rounded-full bg-success/80 px-1.5 py-0.5 font-bold text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 ${badgeText}`}
            >
              {product.stock} {product.unit || "pcs"}
            </div>
          )}
        </button>

        <button
          onClick={handleInfoClick}
          className="absolute right-2 top-2 flex items-center justify-center rounded-full bg-card/80 backdrop-blur-sm text-muted-foreground shadow-soft transition-all hover:bg-card hover:text-foreground/80 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 dark:bg-muted/80 dark:text-muted-foreground dark:hover:bg-muted"
          style={{ height: `${infoBtnSize}px`, width: `${infoBtnSize}px` }}
          title="View product details"
          aria-label={`View details for ${product.name}`}
        >
          <Info size={infoIconSize} weight="bold" />
        </button>
      </div>

      <h3
        className={`font-semibold text-foreground dark:text-foreground line-clamp-2 ${nameClass}`}
        // style={{ minHeight: layout.fontSize === "xs" ? "2.5em" : "2.8em" }}
      >
        {product.name}
      </h3>

      <p
        className={`font-semibold text-foreground/80 dark:text-muted-foreground/60 ${priceClass}`}
      >
        {priceRange
          ? `${priceRange.min.toLocaleString("en-PK")} - ${priceRange.max.toLocaleString("en-PK")} Rs.`
          : `${product.price.toLocaleString("en-PK")} Rs.`}
      </p>
    </div>
  );
}

/* ─── Product Detail Modal ───────────────────────────── */

function ProductDetailModal({ productId }: { productId: string }) {
  const { dispatch, products } = usePos();
  const [imageError, setImageError] = useState(false);
  const [qty, setQty] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const product = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );

  const isOutOfStock = product?.stock !== undefined && product.stock <= 0;

  const handleAddToCart = useCallback(() => {
    if (!product || isOutOfStock) return;
    if (product.hasVariants && product.variants?.length) {
      dispatch({ type: "CLOSE_MODAL" });
      dispatch({
        type: "OPEN_MODAL",
        payload: { modal: "variant", productId: product.id },
      });
      return;
    }
    for (let i = 0; i < qty; i++) {
      dispatch({ type: "ADD_TO_CART", payload: { product } });
    }
    toast.success(`Added ${qty} × ${product.name} to cart`);
    dispatch({ type: "CLOSE_MODAL" });
  }, [dispatch, product, qty, isOutOfStock]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dispatch({ type: "CLOSE_MODAL" });
      }
      if (
        e.key === "Enter" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        handleAddToCart();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch, handleAddToCart]);

  if (!product) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg md:max-w-2xl overflow-hidden rounded-t-2xl sm:rounded-2xl bg-card shadow-soft-lg dark:bg-card max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4 dark:border-border sticky top-0 bg-card/95 dark:bg-card/95 backdrop-blur-sm z-10">
          <h3 className="text-base sm:text-lg font-bold text-foreground dark:text-foreground truncate pr-4">
            Product Details
          </h3>
          <button
            onClick={() => dispatch({ type: "CLOSE_MODAL" })}
            aria-label="Close product details"
            className="flex items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground/80 dark:hover:bg-muted dark:hover:text-muted-foreground/60 shrink-0"
            style={{ height: isMobile ? 36 : 44, width: isMobile ? 36 : 44 }}
          >
            <X size={isMobile ? 16 : 18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6">
          {/* Left: Image */}
          <div className="relative h-48 sm:h-52 w-full sm:w-48 shrink-0 overflow-hidden rounded-xl bg-muted/30 dark:bg-muted mx-auto sm:mx-0">
            {!imageError && product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-contain p-4"
                onError={() => setImageError(true)}
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon
                  size={isMobile ? 32 : 40}
                  className="text-muted-foreground/50 dark:text-foreground/80"
                />
              </div>
            )}
            {isOutOfStock && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <span className="rounded-full bg-destructive px-3 py-1 text-xs font-bold text-primary-foreground">
                  OUT OF STOCK
                </span>
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div className="flex flex-1 flex-col gap-3 sm:gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground dark:text-foreground">
                {product.name}
              </h2>
              {product.hasVariants && (
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground dark:text-muted-foreground">
                  {product.variants?.length} variants available
                </p>
              )}
            </div>

            {/* Price & Stock Grid */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="rounded-xl bg-muted/30 p-3 dark:bg-muted">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Selling Price
                </p>
                <p className="text-sm sm:text-lg font-bold text-foreground dark:text-foreground">
                  {product.hasVariants && product.variants
                    ? `${Math.min(...product.variants.map((v) => v.price)).toLocaleString("en-PK")} - ${Math.max(...product.variants.map((v) => v.price)).toLocaleString("en-PK")} Rs.`
                    : `${product.price.toLocaleString("en-PK")} Rs.`}
                </p>
              </div>
              <div
                className={`rounded-xl p-3 ${isOutOfStock ? "bg-destructive/10 dark:bg-destructive/90/20" : "bg-muted/30 dark:bg-muted"}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  In Stock
                </p>
                <p
                  className={`text-sm sm:text-lg font-bold ${isOutOfStock ? "text-destructive dark:text-destructive/70" : "text-success dark:text-success/70"}`}
                >
                  {product.stock} {product.unit || "pcs"}
                </p>
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs sm:text-sm">
              <InfoRow
                icon={<Barcode size={14} className="text-muted-foreground" />}
                label="SKU"
                value={product.sku}
              />
              {product.barcode && (
                <InfoRow
                  icon={<Barcode size={14} className="text-muted-foreground" />}
                  label="Barcode"
                  value={product.barcode}
                  isMono
                />
              )}
              <InfoRow
                icon={<Tag size={14} className="text-muted-foreground" />}
                label="Category"
                value={product.categoryName}
              />
              <InfoRow
                icon={<Cube size={14} className="text-muted-foreground" />}
                label="Unit"
                value={product.unit || "pieces"}
              />
            </div>

            {/* Low Stock Warning */}
            {product.stock > 0 && product.stock <= product.minStockLevel && (
              <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 dark:bg-warning/90/20">
                <Warning
                  size={16}
                  className="text-warning dark:text-warning/80 shrink-0"
                />
                <p className="text-xs font-medium text-warning dark:text-warning/80">
                  Low stock alert! Minimum level: {product.minStockLevel}{" "}
                  {product.unit || "pcs"}
                </p>
              </div>
            )}

            {/* Quantity Selector */}
            {!product.hasVariants && !isOutOfStock && (
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-xs sm:text-sm font-medium text-foreground/80 dark:text-muted-foreground/60">
                  Quantity:
                </span>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <QtyButton
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    icon={<Minus size={14} weight="bold" />}
                    aria="Decrease quantity"
                  />
                  <span className="w-8 sm:w-10 text-center text-sm sm:text-base font-bold text-foreground dark:text-foreground">
                    {qty}
                  </span>
                  <QtyButton
                    onClick={() => setQty(Math.min(product.stock, qty + 1))}
                    icon={<Plus size={14} weight="bold" />}
                    aria="Increase quantity"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 sm:gap-3 border-t border-border px-4 py-3 sm:px-6 sm:py-4 dark:border-border sticky bottom-0 bg-card/95 dark:bg-card/95 backdrop-blur-sm">
          <button
            onClick={() => dispatch({ type: "CLOSE_MODAL" })}
            className="flex-1 rounded-xl border border-border py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-muted-foreground transition hover:bg-muted/30 dark:border-border dark:text-muted-foreground dark:hover:bg-muted"
          >
            Cancel (Esc)
          </button>
          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className={`flex-1 rounded-xl py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-primary-foreground transition ${
              isOutOfStock
                ? "cursor-not-allowed bg-muted text-muted-foreground dark:bg-muted"
                : "bg-success hover:bg-success/90 dark:bg-success/90 dark:hover:bg-success"
            }`}
          >
            {isOutOfStock
              ? "Out of Stock"
              : product.hasVariants
                ? "Select Variant (Enter)"
                : `Add ${qty} to Cart (Enter)`}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  isMono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isMono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {icon}
      <span className="text-muted-foreground dark:text-muted-foreground shrink-0">
        {label}:
      </span>
      <span
        className={`font-medium text-foreground dark:text-foreground truncate ${isMono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function QtyButton({
  onClick,
  icon,
  aria,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  aria: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-lg border border-border text-foreground/80 transition hover:bg-muted/30 dark:border-border dark:text-muted-foreground/60 dark:hover:bg-muted"
    >
      {icon}
    </button>
  );
}

/* ─── Variant Selector Modal ───────────────────────────── */

function VariantSelectorModal({ productId }: { productId: string }) {
  const { dispatch, products } = usePos();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const product = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );
  const variants = useMemo(() => product?.variants || [], [product]);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const effectiveVariantId = selectedVariantId ?? (variants[0]?.id || null);

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = useMemo(
    () => variants.findIndex((v) => v.id === effectiveVariantId),
    [variants, effectiveVariantId],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === "Escape") {
        dispatch({ type: "CLOSE_MODAL" });
        return;
      }
      if (variants.length === 0) return;
      if (e.key === "ArrowDown") {
        const nextIndex =
          selectedIndex < variants.length - 1 ? selectedIndex + 1 : 0;
        setSelectedVariantId(variants[nextIndex].id);
        itemRefs.current[nextIndex]?.focus();
        return;
      }
      if (e.key === "ArrowUp") {
        const prevIndex =
          selectedIndex > 0 ? selectedIndex - 1 : variants.length - 1;
        setSelectedVariantId(variants[prevIndex].id);
        itemRefs.current[prevIndex]?.focus();
        return;
      }
      if (e.key === "Enter") {
        if (effectiveVariantId && product) {
          const v = variants.find((x) => x.id === effectiveVariantId);
          if (v) {
            dispatch({ type: "ADD_TO_CART", payload: { product, variant: v } });
            dispatch({ type: "CLOSE_MODAL" });
          }
        }
        return;
      }
    },
    [dispatch, effectiveVariantId, selectedIndex, variants, product],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (variants.length > 0) {
      itemRefs.current[0]?.focus();
    }
  }, [variants]);

  if (!product?.variants?.length) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-md md:max-w-lg overflow-hidden rounded-t-2xl sm:rounded-2xl bg-card shadow-soft-lg dark:bg-card max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4 dark:border-border sticky top-0 bg-card/95 dark:bg-card/95 backdrop-blur-sm z-10">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-foreground dark:text-foreground truncate">
              {product.name}
            </h3>
            <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground dark:text-muted-foreground">
              Select a variant — use ↑↓ to navigate, Enter to select, Esc to
              close
            </p>
          </div>
          <button
            onClick={() => dispatch({ type: "CLOSE_MODAL" })}
            aria-label="Close variant selector"
            className="flex items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground/80 dark:hover:bg-muted dark:hover:text-muted-foreground/60 shrink-0 ml-2"
            style={{ height: isMobile ? 36 : 44, width: isMobile ? 36 : 44 }}
          >
            <X size={isMobile ? 16 : 18} />
          </button>
        </div>

        {/* Product Image + Variants */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6">
          {/* Left: Product Image */}
          <div className="relative h-36 sm:h-40 w-full sm:w-40 shrink-0 overflow-hidden rounded-xl bg-muted/30 dark:bg-muted mx-auto sm:mx-0">
            {product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-contain p-4"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <ImageIcon
                  size={isMobile ? 28 : 32}
                  className="text-muted-foreground/50 dark:text-foreground/80"
                />
              </div>
            )}
          </div>

          {/* Right: Variants List */}
          <div className="flex flex-1 flex-col gap-1.5 sm:gap-2">
            {variants.map((v, index) => (
              <button
                key={v.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                onClick={() => setSelectedVariantId(v.id)}
                className={`flex items-center justify-between rounded-xl border-2 px-3 sm:px-4 py-2.5 sm:py-3 text-left transition-all outline-none focus:ring-2 focus:ring-ring/70 ${
                  effectiveVariantId === v.id
                    ? "border-foreground/30 bg-muted/30 ring-2 ring-ring dark:border-white dark:bg-muted dark:ring-white"
                    : "border-border hover:border-border dark:border-border dark:hover:border-border"
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors shrink-0 ${
                      effectiveVariantId === v.id
                        ? "border-foreground/30 bg-card dark:border-white dark:bg-card"
                        : "border-border dark:border-border"
                    }`}
                  >
                    {effectiveVariantId === v.id && (
                      <div className="h-1.5 w-1.5 rounded-full bg-card dark:bg-card" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-foreground/80 dark:text-muted-foreground/60 truncate block">
                      {v.name}
                    </span>
                    <p className="text-[10px] text-muted-foreground">
                      Stock: {v.stock} {product.unit || "pcs"}
                    </p>
                  </div>
                </div>
                <span className="text-xs sm:text-sm font-bold text-foreground dark:text-foreground shrink-0 ml-2">
                  {v.price.toLocaleString("en-PK")} Rs.
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 sm:gap-3 border-t border-border px-4 py-3 sm:px-6 sm:py-4 dark:border-border sticky bottom-0 bg-card/95 dark:bg-card/95 backdrop-blur-sm">
          <button
            onClick={() => dispatch({ type: "CLOSE_MODAL" })}
            className="flex-1 rounded-xl border border-border py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-muted-foreground transition hover:bg-muted/30 hover:text-foreground/80 dark:border-border dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-muted-foreground/50"
          >
            Cancel (Esc)
          </button>
          <button
            onClick={() => {
              if (effectiveVariantId) {
                const v = variants.find((x) => x.id === effectiveVariantId);
                if (v) {
                  dispatch({
                    type: "ADD_TO_CART",
                    payload: { product, variant: v },
                  });
                  dispatch({ type: "CLOSE_MODAL" });
                }
              }
            }}
            disabled={!effectiveVariantId}
            className="flex-1 rounded-xl bg-card py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-primary-foreground transition hover:bg-muted disabled:bg-muted disabled:text-muted-foreground dark:bg-card dark:text-foreground dark:hover:bg-muted dark:disabled:bg-muted dark:disabled:text-foreground/80"
          >
            Add to Cart (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
