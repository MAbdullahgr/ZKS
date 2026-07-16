"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Plus,
  Search,
  Filter,
  Pencil,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Package,
  Loader2,
  X,
  PackagePlus,
  Check,
  AlertCircle,
  FolderTree,
  Layers,
  Tag,
} from "lucide-react";
import Image from "next/image";
import ImageUpload from "@/components/ui/ImageUpload";
import { useRouter } from "next/navigation";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch } from "@/lib/fetcher";
import ExportModal from "@/components/ui/ExportModal";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationBar } from "@/components/ui/pagination";

interface Category {
  id: string;
  name: string;
}
interface Supplier {
  id: string;
  name: string;
}
interface Brand {
  id: string;
  name: string;
}
interface Tax {
  id: string;
  name: string;
  rate: number;
  type: string;
}
interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  categoryId?: string | null;
  supplierId?: string | null;
  brandId?: string | null;
  brand?: Brand | null;
  tax?: Tax | null;
  taxId?: string | null;
  costPrice: string;
  sellingPrice: string;
  totalStock: number; // Calculated from batches
  minStockLevel: number;
  unit: string;
  isLoose: boolean;
  baseUnit?: string;
  parentUnit?: string;
  unitsPerParent?: number;
  productGroup?: string | null; // FIX: Added missing field
  variantName?: string | null; // FIX: Added missing field
  isActive: boolean;
  isReturnable: boolean;
  imageUrl?: string;
  category?: Category;
  supplier?: Supplier;
  store?: { name: string } | null;
}

const emptyForm = {
  name: "",
  sku: "",
  barcode: "",
  description: "",
  categoryId: "",
  supplierId: "",
  brandId: "",
  taxId: "",
  costPrice: "",
  sellingPrice: "",
  minStockLevel: 10,
  unit: "piece",
  baseUnit: "piece",
  parentUnit: "",
  unitsPerParent: 1,
  imageUrl: "",
  productGroup: "",
  variantName: "",
  isReturnable: true,
  isActive: true,
  isLoose: false,
};

const emptyStockForm = {
  productId: "",
  batchNumber: "",
  expiryDate: "",
  quantity: 0,
  costPrice: "",
  reason: "Initial stock",
};

// ─── Format stock with parent units ──────────────────────────────────
function formatStock(
  qty: number | undefined | null,
  unit: string | undefined | null,
  parentUnit?: string | null,
  unitsPerParent?: number | null,
): string {
  // FIX: Fallback to 0 if undefined/null
  const numQty = Number(qty) || 0;
  const safeUnit = unit || "units";

  // FIX: Format decimals cleanly (e.g., 2.5 instead of 2.50)
  const displayQty =
    numQty % 1 === 0
      ? numQty.toString()
      : numQty.toFixed(3).replace(/\.?0+$/, "");

  if (!parentUnit || !unitsPerParent || Number(unitsPerParent) <= 1) {
    return `${displayQty} ${safeUnit}${numQty !== 1 ? "s" : ""}`;
  }

  const parents = Math.floor(numQty / Number(unitsPerParent));
  const remainder = numQty % Number(unitsPerParent);

  if (parents === 0)
    return `${displayQty} ${safeUnit}${remainder !== 1 ? "s" : ""}`;
  if (remainder === 0)
    return `${parents} ${parentUnit}${parents !== 1 ? "s" : ""}`;

  return `${parents} ${parentUnit}${parents !== 1 ? "s" : ""} ${remainder} ${safeUnit}${remainder !== 1 ? "s" : ""}`;
}

