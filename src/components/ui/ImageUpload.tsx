"use client";

import { useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import Image from "next/image";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  onClear?: () => void;
}

export default function ImageUpload({
  value,
  onChange,
  onClear,
}: ImageUploadProps) {
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      // FIX: Safely unwrap the data object
      if (data.success && data.data) {
        onChange(data.data.url);
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setLoading(false);
      // Clear the input so the same file can be selected again
      if (e.target) e.target.value = "";
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center shrink-0">
        {value ? (
          <Image
            src={value}
            alt="Uploaded image"
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="text-muted-foreground text-xs text-center px-2">No image</div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent transition w-fit">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          <span>{loading ? "Uploading..." : "Upload Image"}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
            disabled={loading}
          />
        </label>

        {value && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-9 w-9 items-center justify-center gap-1 text-xs text-destructive hover:text-destructive/80 transition"
          >
            <X className="w-3 h-3" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
