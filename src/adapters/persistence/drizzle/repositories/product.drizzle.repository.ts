import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  max,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Product, ProductImage, ProductWithImages } from "../../../../domain/entities/product.entity.js";
import type {
  PaginatedProducts,
  ProductListFilters,
  ProductRepositoryPort,
} from "../../../../domain/ports/product.repository.port.js";
import type { AppDatabase } from "../../postgres/postgres-database.adapter.js";
import { productImages, products } from "../schema/catalog.tables.js";

function sanitizeLikeFragment(value: string): string {
  return value.replace(/[%_\\]/g, "");
}

function mapProduct(row: typeof products.$inferSelect): Product {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    content: row.content,
    characteristics: row.characteristics ?? null,
    price: row.price,
    stock: row.stock,
    isActive: row.isActive,
    stripeProductId: row.stripeProductId ?? null,
    stripePriceId: row.stripePriceId ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

function mapImage(row: typeof productImages.$inferSelect): ProductImage {
  return {
    id: row.id,
    productId: row.productId,
    url: row.url,
    objectKey: row.objectKey ?? null,
    isMain: row.isMain,
    sortOrder: row.sortOrder,
  };
}

function buildListConditions(filters: ProductListFilters): SQL | undefined {
  const parts: SQL[] = [];

  if (filters.activeOnly) {
    parts.push(eq(products.isActive, true));
  }

  const search = filters.search?.trim();
  if (search && search.length > 0) {
    const safe = `%${sanitizeLikeFragment(search)}%`;
    const titleOrDesc = or(ilike(products.title, safe), ilike(products.description, safe));
    if (titleOrDesc) parts.push(titleOrDesc);
  }

  if (
    filters.characteristicsContains &&
    Object.keys(filters.characteristicsContains).length > 0
  ) {
    const payload = JSON.stringify(filters.characteristicsContains);
    parts.push(sql`coalesce(${products.characteristics}, '{}'::jsonb) @> ${payload}::jsonb`);
  }

  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

export class ProductDrizzleRepository implements ProductRepositoryPort {
  constructor(private readonly db: AppDatabase) {}

  async insert(product: Product): Promise<void> {
    await this.db.insert(products).values({
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      content: product.content,
      characteristics: product.characteristics ?? null,
      price: product.price,
      stock: product.stock,
      isActive: product.isActive,
      stripeProductId: product.stripeProductId,
      stripePriceId: product.stripePriceId,
      createdBy: product.createdBy,
      createdAt: product.createdAt ?? undefined,
      updatedAt: product.updatedAt ?? undefined,
    });
  }

  async updateById(id: string, patch: Partial<Product>): Promise<void> {
    await this.db
      .update(products)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.characteristics !== undefined ? { characteristics: patch.characteristics } : {}),
        ...(patch.price !== undefined ? { price: patch.price } : {}),
        ...(patch.stock !== undefined ? { stock: patch.stock } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(patch.stripeProductId !== undefined ? { stripeProductId: patch.stripeProductId } : {}),
        ...(patch.stripePriceId !== undefined ? { stripePriceId: patch.stripePriceId } : {}),
        ...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {}),
      })
      .where(eq(products.id, id));
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.db.query.products.findFirst({
      where: eq(products.id, id),
    });
    return row ? mapProduct(row) : null;
  }

  async findBySlug(slug: string): Promise<Product | null> {
    const row = await this.db.query.products.findFirst({
      where: eq(products.slug, slug),
    });
    return row ? mapProduct(row) : null;
  }

  async existsSlug(slug: string, excludeProductId?: string): Promise<boolean> {
    const row = await this.db.query.products.findFirst({
      where:
        excludeProductId !== undefined
          ? and(eq(products.slug, slug), ne(products.id, excludeProductId))
          : eq(products.slug, slug),
      columns: { id: true },
    });
    return row !== undefined;
  }

  async list(params: {
    filters: ProductListFilters;
    page: number;
    pageSize: number;
  }): Promise<PaginatedProducts> {
    const whereClause = buildListConditions(params.filters);
    const offset = (params.page - 1) * params.pageSize;

    const countBase = this.db.select({ total: count() }).from(products);
    const [totalRow] =
      whereClause !== undefined
        ? await countBase.where(whereClause)
        : await countBase;

    const rows = await this.db.query.products.findMany({
      ...(whereClause !== undefined ? { where: whereClause } : {}),
      orderBy: [desc(products.createdAt)],
      limit: params.pageSize,
      offset,
      with: {
        images: {
          orderBy: [desc(productImages.isMain), asc(productImages.sortOrder)],
        },
      },
    });

    return {
      items: rows.map((row) => ({
        ...mapProduct(row),
        images: row.images.map(mapImage),
      })),
      total: Number(totalRow?.total ?? 0),
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  async listImagesByProductId(productId: string): Promise<ProductImage[]> {
    const rows = await this.db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(desc(productImages.isMain), asc(productImages.sortOrder));
    return rows.map(mapImage);
  }

  async insertImage(image: ProductImage): Promise<void> {
    await this.db.insert(productImages).values({
      id: image.id,
      productId: image.productId,
      url: image.url,
      objectKey: image.objectKey,
      isMain: image.isMain,
      sortOrder: image.sortOrder,
    });
  }

  async deleteImage(productId: string, imageId: string): Promise<boolean> {
    const removed = await this.db
      .delete(productImages)
      .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
      .returning({ id: productImages.id });
    return removed.length > 0;
  }

  async setPrimaryImage(productId: string, imageId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(productImages)
        .set({ isMain: false })
        .where(eq(productImages.productId, productId));
      await tx
        .update(productImages)
        .set({ isMain: true })
        .where(and(eq(productImages.productId, productId), eq(productImages.id, imageId)));
    });
  }

  async nextImageSortOrder(productId: string): Promise<number> {
    const [row] = await this.db
      .select({ m: max(productImages.sortOrder) })
      .from(productImages)
      .where(eq(productImages.productId, productId));
    const current = row?.m;
    const n = typeof current === "number" ? current : current != null ? Number(current) : -1;
    return Number.isFinite(n) ? n + 1 : 0;
  }

  async findByIdWithImages(id: string): Promise<ProductWithImages | null> {
    const row = await this.db.query.products.findFirst({
      where: eq(products.id, id),
      with: {
        images: {
          orderBy: [desc(productImages.isMain), asc(productImages.sortOrder)],
        },
      },
    });
    if (!row) return null;
    return {
      ...mapProduct(row),
      images: row.images.map(mapImage),
    };
  }

  async findBySlugWithImages(slug: string): Promise<ProductWithImages | null> {
    const row = await this.db.query.products.findFirst({
      where: eq(products.slug, slug),
      with: {
        images: {
          orderBy: [desc(productImages.isMain), asc(productImages.sortOrder)],
        },
      },
    });
    if (!row) return null;
    return {
      ...mapProduct(row),
      images: row.images.map(mapImage),
    };
  }
}
