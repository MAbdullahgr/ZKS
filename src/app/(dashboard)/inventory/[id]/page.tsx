"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Image from "next/image";
import {
  ArrowLeft,
  Package,
  History,
  ShoppingCart,
  Truck,
  Layers,
  Settings,
  Pencil,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  PackagePlus,
  X,
} from "lucide-react";
import ImageUpload from "@/components/ui/ImageUpload";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";

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

interface ProductBatch {
  id: string;
  batchNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  costPrice: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  categoryId: string | null;
  supplierId: string | null;
  brandId: string | null;
  brand: Brand | null;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  totalStock: number;
  minStockLevel: number;
  unit: string;
  isLoose: boolean;
  baseUnit: string;
  parentUnit: string | null;
  unitsPerParent: number | null;
  productGroup: string | null;
  variantName: string | null;
  isActive: boolean;
  isReturnable: boolean;
  imageUrl: string | null;
  category: Category | null;
  supplier: Supplier | null;
  createdAt: string;
  updatedAt: string;
  batches: ProductBatch[];
}

interface Variant {
  id: string;
  name: string;
  variantName: string | null;
  sku: string;
  barcode: string | null;
  sellingPrice: number;
  totalStock: number;
  unit: string;
  parentUnit: string | null;
  unitsPerParent: number | null;
  imageUrl: string | null;
  isActive: boolean;
}

interface StockHistoryItem {
  id: string;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  user: { email: string | null } | null;
  store: { name: string } | null;
}

interface SaleHistoryItem {
  id: string;
  quantity: number;
  unitPrice: number;
  total: number;
  createdAt: string;
  sale: {
    id: string;
    saleNumber: string;
    saleDate: string;
    customerName: string | null;
    customerId: string | null;
    status: string;
    storeId: string;
  } | null;
}

interface PurchaseHistoryItem {
  id: string;
  quantity: number;
  unitCost: number;
  total: number;
  receivedQty: number;
  createdAt: string;
  purchaseOrder: {
    id: string;
    orderNumber: string;
    orderDate: string;
    status: string;
    storeId: string;
    supplier: { name: string } | null;
  } | null;
}

interface ProductDetailResponse {
  product: Product;
  variants: Variant[];
  stockHistory: StockHistoryItem[];
  salesHistory: SaleHistoryItem[];
  purchaseHistory: PurchaseHistoryItem[];
}

// FIX: Strict typing for the edit form to prevent string/number mismatches
interface EditFormState {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  costPrice: string;
  sellingPrice: string;
  minStockLevel: string;
  unit: string;
  baseUnit: string;
  parentUnit: string;
  unitsPerParent: string;
  imageUrl: string;
  productGroup: string;
  variantName: string;
  isReturnable: boolean;
  isActive: boolean;
  isLoose: boolean;
  categoryId: string;
  supplierId: string;
  brandId: string;
}

