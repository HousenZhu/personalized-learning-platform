// Alias for compatibility with existing imports
export { uploadToS3 as uploadFile };
// src/lib/storage.ts
// Local file storage implementation (no cloud dependency)
import AWS from "aws-sdk";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";

const S3_BUCKET = process.env.AWS_S3_BUCKET || "your-bucket-name";
const S3_REGION = process.env.AWS_S3_REGION || "us-east-1";
const S3_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID || "";
const S3_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY || "";

const s3 = new AWS.S3({
  region: S3_REGION,
  accessKeyId: S3_ACCESS_KEY,
  secretAccessKey: S3_SECRET_KEY,
});

export type UploadFolder =
  | "courses"
  | "assignments"
  | "submissions"
  | "certificates"
  | "profiles";

interface UploadResult {
  url: string;
  key: string;
}

/**
 * Ensure upload directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}


// Upload a file to S3
export async function uploadToS3(
  file: Buffer,
  filename: string,
  folder: UploadFolder,
  contentType: string
): Promise<UploadResult> {
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const key = `${folder}/${Date.now()}-${safeName}`;

  await s3
    .putObject({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file,
      ContentType: contentType,
      // ACL: "public-read", // Removed for buckets with ACLs disabled
    })
    .promise();

  const url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
  return { url, key };
}

// Delete a file from S3
export async function deleteFromS3(key: string): Promise<void> {
  try {
    await s3
      .deleteObject({
        Bucket: S3_BUCKET,
        Key: key,
      })
      .promise();
  } catch (error) {
    console.warn(`Failed to delete file: ${key}`, error);
  }
}

// Get a file from S3
export async function getFromS3(key: string): Promise<Buffer | null> {
  try {
    const data = await s3
      .getObject({
        Bucket: S3_BUCKET,
        Key: key,
      })
      .promise();
    return data.Body as Buffer;
  } catch {
    return null;
  }
}

/**
 * Get the public URL for a file
 */
export function getPublicUrl(key: string): string {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

/**
 * Extract the key from a URL
 */
export function extractKeyFromUrl(url: string): string | null {
  if (url.startsWith("/uploads/")) {
    return url.replace("/uploads/", "");
  }
  return null;
}

/**
 * Validate file type based on MIME type
 */
export function validateMimeType(
  mimeType: string,
  allowedTypes: string[]
): boolean {
  return allowedTypes.some((type) => {
    if (type.endsWith("/*")) {
      return mimeType.startsWith(type.replace("/*", "/"));
    }
    return mimeType === type;
  });
}

// Allowed MIME types
export const ALLOWED_DOCUMENT_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export const ALLOWED_VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"];

export const ALLOWED_SUBMISSION_MIMES = [
  ...ALLOWED_DOCUMENT_MIMES,
  ...ALLOWED_IMAGE_MIMES,
];

export const ALLOWED_CONTENT_MIMES = [
  ...ALLOWED_DOCUMENT_MIMES,
  ...ALLOWED_IMAGE_MIMES,
  ...ALLOWED_VIDEO_MIMES,
];
