import type { ProductImage, ProductWithImages } from "../domain/entities/product.entity.js";
import { HttpError } from "../domain/errors/http-error.js";
import type { ObjectStoragePort } from "../domain/ports/object-storage.port.js";
import type { ProductCatalogPort } from "../domain/ports/product-catalog.port.js";
import type { ProductRepositoryPort } from "../domain/ports/product.repository.port.js";

function orderedStripeUrls(images: ProductImage[]): string[] {
  const sorted = [...images].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
  return sorted.map((i) => i.url).slice(0, 8);
}

export class DeleteProductImageUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly storage: ObjectStoragePort,
    private readonly catalog: ProductCatalogPort,
  ) {}

  async execute(productId: string, imageId: string): Promise<ProductWithImages> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new HttpError("Producto no encontrado", 404, "not_found");
    }

    const images = await this.products.listImagesByProductId(productId);
    const target = images.find((i) => i.id === imageId);
    if (!target) {
      throw new HttpError("Imagen no encontrada", 404, "image_not_found");
    }

    const removed = await this.products.deleteImage(productId, imageId);
    if (!removed) {
      throw new HttpError("Imagen no encontrada", 404, "image_not_found");
    }

    if (target.objectKey) {
      try {
        await this.storage.deleteObject(target.objectKey);
      } catch {
        // El objeto podría no existir; la fila ya se eliminó.
      }
    }

    let remaining = await this.products.listImagesByProductId(productId);
    if (target.isMain && remaining.length > 0) {
      const promoted = [...remaining].sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (promoted) {
        await this.products.setPrimaryImage(productId, promoted.id);
        remaining = await this.products.listImagesByProductId(productId);
      }
    }

    await this.products.updateById(productId, { updatedAt: new Date() });

    if (product.stripeProductId) {
      await this.catalog.updateListedProduct({
        externalProductId: product.stripeProductId,
        imageUrls: orderedStripeUrls(remaining),
      });
    }

    const full = await this.products.findByIdWithImages(productId);
    if (!full) throw new HttpError("Producto no encontrado", 404, "not_found");
    return full;
  }
}
