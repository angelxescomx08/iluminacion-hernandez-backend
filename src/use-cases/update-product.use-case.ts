import type { Product } from "../domain/entities/product.entity.js";
import { HttpError } from "../domain/errors/http-error.js";
import type { ProductCatalogPort } from "../domain/ports/product-catalog.port.js";
import type { ProductRepositoryPort } from "../domain/ports/product.repository.port.js";
import { slugifyReadable, withSlugSuffix } from "../domain/utils/slug.js";

export type UpdateProductCommand = {
  productId: string;
  title?: string;
  description?: string | null;
  content?: string | null;
  characteristics?: Record<string, unknown> | null;
  price?: number;
  stock?: number;
  isActive?: boolean;
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

export class UpdateProductUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly catalog: ProductCatalogPort,
    private readonly currency: string,
  ) {}

  async execute(command: UpdateProductCommand): Promise<Product> {
    const existing = await this.products.findById(command.productId);
    if (!existing) {
      throw new HttpError("Producto no encontrado", 404, "not_found");
    }
    if (!existing.stripeProductId) {
      throw new HttpError("Producto sin vínculo de catálogo externo", 409, "missing_stripe");
    }

    let nextSlug = existing.slug;
    if (command.title !== undefined && command.title !== existing.title) {
      const base = slugifyReadable(command.title);
      nextSlug = await this.resolveUniqueSlug(base, existing.id);
    }

    const nextTitle = command.title ?? existing.title;
    const nextDescription =
      command.description !== undefined ? command.description : existing.description;
    const nextContent = command.content !== undefined ? command.content : existing.content;
    const nextCharacteristics =
      command.characteristics !== undefined ? command.characteristics : existing.characteristics;
    const nextStock = command.stock ?? existing.stock;
    const nextActive = command.isActive ?? existing.isActive;

    let nextPrice = existing.price;
    let nextStripePriceId = existing.stripePriceId;

    if (command.price !== undefined) {
      nextPrice = toDecimalString(command.price);
      const { externalPriceId } = await this.catalog.replaceDefaultPrice({
        externalProductId: existing.stripeProductId,
        previousPriceId: existing.stripePriceId,
        unitAmountCents: toUnitCents(command.price),
        currency: this.currency,
      });
      nextStripePriceId = externalPriceId;
    }

    const images = await this.products.listImagesByProductId(existing.id);
    const imageUrls = this.orderedPublicUrls(images);

    await this.catalog.updateListedProduct({
      externalProductId: existing.stripeProductId,
      name: nextTitle,
      description: nextDescription,
      imageUrls,
    });

    const now = new Date();
    await this.products.updateById(existing.id, {
      title: nextTitle,
      slug: nextSlug,
      description: nextDescription,
      content: nextContent,
      characteristics: nextCharacteristics,
      price: nextPrice,
      stock: nextStock,
      isActive: nextActive,
      stripePriceId: nextStripePriceId,
      updatedAt: now,
    });

    const updated = await this.products.findById(existing.id);
    if (!updated) throw new HttpError("Producto no encontrado", 404, "not_found");
    return updated;
  }

  private orderedPublicUrls(
    images: { url: string; isMain: boolean; sortOrder: number }[],
  ): string[] {
    const sorted = [...images].sort((a, b) => {
      if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });
    return sorted.map((i) => i.url).slice(0, 8);
  }

  private async resolveUniqueSlug(base: string, excludeId: string): Promise<string> {
    if (!(await this.products.existsSlug(base, excludeId))) return base;
    for (let n = 2; n < 10_000; n++) {
      const candidate = withSlugSuffix(base, String(n));
      if (!(await this.products.existsSlug(candidate, excludeId))) return candidate;
    }
    throw new HttpError("No se pudo generar un slug único", 409, "slug_collision");
  }
}
