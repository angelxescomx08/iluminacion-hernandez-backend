import type { ProductImage, ProductWithImages } from "../domain/entities/product.entity.js";
import { HttpError } from "../domain/errors/http-error.js";
import type { ProductCatalogPort } from "../domain/ports/product-catalog.port.js";
import type { ProductRepositoryPort } from "../domain/ports/product.repository.port.js";

function orderedStripeUrls(images: ProductImage[]): string[] {
  const sorted = [...images].sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
  return sorted.map((i) => i.url).slice(0, 8);
}

export class SetMainProductImageUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly catalog: ProductCatalogPort,
  ) {}

  async execute(productId: string, imageId: string): Promise<ProductWithImages> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new HttpError("Producto no encontrado", 404, "not_found");
    }
    const images = await this.products.listImagesByProductId(productId);
    if (!images.some((i) => i.id === imageId)) {
      throw new HttpError("Imagen no encontrada", 404, "image_not_found");
    }

    await this.products.setPrimaryImage(productId, imageId);
    await this.products.updateById(productId, { updatedAt: new Date() });

    if (product.stripeProductId) {
      const next = await this.products.listImagesByProductId(productId);
      await this.catalog.updateListedProduct({
        externalProductId: product.stripeProductId,
        imageUrls: orderedStripeUrls(next),
      });
    }

    const full = await this.products.findByIdWithImages(productId);
    if (!full) throw new HttpError("Producto no encontrado", 404, "not_found");
    return full;
  }
}