function formatCurrency(val: number): string {
  if (isNaN(val)) return "Rs. 0";
  return `Rs. ${val.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatStock(
  qty: number,
  unit: string,
  parentUnit?: string | null,
  unitsPerParent?: number | null,
): string {
  const displayQty =
    qty % 1 === 0 ? qty.toString() : qty.toFixed(2).replace(/\.?0+$/, "");
  if (!parentUnit || !unitsPerParent || unitsPerParent <= 1) {
    return `${displayQty} ${unit}${qty !== 1 ? "s" : ""}`;
  }
  const parents = Math.floor(qty / unitsPerParent);
  const remainder = qty % unitsPerParent;
  if (parents === 0)
    return `${displayQty} ${unit}${remainder !== 1 ? "s" : ""}`;
  if (remainder === 0)
    return `${parents} ${parentUnit}${parents !== 1 ? "s" : ""}`;
  return `${parents} ${parentUnit}${parents !== 1 ? "s" : ""} ${remainder} ${unit}${remainder !== 1 ? "s" : ""}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const adjustmentTypeColors: Record<string, string> = {
  add: "text-success bg-success/10 border-success/25",
  remove: "text-destructive bg-destructive/10 border-destructive/25",
  set: "text-primary bg-primary/10 border-primary/30",
  damage: "text-warning bg-warning/10 border-warning/25",
  return: "text-info bg-info/10 border-info/25",
};

const tabs = [
  { id: "overview", label: "Overview", icon: Package },
  { id: "stock", label: "Stock & Batches", icon: History },
  { id: "variants", label: "Variants", icon: Layers },
  { id: "sales", label: "Sales History", icon: ShoppingCart },
  { id: "purchases", label: "Purchases", icon: Truck },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // FIX: Cast fetcher return to satisfy SWR strict types
  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR<ProductDetailResponse>(
    `/api/products/${id}`,
    (url: string) =>
      apiGet<ProductDetailResponse>(url) as Promise<ProductDetailResponse>,
  );

  const product = data?.product;
  const variants = data?.variants || [];
  const stockHistory = data?.stockHistory || [];
  const salesHistory = data?.salesHistory || [];
  const purchaseHistory = data?.purchaseHistory || [];

  const [activeTab, setActiveTab] = useState("overview");

  // Edit modal state
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<Partial<EditFormState>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Receive Stock modal state
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockForm, setStockForm] = useState({
    batchNumber: "",
    expiryDate: "",
    quantity: 0,
    costPrice: 0,
    reason: "Initial stock",
  });
  const [stockLoading, setStockLoading] = useState(false);

  // Quick settings
  const [settingsSaving, setSettingsSaving] = useState(false);

  // FIX: Pre-calculate dates to satisfy React 19 purity rules in render
  const today = new Date();
  const next30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  function openEdit() {
    if (!product) return;
    setEditForm({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || "",
      description: product.description || "",
      costPrice: String(product.costPrice),
      sellingPrice: String(product.sellingPrice),
      minStockLevel: String(product.minStockLevel),
      unit: product.unit,
      baseUnit: product.baseUnit,
      parentUnit: product.parentUnit || "",
      unitsPerParent: String(product.unitsPerParent || 1),
      imageUrl: product.imageUrl || "",
      productGroup: product.productGroup || "",
      variantName: product.variantName || "",
      isReturnable: product.isReturnable,
      isActive: product.isActive,
      isLoose: product.isLoose,
      categoryId: product.categoryId || "",
      supplierId: product.supplierId || "",
      brandId: product.brandId || "",
    });
    setEditError("");
    setShowEdit(true);
  }

  async function handleEditSubmit() {
    if (!editForm.name || !editForm.sku || !editForm.sellingPrice) {
      setEditError("Name, SKU and selling price are required");
      return;
    }
    setEditLoading(true);
    setEditError("");
    try {
      const payload = {
        ...editForm,
        costPrice: parseFloat(String(editForm.costPrice)) || 0,
        sellingPrice: parseFloat(String(editForm.sellingPrice)) || 0,
        minStockLevel: Number(editForm.minStockLevel) || 0,
        unitsPerParent: editForm.parentUnit
          ? Math.max(1, Number(editForm.unitsPerParent))
          : 1,
        brandId: editForm.brandId || null,
        categoryId: editForm.categoryId || null,
        supplierId: editForm.supplierId || null,
      };

      const updatedProduct = await apiPatch<Product>(
        `/api/products/${id}`,
        payload,
      );
      if (updatedProduct) {
        // FIX: Provide fallback arrays to satisfy the ProductDetailResponse type
        mutate(
          {
            product: updatedProduct,
            variants: data?.variants || [],
            stockHistory: data?.stockHistory || [],
            salesHistory: data?.salesHistory || [],
            purchaseHistory: data?.purchaseHistory || [],
          },
          false,
        );
      }
      toast.success("Product updated successfully");
      setShowEdit(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setEditLoading(false);
    }
  }

  async function toggleSetting(field: "isActive" | "isReturnable") {
    if (!product) return;
    setSettingsSaving(true);
    try {
      const updated = await apiPatch<Product>(`/api/products/${id}`, {
        [field]: !product[field],
      });
      if (updated) {
        // FIX: Provide fallback arrays to satisfy the ProductDetailResponse type
        mutate(
          {
            product: updated,
            variants: data?.variants || [],
            stockHistory: data?.stockHistory || [],
            salesHistory: data?.salesHistory || [],
            purchaseHistory: data?.purchaseHistory || [],
          },
          false,
        );
      }
      toast.success("Setting updated");
    } catch {
      toast.error("Failed to update setting");
    } finally {
      setSettingsSaving(false);
    }
  }

  function openReceiveStock() {
    if (!product) return;
    setStockForm({
      batchNumber: "",
      expiryDate: "",
      quantity: 0,
      costPrice: product.costPrice,
      reason: "Initial stock",
    });
    setShowStockModal(true);
  }

  async function handleReceiveStock() {
    if (stockForm.quantity <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    setStockLoading(true);
    try {
      await apiPost("/api/inventory/receive", { ...stockForm, productId: id });
      toast.success("Stock received successfully");
      setShowStockModal(false);
      mutate(); // Refresh all data
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to receive stock",
      );
    } finally {
      setStockLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="h-8 bg-muted rounded w-48 animate-pulse" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (fetchError || !product) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <button
          onClick={() => router.push("/inventory")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Inventory
        </button>
        <div className="bg-destructive/10 border border-destructive/25 rounded-xl p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-destructive/70 mx-auto mb-3" />
          <p className="text-destructive font-medium">
            {fetchError ? fetchError.message : "Product not found"}
          </p>
        </div>
      </div>
    );
  }

  const cost = Number(product.costPrice);
  const price = Number(product.sellingPrice);
  const margin = price - cost;
  const marginPercent = cost > 0 ? ((margin / cost) * 100).toFixed(1) : "0";

  const lowStock = product.totalStock <= product.minStockLevel;
  const outOfStock = product.totalStock === 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button
          onClick={() => router.push("/inventory")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition shrink-0"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Inventory
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold text-foreground truncate">
              {product.name}
            </h1>
            {!product.isActive && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium border border-border">
                Inactive
              </span>
            )}
            {product.variantName && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium border border-primary/20">
                {product.variantName}
              </span>
            )}
            {product.isLoose && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-info/10 text-info font-medium border border-purple-100">
                Loose Item
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-0.5 font-mono">
            {product.sku}
          </p>
        </div>
        <button
          onClick={openEdit}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-medium transition shrink-0"
        >
          <Pencil className="w-4 h-4" /> Edit Product
        </button>
      </div>

      {/* Hero Card */}
      <div className="bg-card rounded-2xl border border-border shadow-soft overflow-hidden">
        <div className="p-5 md:p-6 flex flex-col md:flex-row gap-6">
          {/* Image */}
          <div className="shrink-0">
            {/* FIX: Check if imageUrl exists AND is not just whitespace */}
            {product.imageUrl && product.imageUrl.trim() ? (
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-xl overflow-hidden border border-border bg-muted/40">
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  width={160}
                  height={160}
                  className="object-cover w-full h-full"
                />
              </div>
            ) : (
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-xl bg-muted flex items-center justify-center text-muted-foreground/70">
                <Package className="w-10 h-10" />
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/40 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Stock</p>
              <div className="flex items-center gap-2">
                <p
                  className={`text-lg font-bold ${outOfStock ? "text-destructive" : lowStock ? "text-warning" : "text-foreground"}`}
                >
                  {formatStock(
                    product.totalStock,
                    product.unit,
                    product.parentUnit,
                    product.unitsPerParent,
                  )}
                </p>
                {outOfStock && (
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                )}
              </div>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Min: {product.minStockLevel} {product.unit}s
              </p>
            </div>

            <div className="bg-muted/40 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Cost Price</p>
              <p className="text-lg font-bold text-foreground">
                {formatCurrency(product.costPrice)}
              </p>
            </div>

            <div className="bg-muted/40 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Selling Price</p>
              <p className="text-lg font-bold text-foreground">
                {formatCurrency(product.sellingPrice)}
              </p>
            </div>

            <div className="bg-muted/40 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Margin</p>
              <div className="flex items-center gap-1">
                <p className="text-lg font-bold text-foreground">
                  {formatCurrency(margin)}
                </p>
                <span className="text-xs text-muted-foreground">
                  ({marginPercent}%)
                </span>
              </div>
            </div>

            <div className="bg-muted/40 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Brand</p>
              <p className="text-sm font-medium text-foreground">
                {product.brand?.name ?? "—"}
              </p>
            </div>

            <div className="bg-muted/40 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Category</p>
              <p className="text-sm font-medium text-foreground">
                {product.category?.name ?? "—"}
              </p>
            </div>

            <div className="bg-muted/40 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Supplier</p>
              <p className="text-sm font-medium text-foreground">
                {product.supplier?.name ?? "—"}
              </p>
            </div>

            <div className="bg-muted/40 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Returnable</p>
              <p className="text-sm font-medium text-foreground">
                {product.isReturnable ? (
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Yes
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircle className="w-3.5 h-3.5" /> No
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card rounded-2xl border border-border shadow-soft overflow-hidden">
        <div className="border-b border-border overflow-x-auto">
          <div className="flex min-w-max">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition border-b-2 whitespace-nowrap ${
                    active
                      ? "border-primary text-primary bg-primary/10/50"
                      : "border-transparent text-muted-foreground hover:text-foreground/90 hover:bg-muted/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.id === "variants" && variants.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-muted text-muted-foreground text-xs rounded-md">
                      {variants.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5 md:p-6">
          {/* ─── Overview ─── */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {product.description && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    Description
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {product.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Product Details
                  </h3>
                  <div className="bg-muted/40 rounded-xl p-4 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Product Group</span>
                      <span className="font-medium text-foreground">
                        {product.productGroup ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Base Unit</span>
                      <span className="font-medium text-foreground">
                        {product.unit}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Parent Unit</span>
                      <span className="font-medium text-foreground">
                        {product.parentUnit ?? "—"}
                      </span>
                    </div>
                    {product.parentUnit && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Units per Parent</span>
                        <span className="font-medium text-foreground">
                          {product.unitsPerParent}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span className="font-medium text-foreground">
                        {formatDate(product.createdAt)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Updated</span>
                      <span className="font-medium text-foreground">
                        {formatDate(product.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Quick Stats
                  </h3>
                  <div className="bg-muted/40 rounded-xl p-4 space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Stock Value</span>
                      <span className="font-medium text-foreground">
                        {formatCurrency(product.costPrice * product.totalStock)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Potential Revenue</span>
                      <span className="font-medium text-foreground">
                        {formatCurrency(
                          product.sellingPrice * product.totalStock,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Potential Profit</span>
                      <span className="font-medium text-success">
                        {formatCurrency(margin * product.totalStock)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Stock & Batches ─── */}
          {activeTab === "stock" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Inventory Batches & Expiry
                </h3>
                <span className="text-xs text-muted-foreground/70">
                  {product.batches.length} batches
                </span>
              </div>

              {product.batches.length === 0 ? (
                <div className="text-center py-12 bg-muted/40 rounded-xl">
                  <Package className="w-8 h-8 text-border mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground/70">No batches in stock</p>
                  <p className="text-muted-foreground/70 text-sm mt-1">
                    Use &rdquo;Receive New Stock&ldquo; to add inventory
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border">
                      <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium">Batch #</th>
                        <th className="px-4 py-3 font-medium">Expiry Date</th>
                        <th className="px-4 py-3 font-medium text-right">
                          Qty
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          Cost Price
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {product.batches.map((batch) => {
                        // FIX: Use pre-calculated dates to satisfy React 19 purity rules
                        const isExpired = batch.expiryDate
                          ? new Date(batch.expiryDate) < today
                          : false;
                        const isExpiringSoon = batch.expiryDate
                          ? new Date(batch.expiryDate) < next30Days
                          : false;

                        return (
                          <tr
                            key={batch.id}
                            className="hover:bg-muted/50 transition"
                          >
                            <td className="px-4 py-3 font-medium text-foreground">
                              {batch.batchNumber || "—"}
                            </td>
                            <td className="px-4 py-3">
                              {batch.expiryDate ? (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    isExpired
                                      ? "bg-destructive/15 text-destructive"
                                      : isExpiringSoon
                                        ? "bg-warning/15 text-warning"
                                        : "bg-success/10 text-success"
                                  }`}
                                >
                                  {new Date(
                                    batch.expiryDate,
                                  ).toLocaleDateString("en-PK", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/70">No expiry</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-foreground/90">
                              {batch.quantity}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-foreground/90">
                              Rs. {batch.costPrice.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Stock Adjustment History */}
              <div className="mt-8 border-t border-border pt-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Stock Adjustment History
                </h3>
                {stockHistory.length === 0 ? (
                  <div className="text-center py-8 bg-muted/40 rounded-xl">
                    <History className="w-8 h-8 text-border mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground/70">
                      No stock adjustments yet
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b border-border">
                        <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider">
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Type</th>
                          <th className="px-4 py-3 font-medium text-right">
                            Qty
                          </th>
                          <th className="px-4 py-3 font-medium text-right">
                            Before → After
                          </th>
                          <th className="px-4 py-3 font-medium">Reason</th>
                          <th className="px-4 py-3 font-medium">User</th>
                          <th className="px-4 py-3 font-medium">Store</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {stockHistory.map((h) => (
                          <tr
                            key={h.id}
                            className="hover:bg-muted/50 transition"
                          >
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {formatDate(h.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border ${adjustmentTypeColors[h.type] || "text-muted-foreground bg-muted/40 border-border"}`}
                              >
                                {h.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-foreground/90">
                              {h.quantity > 0 ? "+" : ""}
                              {h.quantity}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-foreground/90">
                              {h.previousStock} → {h.newStock}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                              {h.reason ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {h.user?.email ?? "System"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {h.store?.name ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Variants ─── */}
          {activeTab === "variants" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Variants of &quot;{product.productGroup || product.name}&quot;
                </h3>
                <span className="text-xs text-muted-foreground/70">
                  {variants.length} variant(s)
                </span>
              </div>
              {variants.length === 0 ? (
                <div className="text-center py-12 bg-muted/40 rounded-xl">
                  <Layers className="w-8 h-8 text-border mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground/70">No variants found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {variants.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => router.push(`/inventory/${v.id}`)}
                      className="border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-soft transition cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        {v.imageUrl ? (
                          <Image
                            src={v.imageUrl}
                            alt={v.name}
                            width={48}
                            height={48}
                            className="rounded-lg object-cover w-12 h-12 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Package className="w-5 h-5 text-muted-foreground/70" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {v.name}
                          </p>
                          <p className="text-xs text-primary font-medium">
                            {v.variantName ?? "Default"}
                          </p>
                          <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                            {v.sku}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm font-semibold text-foreground">
                              {formatCurrency(v.sellingPrice)}
                            </span>
                            <span
                              className={`text-xs font-medium ${v.totalStock <= 0 ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              {v.totalStock} in stock
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Sales History ─── */}
          {activeTab === "sales" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Recent Sales
                </h3>
                <span className="text-xs text-muted-foreground/70">
                  {salesHistory.length} records
                </span>
              </div>
              {salesHistory.length === 0 ? (
                <div className="text-center py-12 bg-muted/40 rounded-xl">
                  <ShoppingCart className="w-8 h-8 text-border mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground/70">No sales yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border">
                      <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Sale #</th>
                        <th className="px-4 py-3 font-medium">Customer</th>
                        <th className="px-4 py-3 font-medium text-right">
                          Qty
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          Unit Price
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          Total
                        </th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {salesHistory.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/50 transition">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {/* FIX: Use the parent sale's saleDate for accurate formatting */}
                            {formatDate(s.sale?.saleDate || s.createdAt)}
                          </td>
                          <td className="px-4 py-3 font-mono text-foreground/90">
                            {s.sale?.saleNumber ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-foreground/90">
                            {s.sale?.customerName ?? "Walk-in"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-foreground/90">
                            {s.quantity}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-foreground/90">
                            {formatCurrency(s.unitPrice)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
                            {formatCurrency(s.total)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                                s.sale?.status === "completed"
                                  ? "bg-success/10 text-success border-success/25"
                                  : s.sale?.status === "cancelled"
                                    ? "bg-destructive/10 text-destructive border-destructive/25"
                                    : "bg-warning/10 text-warning border-warning/25"
                              }`}
                            >
                              {s.sale?.status ?? "unknown"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── Purchase History ─── */}
          {activeTab === "purchases" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Recent Purchases
                </h3>
                <span className="text-xs text-muted-foreground/70">
                  {purchaseHistory.length} records
                </span>
              </div>
              {purchaseHistory.length === 0 ? (
                <div className="text-center py-12 bg-muted/40 rounded-xl">
                  <Truck className="w-8 h-8 text-border mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground/70">
                    No purchase orders yet
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border">
                      <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">PO #</th>
                        <th className="px-4 py-3 font-medium">Supplier</th>
                        <th className="px-4 py-3 font-medium text-right">
                          Ordered
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          Received
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          Unit Cost
                        </th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {purchaseHistory.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/50 transition">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {formatDate(p.createdAt)}
                          </td>
                          <td className="px-4 py-3 font-mono text-foreground/90">
                            {p.purchaseOrder?.orderNumber ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-foreground/90">
                            {p.purchaseOrder?.supplier?.name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-foreground/90">
                            {p.quantity}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-foreground/90">
                            {p.receivedQty}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-foreground/90">
                            {formatCurrency(p.unitCost)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                                p.purchaseOrder?.status === "received"
                                  ? "bg-success/10 text-success border-success/25"
                                  : p.purchaseOrder?.status === "cancelled"
                                    ? "bg-destructive/10 text-destructive border-destructive/25"
                                    : "bg-primary/10 text-primary border-primary/30"
                              }`}
                            >
                              {p.purchaseOrder?.status ?? "unknown"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── Settings ─── */}
          {activeTab === "settings" && (
            <div className="space-y-6 max-w-lg">
              <h3 className="text-sm font-semibold text-foreground">
                Quick Actions
              </h3>

              <div className="space-y-4">
                {/* Receive Stock Button */}
                <div className="p-4 bg-muted/40 rounded-xl space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Inventory Management
                  </p>
                  <button
                    onClick={openReceiveStock}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-success hover:bg-success/90 text-success-foreground rounded-lg text-sm font-medium transition"
                  >
                    <PackagePlus className="w-4 h-4" /> Receive New Stock
                  </button>
                  <p className="text-xs text-muted-foreground/70">
                    Use this to add new batches, track expiry dates, and update
                    cost prices.
                  </p>
                </div>

                {/* Active Toggle */}
                <div className="flex items-center justify-between p-4 bg-muted/40 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Product Status
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {product.isActive
                        ? "Visible in POS and inventory"
                        : "Hidden from all operations"}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleSetting("isActive")}
                    disabled={settingsSaving}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${product.isActive ? "bg-primary" : "bg-muted/70"} ${settingsSaving ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-card transition ${product.isActive ? "translate-x-6" : "translate-x-1"}`}
                    />
                  </button>
                </div>

                {/* Returnable Toggle */}
                <div className="flex items-center justify-between p-4 bg-muted/40 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Returnable
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {product.isReturnable
                        ? "Can be returned by customers"
                        : "Non-returnable item"}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleSetting("isReturnable")}
                    disabled={settingsSaving}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${product.isReturnable ? "bg-primary" : "bg-muted/70"} ${settingsSaving ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-card transition ${product.isReturnable ? "translate-x-6" : "translate-x-1"}`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Edit Modal ─── */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
              <h2 className="text-lg font-semibold text-foreground">
                Edit Product
              </h2>
              <button
                onClick={() => setShowEdit(false)}
                aria-label="Close edit product dialog"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Product Image
                </label>
                <ImageUpload
                  value={String(editForm.imageUrl ?? "")}
                  onChange={(url) =>
                    setEditForm((f) => ({ ...f, imageUrl: url }))
                  }
                  onClear={() => setEditForm((f) => ({ ...f, imageUrl: "" }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
                    value={String(editForm.name ?? "")}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    SKU *
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
                    value={String(editForm.sku ?? "")}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, sku: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    Cost Price (Rs.) *
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
                    value={String(editForm.costPrice ?? "")}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, costPrice: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    Selling Price (Rs.) *
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
                    value={String(editForm.sellingPrice ?? "")}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        sellingPrice: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    Base Unit
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
                    value={String(editForm.unit ?? "")}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, unit: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    Parent Unit
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
                    value={String(editForm.parentUnit ?? "")}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, parentUnit: e.target.value }))
                    }
                  />
                </div>
              </div>

              {editForm.parentUnit && (
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-1">
                    Units Per {editForm.parentUnit}
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
                    value={String(editForm.unitsPerParent ?? 1)}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        unitsPerParent: e.target.value,
                      }))
                    }
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1">
                  Description
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400 resize-none"
                  rows={3}
                  value={String(editForm.description ?? "")}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>

              {editError && (
                <p className="text-destructive text-sm bg-destructive/10 p-2 rounded-lg">
                  {editError}
                </p>
              )}
            </div>

            <div className="p-5 border-t border-border flex gap-3 justify-end sticky bottom-0 bg-card">
              <button
                onClick={() => setShowEdit(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSubmit}
                disabled={editLoading}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg font-medium transition"
              >
                {editLoading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </span>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Receive Stock Modal ─── */}
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
                  step="0.001"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-primary-400"
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
                    setStockForm((f) => ({
                      ...f,
                      costPrice: Number(e.target.value),
                    }))
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
    </div>
  );
}
