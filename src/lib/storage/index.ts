import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/config/env";
import { signPayload } from "@/lib/security/crypto";

/**
 * Object storage abstraction. `s3` works with AWS S3 and Cloudflare R2 (S3-compatible);
 * `local` stores files on disk for development and single-node deployments.
 * Uploads always go directly from the browser to storage via short-lived signed URLs.
 */
export interface SignedUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface StorageDriver {
  createSignedUpload(key: string, contentType: string, size: number): Promise<SignedUpload>;
  read(key: string): Promise<Buffer>;
  size(key: string): Promise<number | null>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
  /** Server-side write (used by seeding and processing). */
  write(key: string, body: Buffer, contentType: string): Promise<void>;
}

export const UPLOAD_URL_TTL = 10 * 60;

export function assertSafeKey(key: string) {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,255}$/i.test(key) || key.includes("..") || key.startsWith("/")) throw new Error("Unsafe storage key");
}

function cdnOr(defaultUrl: string, key: string) {
  const cdn = env().CDN_URL;
  return cdn ? `${cdn.replace(/\/$/, "")}/${key}` : defaultUrl;
}

class LocalDriver implements StorageDriver {
  private root = path.resolve(env().STORAGE_LOCAL_DIR);

  private file(key: string) {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Path traversal blocked");
    return full;
  }

  async createSignedUpload(key: string, contentType: string, size: number): Promise<SignedUpload> {
    assertSafeKey(key);
    const token = signPayload({ key, contentType, size }, env().AUTH_SECRET, UPLOAD_URL_TTL);
    return { url: `/api/uploads/local?token=${encodeURIComponent(token)}`, method: "PUT", headers: { "content-type": contentType } };
  }

  async write(key: string, body: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }

  async read(key: string) {
    return readFile(this.file(key));
  }

  async size(key: string) {
    try {
      return (await stat(this.file(key))).size;
    } catch {
      return null;
    }
  }

  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }

  publicUrl(key: string) {
    return cdnOr(`/media/${key}`, key);
  }
}

class S3Driver implements StorageDriver {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const e = env();
    if (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) throw new Error("S3 storage is not configured");
    this.bucket = e.S3_BUCKET;
    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: !!e.S3_ENDPOINT,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
  }

  async createSignedUpload(key: string, contentType: string, size: number): Promise<SignedUpload> {
    assertSafeKey(key);
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: size, CacheControl: "public, max-age=31536000, immutable" });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: UPLOAD_URL_TTL, signableHeaders: new Set(["content-type", "content-length"]) });
    return { url, method: "PUT", headers: { "content-type": contentType } };
  }

  async write(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
  }

  async read(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async size(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  publicUrl(key: string) {
    const e = env();
    return cdnOr(e.S3_PUBLIC_URL ? `${e.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}` : `https://${this.bucket}.s3.amazonaws.com/${key}`, key);
  }
}

let driver: StorageDriver | undefined;
export function storage(): StorageDriver {
  driver ??= env().STORAGE_DRIVER === "s3" ? new S3Driver() : new LocalDriver();
  return driver;
}
