import type { Product, ProductImage, ProductWithImages } from "../entities/product.entity.js";

export type ProductListFilters = {
  search?: string;
  characteristicsContains?: Record<string, unknown>;
  activeOnly?: boolean;
};

export type PaginatedProducts = {
  items: ProductWithImages[];
  total: number;
  page: number;
  pageSize: number;
};

export interface ProductRepositoryPort {
  insert(product: Product): Promise<void>;
  updateById(id: string, patch: Partial<Product>): Promise<void>;
  findById(id: string): Promise<Product | null>;
  findBySlug(slug: string): Promise<Product | null>;
  existsSlug(slug: string, excludeProductId?: string): Promise<boolean>;
  list(params: {
    filters: ProductListFilters;
    page: number;
    pageSize: number;
  }): Promise<PaginatedProducts>;
  listImagesByProductId(productId: string): Promise<ProductImage[]>;
  insertImage(image: ProductImage): Promise<void>;
  deleteImage(productId: string, imageId: string): Promise<boolean>;
  setPrimaryImage(productId: string, imageId: string): Promise<void>;
  nextImageSortOrder(productId: string): Promise<number>;
  findByIdWithImages(id: string): Promise<ProductWithImages | null>;
  findBySlugWithImages(slug: string): Promise<ProductWithImages | null>;
}
