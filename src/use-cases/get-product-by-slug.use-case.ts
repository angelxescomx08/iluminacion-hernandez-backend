import type { ProductWithImages } from "../domain/entities/product.entity.js";
import { HttpError } from "../domain/errors/http-error.js";
import type { ProductRepositoryPort } from "../domain/ports/product.repository.port.js";

export class GetProductBySlugUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(slug: string): Promise<ProductWithImages> {
    const product = await this.products.findBySlugWithImages(slug);
    if (!product) {
      throw new HttpError("Producto no encontrado", 404, "not_found");
    }
    return product;
  }
}
