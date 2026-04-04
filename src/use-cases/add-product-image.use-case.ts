import { randomUUID } from "node:crypto";
import type { ProductImage, ProductWithImages } from "../domain/entities/product.entity.js";
import { HttpError } from "../domain/errors/http-error.js";
import type { ObjectStoragePort } from "../domain/ports/object-storage.port.js";
import type { ProductCatalogPort } from "../domain/ports/product-catalog.port.js";
import type { ProductRepositoryPort } from "../domain/ports/product.repository.port.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

function orderedStripeUrls(images: ProductImage[]): string[] {
  const sorted = [...images].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
  return sorted.map((i) => i.url).slice(0, 8);
}

export type AddProductImageInput = {
  productId: string;
  buffer: Buffer;
  mimeType: string;
};

export class AddProductImageUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly storage: ObjectStoragePort,
    private readonly catalog: ProductCatalogPort,
  ) {}

  async execute(input: AddProductImageInput): Promise<ProductWithImages> {
    const normalizedMime = input.mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
    if (!ALLOWED_MIME.has(normalizedMime)) {
      throw new HttpError("Tipo de imagen no permitido (JPEG, PNG o WebP)", 400, "invalid_image_type");
    }

    const product = await this.products.findById(input.productId);
    if (!product) {
      throw new HttpError("Producto no encontrado", 404, "not_found");
    }
    if (!product.stripeProductId) {
      throw new HttpError("Producto sin vínculo de catálogo externo", 409, "missing_stripe");
    }

    const imageId = randomUUID();
    const ext = extensionForMime(normalizedMime);
    const objectKey = `products/${input.productId}/${imageId}.${ext}`;
    const { publicUrl } = await this.storage.uploadPublicObject({
      key: objectKey,
      body: input.buffer,
      contentType: normalizedMime,
      cacheControl: "public, max-age=31536000, immutable",
    });

    const existing = await this.products.listImagesByProductId(input.productId);
    const sortOrder = await this.products.nextImageSortOrder(input.productId);
    const isMain = existing.length === 0;

    const row: ProductImage = {
      id: imageId,
      productId: input.productId,
      url: publicUrl,
      objectKey,
      isMain,
      sortOrder,
    };
    await this.products.insertImage(row);
    await this.products.updateById(input.productId, { updatedAt: new Date() });

    const images = await this.products.listImagesByProductId(input.productId);
    await this.catalog.updateListedProduct({
      externalProductId: product.stripeProductId,
      imageUrls: orderedStripeUrls(images),
    });

    const full = await this.products.findByIdWithImages(input.productId);
    if (!full) throw new HttpError("Producto no encontrado", 404, "not_found");
    return full;
  }
}
