import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type {
  ObjectStoragePort,
  UploadPublicObjectInput,
} from "../../domain/ports/object-storage.port.js";

/** Codifica cada segmento del key para usarlo en el path de una URL. */
function encodeObjectKeySegments(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function joinExplicitBase(baseUrl: string, key: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const path = key.replace(/^\/+/, "");
  return `${base}/${encodeObjectKeySegments(path)}`;
}

function deriveAwsVirtualHostedUrl(bucket: string, region: string, key: string): string {
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  return `https://${host}/${encodeObjectKeySegments(key)}`;
}

/** MinIO u otro S3-compatible con `forcePathStyle` y mismo host para API y lectura pública. */
function derivePathStyleUrl(endpoint: string, bucket: string, key: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/${bucket}/${encodeObjectKeySegments(key)}`;
}

export type S3ObjectStorageOptions = {
  region: string;
  bucket: string;
  /**
   * Opcional. Si no se define, la URL pública se construye:
   * - Con `endpoint` (MinIO, etc.): `{endpoint}/{bucket}/{key}`.
   * - Sin `endpoint` (AWS): `https://{bucket}.s3.{region}.amazonaws.com/{key}`.
   * Úsala para CloudFront u otro dominio público distinto del del bucket.
   */
  publicBaseUrl?: string;
  endpoint?: string;
};

export class S3ObjectStorageAdapter implements ObjectStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly explicitPublicBaseUrl: string | undefined;
  private readonly endpoint: string | undefined;

  constructor(options: S3ObjectStorageOptions) {
    this.bucket = options.bucket;
    this.region = options.region;
    this.explicitPublicBaseUrl = options.publicBaseUrl?.trim() || undefined;
    this.endpoint = options.endpoint?.trim() || undefined;
    this.client = new S3Client({
      region: options.region,
      ...(this.endpoint ? { endpoint: this.endpoint, forcePathStyle: true } : {}),
    });
  }

  private resolvePublicUrl(key: string): string {
    if (this.explicitPublicBaseUrl) {
      return joinExplicitBase(this.explicitPublicBaseUrl, key);
    }
    if (this.endpoint) {
      return derivePathStyleUrl(this.endpoint, this.bucket, key);
    }
    return deriveAwsVirtualHostedUrl(this.bucket, this.region, key);
  }

  async uploadPublicObject(input: UploadPublicObjectInput): Promise<{ publicUrl: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ...(input.cacheControl ? { CacheControl: input.cacheControl } : {}),
      }),
    );
    return { publicUrl: this.resolvePublicUrl(input.key) };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
