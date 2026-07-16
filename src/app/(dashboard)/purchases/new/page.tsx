"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle,
  FileText,
  Calendar,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ProductSearchInput from "@/components/ui/ProductSearchInput";

interface Supplier {
  id: string;
  name: string;
}

interface OrderItem {
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitCost: number;
  unit: string;
}

export default function NewPurchasePage() {
  const router = useRouter();
  // FIX P3-8: Get globalMutate at component level so we can invalidate the
  // purchases list SWR cache after creating a new PO.
  const { mutate: globalMutate } = useSWRConfig();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    supplierId: "",
    expectedDate: "",
    notes: "",
  });

  const [items, setItems] = useState<OrderItem[]>([
    {
      productId: "",
      productName: "",
      productSku: "",
      quantity: 1,
      unitCost: 0,
      unit: "pieces",
    },
  ]);

  // FIX: Use SWR for suppliers
  const { data: suppliersData } = useSWR<{ suppliers: Supplier[] }>(
    "/api/suppliers",
    (url: string) =>
      apiGet<{ suppliers: Supplier[] }>(url) as Promise<{
        suppliers: Supplier[];
      }>,
  );
  const suppliers = suppliersData?.suppliers || [];

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        productId: "",
        productName: "",
        productSku: "",
        quantity: 1,
        unitCost: 0,
        unit: "pieces",
      },
    ]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, updates: Partial<OrderItem>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    );
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  async function handleSubmit() {
    if (!form.supplierId) {
      setError("Select a vendor");
      return;
    }
    if (items.some((i) => !i.productId)) {
      setError("Select product for all lines");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const payload = {
        ...form,
        expectedDate: form.expectedDate
          ? new Date(form.expectedDate).toISOString()
          : null,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitCost: i.unitCost,
        })),
      };

      // FIX: Use apiPost and extract nested 'order' object
      const data = await apiPost<{ order: { id: string } }>(
        "/api/purchases",
        payload,
      );
      toast.success("Purchase order created successfully");
      // FIX P3-8: Invalidate the purchases list SWR cache so the new PO
      // appears when the user navigates back.
      await globalMutate("/api/purchases");
      await globalMutate((key) => typeof key === "string" && key.startsWith("/api/purchases?"));
      router.push(`/purchases/${data?.order.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen animate-fade-in">
      {/* Header */}
      <div className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <button
            onClick={() => router.push("/purchases")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Purchases
          </button>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary ring-1 ring-primary/15 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-foreground">New RFQ</h1>
                <p className="text-sm text-muted-foreground">Request for Quotation</p>
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-semibold transition shadow-soft hover:shadow-soft-lg shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {loading ? "Saving..." : "Save & Confirm"}
            </button>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Vendor & Info */}
        <div className="bg-card rounded-xl border border-border shadow-soft p-5 space-y-4">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Vendor & Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
                Vendor *
              </label>
              <SearchableSelect
                options={suppliers}
                value={form.supplierId}
                onChange={(val) => setForm((f) => ({ ...f, supplierId: val }))}
                placeholder="Search vendor..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
                Expected Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  className="w-full pl-9 pr-4 py-2.5 border border-input rounded-xl bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
                  value={form.expectedDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expectedDate: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5 uppercase tracking-wider">
              Terms & Notes
            </label>
            <textarea
              className="w-full px-3 py-2 border border-input rounded-xl bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 resize-none transition"
              rows={3}
              placeholder="Payment terms, delivery instructions..."
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Order Lines */}
        <div className="bg-card rounded-xl border border-border shadow-soft p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Order Lines
            </h3>
            <button
              onClick={addItem}
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition"
            >
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <OrderLineRow
                key={index}
                item={item}
                onUpdate={(updates) => updateItem(index, updates)}
                onRemove={() => removeItem(index)}
                canRemove={items.length > 1}
              />
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-border pt-4">
            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Untaxed Amount</span>
                  <span className="font-medium text-foreground">
                    Rs. {total.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxes</span>
                  <span className="font-medium text-foreground">Rs. 0</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="text-base font-semibold text-foreground">
                    Total
                  </span>
                  <span className="text-base font-bold text-foreground">
                    Rs. {total.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-xl border border-destructive/20">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Order Line Row ───────────────────────────────────────────────

function OrderLineRow({
  item,
  onUpdate,
  onRemove,
  canRemove,
}: {
  item: OrderItem;
  onUpdate: (u: Partial<OrderItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start bg-muted/40 rounded-xl p-3 relative border border-border">
      {/* Product Search - Replaced with clean component */}
      <div className="md:col-span-5">
        <label className="text-xs text-muted-foreground mb-1 block uppercase tracking-wider">Product</label>
        <ProductSearchInput
          selectedProduct={
            item.productId
              ? {
                  id: item.productId,
                  name: item.productName,
                  sku: item.productSku,
                  unit: item.unit,
                }
              : null
          }
          onSelect={(p) =>
            onUpdate({
              productId: p.id,
              productName: p.name,
              productSku: p.sku,
              unitCost: p.costPrice,
              unit: p.unit,
            })
          }
          onClear={() =>
            onUpdate({
              productId: "",
              productName: "",
              productSku: "",
              quantity: 1,
              unitCost: 0,
              unit: "pieces",
            })
          }
        />
      </div>

      {/* Qty */}
      <div className="md:col-span-2">
        <label className="text-xs text-muted-foreground mb-1 block uppercase tracking-wider">Qty</label>
        <input
          type="number"
          min={1}
          step="0.001"
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 text-center transition"
          value={item.quantity}
          onChange={(e) =>
            onUpdate({ quantity: parseFloat(e.target.value) || 1 })
          }
        />
      </div>

      {/* Unit Cost */}
      <div className="md:col-span-3">
        <label className="text-xs text-muted-foreground mb-1 block uppercase tracking-wider">
          Unit Cost (Rs.)
        </label>
        <input
          type="number"
          min={0}
          step="0.01"
          className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition"
          value={item.unitCost}
          onChange={(e) =>
            onUpdate({ unitCost: parseFloat(e.target.value) || 0 })
          }
        />
      </div>

      {/* Line Total */}
      <div className="md:col-span-1">
        <label className="text-xs text-muted-foreground mb-1 block uppercase tracking-wider">Total</label>
        <p className="text-sm font-semibold text-foreground py-2">
          Rs. {(item.quantity * item.unitCost).toLocaleString()}
        </p>
      </div>

      {/* Remove */}
      <div className="md:col-span-1 flex justify-end md:pt-6">
        {canRemove && (
          <button
            onClick={onRemove}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
            type="button"
            aria-label="Remove product line"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
