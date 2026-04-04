export type CreateListedProductInput = {
  localProductId: string;
  name: string;
  description: string | null;
  unitAmountCents: number;
  currency: string;
  imageUrls: string[];
};

export type UpdateListedProductInput = {
  externalProductId: string;
  name?: string;
  description?: string | null;
  imageUrls?: string[];
};

export interface ProductCatalogPort {
  createListedProductWithDefaultPrice(
    input: CreateListedProductInput,
  ): Promise<{ externalProductId: string; externalPriceId: string }>;

  updateListedProduct(input: UpdateListedProductInput): Promise<void>;

  replaceDefaultPrice(input: {
    externalProductId: string;
    previousPriceId: string | null;
    unitAmountCents: number;
    currency: string;
  }): Promise<{ externalPriceId: string }>;

  archiveListedProduct(externalProductId: string): Promise<void>;

  /** Limpieza tras fallo al persistir localmente (p. ej. eliminar producto recién creado en Stripe). */
  deleteListedProduct(externalProductId: string): Promise<void>;
}
