import { randomUUID } from "node:crypto";
import type { Product } from "../domain/entities/product.entity.js";
import { HttpError } from "../domain/errors/http-error.js";
import type { ProductCatalogPort } from "../domain/ports/product-catalog.port.js";
import type { ProductRepositoryPort } from "../domain/ports/product.repository.port.js";
import { slugifyReadable, withSlugSuffix } from "../domain/utils/slug.js";

export type CreateProductCommand = {
  title: string;
  description?: string | null;
  content?: string | null;
  characteristics?: string | null;
  price: number;
  stock?: number;
  isActive?: boolean;
  createdBy: string | null;
};

function toDecimalString(price: number): string {
  if (!Number.isFinite(price) || price < 0) {
    throw new HttpError("Precio inválido", 400, "invalid_price");
  }
  return price.toFixed(2);
}

function toUnitCents(price: number): number {
  const cents = Math.round(price * 100);
  if (cents < 0) throw new HttpError("Precio inválido", 400, "invalid_price");
  return cents;
}

export class CreateProductUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly catalog: ProductCatalogPort,
    private readonly currency: string,
  ) {}

  async execute(command: CreateProductCommand): Promise<Product> {
    const id = randomUUID();
    const baseSlug = slugifyReadable(command.title);
    const slug = await this.resolveUniqueSlug(baseSlug);

    const priceStr = toDecimalString(command.price);
    const { externalProductId, externalPriceId } =
      await this.catalog.createListedProductWithDefaultPrice({
        localProductId: id,
        name: command.title,
        description: command.description ?? null,
        unitAmountCents: toUnitCents(command.price),
        currency: this.currency,
        imageUrls: [],
      });

    const now = new Date();
    const product: Product = {
      id,
      title: command.title,
      slug,
      description: command.description ?? null,
      content: command.content ?? null,
      characteristics: command.characteristics ?? null,
      price: priceStr,
      stock: command.stock ?? 0,
      isActive: command.isActive ?? true,
      stripeProductId: externalProductId,
      stripePriceId: externalPriceId,
      createdBy: command.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.products.insert(product);
    } catch (error) {
      try {
        await this.catalog.deleteListedProduct(externalProductId);
      } catch {
        // Evita enmascarar el error de persistencia local.
      }
      throw error;
    }

    if (!product.isActive) {
      await this.catalog.archiveListedProduct(externalProductId);
    }

    return product;
  }

  private async resolveUniqueSlug(base: string): Promise<string> {
    if (!(await this.products.existsSlug(base))) return base;
    for (let n = 2; n < 10_000; n++) {
      const candidate = withSlugSuffix(base, String(n));
      if (!(await this.products.existsSlug(candidate))) return candidate;
    }
    const fallback = withSlugSuffix(base, randomUUID().slice(0, 8));
    if (await this.products.existsSlug(fallback)) {
      throw new HttpError("No se pudo generar un slug único", 409, "slug_collision");
    }
    return fallback;
  }
}
