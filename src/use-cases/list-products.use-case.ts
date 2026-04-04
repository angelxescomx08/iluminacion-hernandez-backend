import type { ProductListFilters, ProductRepositoryPort } from "../domain/ports/product.repository.port.js";

export type ListProductsQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  characteristics?: Record<string, unknown>;
  activeOnly?: boolean;
};

export class ListProductsUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(query: ListProductsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const filters: ProductListFilters = {
      search: query.q?.trim() || undefined,
      characteristicsContains: query.characteristics,
      activeOnly: query.activeOnly ?? true,
    };
    return this.products.list({ filters, page, pageSize });
  }
}
