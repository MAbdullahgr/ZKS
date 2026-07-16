// Local-dev mock of Cloudinary. The real module uploads to Cloudinary; this
// stub returns the incoming base64 data URL directly so image/document
// uploads work end-to-end without external credentials. The exported API is
// identical to the real module, so no caller changes are required.

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const PRIVATE_FOLDERS = new Set(["employee-documents"]);

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  isPrivate: boolean;
}

export async function uploadToCloudinary(
  base64File: string,
  folder: string = "zkr-uploads",
): Promise<CloudinaryUploadResult> {
  const base64Data = base64File.includes(",")
    ? base64File.split(",")[1]
    : base64File;
  const approxBytes = Math.ceil((base64Data.length * 3) / 4);
  if (approxBytes > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File too large. Maximum upload size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }

  // Return the data URL directly — displays inline, no network call.
  const isPrivate = PRIVATE_FOLDERS.has(folder);
  return {
    secure_url: base64File.startsWith("data:")
      ? base64File
      : `data:image/png;base64,${base64Data}`,
    public_id: `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}`,
    isPrivate,
  };
}

export function getSignedUrl(
  _publicId: string,
  _resourceType: "image" | "raw" = "image",
  _expiresInSeconds: number = 3600,
): string {
  // No signing needed in local mode — assets are inline data URLs.
  return "";
}

export async function deleteFromCloudinary(_publicId: string): Promise<boolean> {
  return true;
}

export function resolveAssetUrl(
  _publicId: string | null | undefined,
  secureUrl: string,
  _folder: string,
  _resourceType: "image" | "raw" = "image",
): string {
  return secureUrl;
}

// Default export kept for backwards compat with `import cloudinary from
// "@/lib/cloudinary"`. Assigned to a variable first to satisfy the
// import/no-anonymous-default-export lint rule.
const cloudinaryMock = {
  config: () => {},
  uploader: { upload: () => {}, destroy: () => {} },
  utils: { private_download_url: () => "" },
};
export default cloudinaryMock;
