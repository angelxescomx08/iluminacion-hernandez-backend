import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type {
  ObjectStoragePort,
  UploadPublicObjectInput,
} from "../../domain/ports/object-storage.port.js";

function joinPublicUrl(baseUrl: string, key: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const path = key.replace(/^\/+/, "");
  return `${base}/${path}`;
}

export type S3ObjectStorageOptions = {
  region: string;
  bucket: string;
  publicBaseUrl: string;
  /** Opcional: prefijo del endpoint S3 si no usas dominio público personalizado. */
  endpoint?: string;
};

export class S3ObjectStorageAdapter implements ObjectStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(options: S3ObjectStorageOptions) {
    this.bucket = options.bucket;
    this.publicBaseUrl = options.publicBaseUrl;
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint, forcePathStyle: true } : {}),
    });
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
    return { publicUrl: joinPublicUrl(this.publicBaseUrl, input.key) };
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