export default function InventoryPage() {
  const router = useRouter();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Receive Stock Modal
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockForm, setStockForm] = useState(emptyStockForm);
  const [stockLoading, setStockLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const exportFields = [
    { key: "id", label: "ID (Internal)" },
    { key: "name", label: "Product Name *" },
    { key: "sku", label: "SKU *" },
    { key: "barcode", label: "Barcode" },
    { key: "categoryName", label: "Category" },
    { key: "brandName", label: "Brand" },
    { key: "supplierName", label: "Supplier" },
    { key: "costPrice", label: "Cost Price" },
    { key: "sellingPrice", label: "Selling Price" },
    { key: "stockQuantity", label: "Stock Quantity" },
    { key: "minStockLevel", label: "Min Stock Level" },
    { key: "unit", label: "Base Unit" },
    { key: "parentUnit", label: "Parent Unit" },
    { key: "unitsPerParent", label: "Units Per Parent" },
    { key: "productGroup", label: "Product Group" },
    { key: "variantName", label: "Variant Name" },
    { key: "isLoose", label: "Is Loose Item (true/false)" },
    { key: "isReturnable", label: "Is Returnable (true/false)" },
    { key: "isActive", label: "Is Active (true/false)" },
    { key: "description", label: "Description" },
    { key: "imageUrl", label: "Image URL" },
  ];

  // ─── Data Fetching (SWR) ─────────────────────────────────────────────
  const {
    items: products,
    meta: productsMeta,
    isLoading: dataLoading,
    search: search,
    setSearch: setSearch,
    filters: productFilters,
    setFilter: setProductFilter,
    mutate: mutateProducts,
    setPage: setProductPage,
  } = usePaginatedList<Product>("/api/products", "products", {
    search: true,
    limit: 20,
    filters: {
      categoryId: "",
      includeInactive: "false",
    },
  });

  const filterCategory = (productFilters.categoryId as string) || "";
  const showInactive = productFilters.includeInactive === "true";

  function handleFilterCategoryChange(value: string) {
    setProductFilter("categoryId", value);
  }
  function handleShowInactiveChange(value: boolean) {
    setProductFilter("includeInactive", value ? "true" : "false");
  }

  const { data: categoriesData } = useSWR<{ categories: Category[] }>(
    "/api/categories",
    (url: string) =>
      apiGet<{ categories: Category[] }>(url) as Promise<{
        categories: Category[];
      }>,
  );
  // Dedupe categories by name — in "All Stores" mode the API returns one set
  // per store, but the filter dropdown should list each name only once.
  const categories = (() => {
    const all = categoriesData?.categories || [];
    const seen = new Set<string>();
    return all.filter((c) => {
      const key = c.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  const { data: suppliersData } = useSWR<{ suppliers: Supplier[] }>(
    "/api/suppliers",
    (url: string) =>
      apiGet<{ suppliers: Supplier[] }>(url) as Promise<{
        suppliers: Supplier[];
      }>,
  );
  const suppliers = suppliersData?.suppliers || [];

  const { data: brandsData } = useSWR<{ brands: Brand[] }>(
    "/api/brands",
    (url: string) =>
      apiGet<{ brands: Brand[] }>(url) as Promise<{ brands: Brand[] }>,
  );
  const brands = brandsData?.brands || [];

  // Fetch taxes
  const { data: taxesData } = useSWR<{ taxes: Tax[] }>(
    "/api/taxes",
    (url: string) => apiGet<{ taxes: Tax[] }>(url) as Promise<{ taxes: Tax[] }>,
  );
  const taxes = taxesData?.taxes || [];

  // ─── Modal & Form Handlers ───────────────────────────────────────────
  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode ?? "",
      description: p.description ?? "",
      categoryId: p.categoryId ?? "",
      supplierId: p.supplierId ?? "",
      brandId: p.brandId ?? "",
      taxId: p.taxId ?? "",
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      minStockLevel: p.minStockLevel,
      unit: p.unit,
      baseUnit: p.baseUnit || "piece",
      parentUnit: p.parentUnit ?? "",
      unitsPerParent: p.unitsPerParent ?? 1,
      imageUrl: p.imageUrl ?? "",
      productGroup: p.productGroup ?? "",
      variantName: p.variantName ?? "",
      isReturnable: p.isReturnable,
      isActive: p.isActive,
      isLoose: p.isLoose,
    });
    setError("");
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.name || !form.sku || !form.sellingPrice) {
      const msg = "Name, SKU and selling price are required";
      setError(msg);
      toast.error(msg); // FIX: Add toast for manual validation
      return;
    }
    setLoading(true);
    setError("");

    try {
      const payload = {
        ...form,
        costPrice: parseFloat(form.costPrice) || 0,
        sellingPrice: parseFloat(form.sellingPrice) || 0,
        minStockLevel: Number(form.minStockLevel) || 0,
        unitsPerParent: form.parentUnit
          ? Math.max(1, Number(form.unitsPerParent))
          : 1,
        brandId: form.brandId || null,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        taxId: form.taxId || null,
      };

      if (editing) {
        await apiPatch(`/api/products/${editing.id}`, payload);
        toast.success("Product updated successfully");
      } else {
        await apiPost("/api/products", payload);
        toast.success("Product created successfully");
      }
      setShowModal(false);
      mutateProducts();
    } catch (err) {
      // FIX: Only set local error state. The global apiFetch already showed the toast!
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    const action = currentActive ? "Deactivate" : "Reactivate";
    if (!confirm(`${action} this product?`)) return;
    try {
      await apiPatch(`/api/products/${id}`, { isActive: !currentActive });
      toast.success(`Product ${action}d`);
      mutateProducts();
    } catch {
      toast.error(`Failed to ${action.toLowerCase()} product`);
    }
  }

  // ─── Receive Stock Handlers ──────────────────────────────────────────
  function openReceiveStock(p: Product) {
    setStockForm({
      ...emptyStockForm,
      productId: p.id,
      costPrice: p.costPrice,
    });
    setShowStockModal(true);
  }

  async function handleReceiveStock() {
    if (stockForm.quantity <= 0) {
      toast.error("Quantity must be greater than 0"); // FIX: Add toast for manual validation
      return;
    }
    setStockLoading(true);
    try {
      await apiPost("/api/inventory/receive", stockForm);
      toast.success("Stock received successfully");
      setShowStockModal(false);
      mutateProducts();
    } catch {
      // FIX: Do not call toast.error here. The global apiFetch already showed it.
      // We don't have a local error state for the stock modal, so the toast is enough.
    } finally {
      setStockLoading(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            Inventory
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage products, brands, and stock levels
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExportModal(true)}
            aria-label="Import or export products"
            className="flex items-center gap-2 bg-muted hover:bg-muted text-foreground/90 px-3 md:px-4 py-2.5 rounded-xl text-sm font-medium transition shrink-0"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import/Export</span>
          </button>

          <button
            onClick={openAdd}
            aria-label="Add product"
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-3 md:px-4 py-2.5 rounded-xl text-sm font-medium transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Product</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
          <input
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-ring100 transition"
            placeholder="Search by name, SKU, barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative min-w-40">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
          <select
            className="w-full pl-9 pr-8 py-2.5 border border-border rounded-xl text-sm outline-none focus:border-primary-400 bg-card appearance-none transition"
            value={filterCategory}
            onChange={(e) => handleFilterCategoryChange(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 px-3 py-2.5 border border-border rounded-xl text-sm text-foreground/90 bg-card cursor-pointer select-none hover:bg-muted/50 transition">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-border text-primary focus:ring-ring500"
            checked={showInactive}
            onChange={(e) => handleShowInactiveChange(e.target.checked)}
          />
          Show Inactive
        </label>
      </div>

      {/* Loading */}
      {dataLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-xl border border-border p-4 animate-pulse"
            >
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Desktop Table */}
      {!dataLoading && products.length > 0 && (
        <div>
          <div className="hidden md:block bg-card rounded-xl border border-border shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Product</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Store</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Brand</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Category</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Stock</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Cost</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Price</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Status</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs text-center">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map((p, idx) => {
                    const low = p.totalStock <= p.minStockLevel;
                    const out = p.totalStock === 0;
                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-muted/50 transition-colors ${idx % 2 === 1 ? "bg-muted/20" : ""} ${!p.isActive ? "opacity-60" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {/* FIX: Check if imageUrl exists AND is not just whitespace */}
                            {p.imageUrl && p.imageUrl.trim() ? (
                              <div className="w-10 h-10 rounded-lg overflow-hidden border border-border shrink-0">
                                <Image
                                  src={p.imageUrl}
                                  alt={p.name}
                                  width={40}
                                  height={40}
                                  className="object-cover w-full h-full"
                                />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground/70 text-xs font-bold">
                                {p.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div
                                className="font-medium text-foreground cursor-pointer hover:text-primary transition"
                                onClick={() =>
                                  router.push(`/inventory/${p.id}`)
                                }
                              >
                                {p.name}{" "}
                                {p.isLoose && (
                                  <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded ml-1">
                                    Loose
                                  </span>
                                )}
                              </div>
                              {p.barcode && (
                                <div className="text-xs text-muted-foreground/70 font-mono">
                                  {p.barcode}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {p.store?.name ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium border border-border">
                              {p.store.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/70">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.brand?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.category?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {(p.totalStock === 0 ||
                              p.totalStock <= p.minStockLevel) && (
                              <AlertTriangle
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  p.totalStock === 0
                                    ? "text-destructive"
                                    : "text-warning"
                                }`}
                              />
                            )}
                            <span
                              className={`font-medium ${
                                p.totalStock === 0
                                  ? "text-destructive"
                                  : p.totalStock <= p.minStockLevel
                                    ? "text-warning"
                                    : "text-foreground/90"
                              }`}
                            >
                              {formatStock(
                                p.totalStock,
                                p.unit,
                                p.parentUnit,
                                p.unitsPerParent,
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          Rs. {Number(p.costPrice).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          Rs. {Number(p.sellingPrice).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {!p.isActive ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium border border-border">
                                Inactive
                              </span>
                            ) : out ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-destructive/15 text-destructive font-medium border border-destructive/25">
                                Out of Stock
                              </span>
                            ) : low ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-warning/15 text-warning font-medium border border-warning/25">
                                Low Stock
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-success/15 text-success font-medium border border-success/25">
                                In Stock
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openReceiveStock(p)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-success/10 text-muted-foreground/70 hover:text-success transition"
                              title="Receive Stock"
                              aria-label={`Receive stock for ${p.name}`}
                            >
                              <PackagePlus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openEdit(p)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-primary/10 text-muted-foreground/70 hover:text-primary transition"
                              title="Edit"
                              aria-label={`Edit product ${p.name}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                handleToggleActive(p.id, p.isActive)
                              }
                              className={`flex h-9 w-9 items-center justify-center rounded-lg p-2 transition ${p.isActive ? "hover:bg-destructive/10 text-muted-foreground/70 hover:text-destructive" : "hover:bg-success/10 text-muted-foreground/70 hover:text-success"}`}
                              title={p.isActive ? "Deactivate" : "Reactivate"}
                              aria-label={
                                p.isActive
                                  ? `Deactivate product ${p.name}`
                                  : `Reactivate product ${p.name}`
                              }
                            >
                              {p.isActive ? (
                                <Trash2 className="w-3.5 h-3.5" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {/* Pagination — AUDIT-FIX: was missing entirely */}
          {productsMeta && (
            <PaginationBar
              meta={productsMeta}
              onPageChange={setProductPage}
              className="pt-2"
            />
          )}
        </div>
      )}

      {/* Mobile Cards */}
      {!dataLoading && products.length > 0 && (
        <div className="md:hidden space-y-3 p-1">
          {products.map((p) => {
            const low = p.totalStock <= p.minStockLevel;
            const out = p.totalStock === 0;
            return (
              <div
                key={p.id}
                className={`bg-card rounded-lg border border-border p-3 shadow-soft space-y-3 ${!p.isActive ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-3">
                  {p.imageUrl && p.imageUrl.trim() ? (
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-border shrink-0">
                      <Image
                        src={p.imageUrl}
                        alt={p.name}
                        width={48}
                        height={48}
                        className="object-cover w-full h-full"
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground/70 text-sm font-bold">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-medium text-foreground cursor-pointer hover:text-primary transition"
                      onClick={() => router.push(`/inventory/${p.id}`)}
                    >
                      {p.name}{" "}
                      {p.isLoose && (
                        <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded ml-1">
                          Loose
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                      {p.sku}
                      {p.barcode ? ` • ${p.barcode}` : ""}
                    </p>
                    {(p.brand?.name || p.category?.name || p.store?.name) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.store?.name && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium border border-border">
                            {p.store.name}
                          </span>
                        )}
                        {p.brand?.name && (
                          <span className="text-[10px] text-muted-foreground">
                            {p.brand.name}
                          </span>
                        )}
                        {p.category?.name && (
                          <span className="text-[10px] text-muted-foreground">
                            • {p.category.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Price:{" "}
                      <span className="font-semibold text-foreground">
                        Rs. {Number(p.sellingPrice).toLocaleString()}
                      </span>
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {(out || low) && (
                        <AlertTriangle
                          className={`w-3.5 h-3.5 shrink-0 ${
                            out ? "text-destructive" : "text-warning"
                          }`}
                        />
                      )}
                      <span
                        className={`text-xs font-medium ${
                          out
                            ? "text-destructive"
                            : low
                              ? "text-warning"
                              : "text-foreground/90"
                        }`}
                      >
                        {formatStock(
                          p.totalStock,
                          p.unit,
                          p.parentUnit,
                          p.unitsPerParent,
                        )}
                      </span>
                      {!p.isActive ? (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium border border-border">
                          Inactive
                        </span>
                      ) : out ? (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-destructive/15 text-destructive font-medium border border-destructive/25">
                          Out
                        </span>
                      ) : low ? (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-warning/15 text-warning font-medium border border-warning/25">
                          Low
                        </span>
                      ) : (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-success/15 text-success font-medium border border-success/25">
                          In Stock
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openReceiveStock(p)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-success/10 text-muted-foreground/70 hover:text-success transition"
                      title="Receive Stock"
                      aria-label={`Receive stock for ${p.name}`}
                    >
                      <PackagePlus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEdit(p)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg p-2 hover:bg-primary/10 text-muted-foreground/70 hover:text-primary transition"
                      title="Edit"
                      aria-label={`Edit product ${p.name}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(p.id, p.isActive)}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg p-2 transition ${p.isActive ? "hover:bg-destructive/10 text-muted-foreground/70 hover:text-destructive" : "hover:bg-success/10 text-muted-foreground/70 hover:text-success"}`}
                      title={p.isActive ? "Deactivate" : "Reactivate"}
                      aria-label={
                        p.isActive
                          ? `Deactivate product ${p.name}`
                          : `Reactivate product ${p.name}`
                      }
                    >
                      {p.isActive ? (
                        <Trash2 className="w-4 h-4" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!dataLoading && products.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Package className="w-12 h-12 text-foreground/80 mx-auto mb-3" />
          <p className="text-muted-foreground/70 font-medium">No products found</p>
          <p className="text-muted-foreground/70 text-sm mt-1">
            {search || filterCategory || !showInactive
              ? "Try adjusting your filters"
              : "Add your first product to get started"}
          </p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-3xl h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40 rounded-t-2xl">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                {editing ? "Edit Product" : "Add New Product"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Close product dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable if needed) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Section 1: General Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Product Image
                  </label>
                  <ImageUpload
                    value={form.imageUrl}
                    onChange={(url) =>
                      setForm((f) => ({ ...f, imageUrl: url }))
                    }
                    onClear={() => setForm((f) => ({ ...f, imageUrl: "" }))}
                  />
                </div>

                <div className="md:col-span-2 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder="e.g. Basmati Rice 1kg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        SKU *
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition"
                        value={form.sku}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, sku: e.target.value }))
                        }
                        placeholder="RICE-1KG"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        Barcode
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition"
                        value={form.barcode}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, barcode: e.target.value }))
                        }
                        placeholder="8964000020203"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Description
                    </label>
                    <textarea
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition resize-none"
                      rows={2}
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                      placeholder="Short description (optional)"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Pricing & Inventory */}
              <div className="border-t border-border pt-6">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-muted-foreground" /> Pricing & Inventory
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Cost Price (Rs) *
                    </label>
                    <input
                      type="number"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition"
                      value={form.costPrice}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, costPrice: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Selling Price (Rs) *
                    </label>
                    <input
                      type="number"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition"
                      value={form.sellingPrice}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, sellingPrice: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Min Stock Level
                    </label>
                    <input
                      type="number"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition"
                      value={form.minStockLevel}
                      // FIX: Parse to Number to satisfy TypeScript
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          minStockLevel: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer h-10.5 px-3 border border-border rounded-lg w-full bg-muted/40 hover:bg-muted transition justify-center">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-border text-primary focus:ring-ring500"
                        checked={form.isLoose}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, isLoose: e.target.checked }))
                        }
                      />
                      <span className="text-xs font-medium text-foreground/90">
                        Loose Item (Kiryana)
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Section 3: Categorization */}
              <div className="border-t border-border pt-6">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-muted-foreground" />{" "}
                  Categorization
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Brand
                    </label>
                    <SearchableSelect
                      options={brands}
                      value={form.brandId}
                      onChange={(val) =>
                        setForm((f) => ({ ...f, brandId: val }))
                      }
                      placeholder="Select brand..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Category
                    </label>
                    <SearchableSelect
                      options={categories}
                      value={form.categoryId}
                      onChange={(val) =>
                        setForm((f) => ({ ...f, categoryId: val }))
                      }
                      placeholder="Select category..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Supplier
                    </label>
                    <SearchableSelect
                      options={suppliers}
                      value={form.supplierId}
                      onChange={(val) =>
                        setForm((f) => ({ ...f, supplierId: val }))
                      }
                      placeholder="Select supplier..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Tax Rate
                    </label>
                    <SearchableSelect
                      options={taxes}
                      value={form.taxId}
                      onChange={(val) => setForm((f) => ({ ...f, taxId: val }))}
                      placeholder="No tax (optional)..."
                    />
                  </div>
                </div>
              </div>
              {/* Section 4: Units & Variants */}
              <div className="border-t border-border pt-6">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-muted-foreground" /> Units & Variants
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Base Unit *
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition"
                      placeholder="piece, kg"
                      value={form.unit}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, unit: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Parent Unit
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition"
                      placeholder="carton, bag"
                      value={form.parentUnit}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, parentUnit: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Units Per Parent
                    </label>
                    <input
                      type="number"
                      min={1}
                      disabled={!form.parentUnit}
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition disabled:bg-muted disabled:text-muted-foreground/70"
                      value={form.unitsPerParent}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          unitsPerParent: Math.max(1, Number(e.target.value)),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Product Group
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition"
                      placeholder="e.g. Rice"
                      value={form.productGroup}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, productGroup: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Variant Name
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-ring500 transition"
                      placeholder="e.g. Super Kernel"
                      value={form.variantName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, variantName: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/25 text-destructive px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>

            {/* Modal Footer (Sticky) */}
            <div className="p-4 bg-muted/40 border-t border-border flex justify-end gap-3 rounded-b-2xl shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-foreground/90 hover:bg-muted rounded-lg transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-6 py-2 text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg font-semibold transition shadow-soft flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {editing ? "Update Product" : "Save Product"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receive Stock Modal */}
      {showStockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Receive Stock
              </h2>
              <button
                onClick={() => setShowStockModal(false)}
                aria-label="Close receive stock dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Quantity *
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
                  step="0.001"
                  value={stockForm.quantity}
                  onChange={(e) =>
                    setStockForm((f) => ({
                      ...f,
                      quantity: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Cost Price (Rs.) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
                  value={stockForm.costPrice}
                  onChange={(e) =>
                    setStockForm((f) => ({ ...f, costPrice: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Expiry Date (Optional)
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
                  value={stockForm.expiryDate}
                  onChange={(e) =>
                    setStockForm((f) => ({ ...f, expiryDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Batch Number (Optional)
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
                  value={stockForm.batchNumber}
                  onChange={(e) =>
                    setStockForm((f) => ({ ...f, batchNumber: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-3 justify-end">
              <button
                onClick={() => setShowStockModal(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleReceiveStock}
                disabled={stockLoading}
                className="px-4 py-2 text-sm bg-success hover:bg-success/90 disabled:opacity-50 text-success-foreground rounded-lg font-medium transition"
              >
                {stockLoading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  "Add Stock"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate the filter string from current state */}
      {(() => {
        const exportFilters = new URLSearchParams();
        if (search) exportFilters.set("search", search);
        if (filterCategory) exportFilters.set("categoryId", filterCategory);

        return (
          <ExportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            entityType="products"
            fields={exportFields}
            filterUrl={exportFilters.toString()}
          />
        );
      })()}
    </div>
  );
}
