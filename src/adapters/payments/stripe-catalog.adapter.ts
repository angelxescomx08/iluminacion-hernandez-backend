import Stripe from "stripe";
import type {
  CreateListedProductInput,
  ProductCatalogPort,
  UpdateListedProductInput,
} from "../../domain/ports/product-catalog.port.js";

export class StripeCatalogAdapter implements ProductCatalogPort {
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { typescript: true });
  }

  async createListedProductWithDefaultPrice(
    input: CreateListedProductInput,
  ): Promise<{ externalProductId: string; externalPriceId: string }> {
    const images = input.imageUrls.slice(0, 8);
    const product = await this.stripe.products.create({
      name: input.name,
      description: input.description ?? undefined,
      images: images.length > 0 ? images : undefined,
      metadata: { local_product_id: input.localProductId },
      default_price_data: {
        currency: input.currency,
        unit_amount: input.unitAmountCents,
      },
    });

    const defaultPrice = product.default_price;
    const priceId = typeof defaultPrice === "string" ? defaultPrice : defaultPrice?.id;
    if (!priceId) {
      throw new Error("Stripe no devolvió default_price para el producto");
    }

    return { externalProductId: product.id, externalPriceId: priceId };
  }

  async updateListedProduct(input: UpdateListedProductInput): Promise<void> {
    const payload: Stripe.ProductUpdateParams = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.description !== undefined) {
      payload.description = input.description ?? undefined;
    }
    if (input.imageUrls !== undefined) {
      payload.images = input.imageUrls.slice(0, 8);
    }
    await this.stripe.products.update(input.externalProductId, payload);
  }

  async replaceDefaultPrice(input: {
    externalProductId: string;
    previousPriceId: string | null;
    unitAmountCents: number;
    currency: string;
  }): Promise<{ externalPriceId: string }> {
    const newPrice = await this.stripe.prices.create({
      product: input.externalProductId,
      currency: input.currency,
      unit_amount: input.unitAmountCents,
    });

    await this.stripe.products.update(input.externalProductId, {
      default_price: newPrice.id,
    });

    if (input.previousPriceId) {
      try {
        await this.stripe.prices.update(input.previousPriceId, { active: false });
      } catch {
        // El precio anterior podría estar ya inactivo.
      }
    }

    return { externalPriceId: newPrice.id };
  }

  async archiveListedProduct(externalProductId: string): Promise<void> {
    await this.stripe.products.update(externalProductId, { active: false });
  }

  async deleteListedProduct(externalProductId: string): Promise<void> {
    try {
      await this.stripe.products.del(externalProductId);
    } catch {
      await this.archiveListedProduct(externalProductId);
    }
  }
}
