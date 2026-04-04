import { HttpError } from "../domain/errors/http-error.js";
import type { ProductCatalogPort } from "../domain/ports/product-catalog.port.js";
import type { ProductRepositoryPort } from "../domain/ports/product.repository.port.js";

/**
 * Baja lógica: desactiva en base de datos y archiva el producto en el catálogo de pagos.
 */
export class DeleteProductUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly catalog: ProductCatalogPort,
  ) {}

  async execute(productId: string): Promise<void> {
    const existing = await this.products.findById(productId);
    if (!existing) {
      throw new HttpError("Producto no encontrado", 404, "not_found");
    }
    if (existing.stripeProductId) {
      await this.catalog.archiveListedProduct(existing.stripeProductId);
    }
    await this.products.updateById(productId, {
      isActive: false,
      updatedAt: new Date(),
    });
  }
}
