"use client";

import { useState } from "react";
import { X, Download, Upload, Loader2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/fetcher";
import { toast } from "sonner";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: "products" | "customers" | "suppliers";
  fields: { key: string; label: string }[];
  filterUrl?: string;
}

export default function ExportModal({
  isOpen,
  onClose,
  entityType,
  fields,
  filterUrl = "",
}: ExportModalProps) {
  const [selectedFields, setSelectedFields] = useState<string[]>(
    fields.map((f) => f.key),
  );
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  if (!isOpen) return null;

  const toggleField = (key: string) => {
    if (key === "id") return;
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key],
    );
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const apiUrl = `/api/${entityType}/export?fields=${selectedFields.join(",")}${filterUrl ? `&${filterUrl}` : ""}`;
      const data =
        await apiGet<Record<string, string | number | boolean | null>[]>(
          apiUrl,
        );

      if (!data) {
        toast.error("Export failed: No data received.");
        setExporting(false);
        return;
      }

      const headers = selectedFields;

      // FIX: Bulletproof CSV cell escaper
      const escapeCell = (val: unknown) => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        // If the string contains a comma, double quote, or newline, it must be enclosed in quotes
        if (
          str.includes(",") ||
          str.includes('"') ||
          str.includes("\n") ||
          str.includes("\r")
        ) {
          // Escape internal double quotes by doubling them
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvRows = [
        headers.map(escapeCell).join(","),
        ...data.map((row) =>
          headers.map((header) => escapeCell(row[header])).join(","),
        ),
      ].join("\n");

      // FIX: Add UTF-8 BOM (\uFEFF) so Excel opens it as a clean, formatted table instantly
      const blob = new Blob(["\uFEFF" + csvRows], {
        type: "text/csv;charset=utf-8;",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", `${entityType}_export.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Export successful!");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((line) => line.trim() !== "");
      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/"/g, ""));

      const jsonData = lines.slice(1).map((line) => {
        const values =
          line.match(/("([^"]|"")*"|[^,]*)(?:,|$)/g)?.map((v) =>
            v
              .replace(/(^,|,$)/, "")
              .replace(/^"|"$/g, "")
              .replace(/""/g, '"'),
          ) || [];
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = values[i] || "";
        });
        return obj;
      });

      await apiPost(`/api/${entityType}/import`, { data: jsonData });
      toast.success(`Successfully imported ${jsonData.length} records`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (e.target) e.target.value = "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Export / Import Data
          </h2>
          <button
            onClick={onClose}
            aria-label="Close export dialog"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Select the fields you want to export. The{" "}
            <span className="font-mono bg-muted px-1 rounded">id</span> field
            is included automatically so you can update existing records by
            importing the file back.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-60 overflow-y-auto p-2 border border-border rounded-lg">
            {fields.map((field) => (
              <label
                key={field.key}
                className="flex items-center gap-2 cursor-pointer p-2 hover:bg-muted/50 rounded-md"
              >
                <input
                  type="checkbox"
                  checked={selectedFields.includes(field.key)}
                  onChange={() => toggleField(field.key)}
                  disabled={field.key === "id"}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-ring500"
                />
                <span className="text-sm text-foreground/90">{field.label}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-soft disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Export to CSV
            </button>

            <label className="flex-1 flex items-center justify-center gap-2 bg-success hover:bg-success/90 text-success-foreground px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-soft cursor-pointer">
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Import from CSV
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImport}
                disabled={importing}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
