import type { RequestHandler } from "express";
import type { ProductWithImages } from "../../domain/entities/product.entity.js";
import { HttpError } from "../../domain/errors/http-error.js";
import { AddProductImageUseCase } from "../../use-cases/add-product-image.use-case.js";
import { CreateProductUseCase } from "../../use-cases/create-product.use-case.js";
import { DeleteProductImageUseCase } from "../../use-cases/delete-product-image.use-case.js";
import { DeleteProductUseCase } from "../../use-cases/delete-product.use-case.js";
import { GetProductByIdUseCase } from "../../use-cases/get-product-by-id.use-case.js";
import { GetProductBySlugUseCase } from "../../use-cases/get-product-by-slug.use-case.js";
import { ListProductsUseCase } from "../../use-cases/list-products.use-case.js";
import { SetMainProductImageUseCase } from "../../use-cases/set-main-product-image.use-case.js";
import { UpdateProductUseCase } from "../../use-cases/update-product.use-case.js";

function parseCharacteristics(raw: unknown): Record<string, unknown> | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (typeof raw !== "string") {
    throw new HttpError("Parámetro characteristics inválido", 400, "invalid_characteristics");
  }
  try {
    const value = JSON.parse(raw) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new HttpError("characteristics debe ser un objeto JSON", 400, "invalid_characteristics");
    }
    return value as Record<string, unknown>;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError("characteristics debe ser JSON válido", 400, "invalid_characteristics");
  }
}

function parseActiveOnly(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return true;
  throw new HttpError("activeOnly debe ser true o false", 400, "invalid_active_only");
}

function parsePage(raw: unknown, fallback: number): number {
  const s = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function firstQueryString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function asCharacteristicsRecord(value: unknown): Record<string, unknown> | null {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError("characteristics debe ser un objeto", 400, "invalid_body");
  }
  return value as Record<string, unknown>;
}

function toPublicProductJson(p: ProductWithImages) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    content: p.content,
    characteristics: p.characteristics,
    price: p.price,
    stock: p.stock,
    isActive: p.isActive,
    createdAt: p.createdAt?.toISOString() ?? null,
    updatedAt: p.updatedAt?.toISOString() ?? null,
    images: p.images.map((img) => ({
      id: img.id,
      url: img.url,
      isMain: img.isMain,
      sortOrder: img.sortOrder,
    })),
  };
}

function toAdminProductJson(p: ProductWithImages) {
  return {
    ...toPublicProductJson(p),
    stripeProductId: p.stripeProductId,
    stripePriceId: p.stripePriceId,
    createdBy: p.createdBy,
  };
}

export class ProductHttpController {
  constructor(
    private readonly listProducts: ListProductsUseCase,
    private readonly getBySlug: GetProductBySlugUseCase,
    private readonly getById: GetProductByIdUseCase,
    private readonly createProduct: CreateProductUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly deleteProduct: DeleteProductUseCase,
    private readonly addProductImage: AddProductImageUseCase,
    private readonly deleteProductImage: DeleteProductImageUseCase,
    private readonly setMainProductImage: SetMainProductImageUseCase,
  ) {}

  list: RequestHandler = async (req, res, next) => {
    try {
      const characteristics = parseCharacteristics(firstQueryString(req.query.characteristics));
      const activeOnly = parseActiveOnly(firstQueryString(req.query.activeOnly));
      const result = await this.listProducts.execute({
        page: parsePage(req.query.page, 1),
        pageSize: parsePage(req.query.pageSize, 20),
        q: firstQueryString(req.query.q),
        characteristics,
        activeOnly: activeOnly ?? true,
      });
      const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
      res.json({
        data: result.items.map((item) => toPublicProductJson(item)),
        pagination: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages,
        },
      });
    } catch (e) {
      next(e);
    }
  };

  getBySlugHandler: RequestHandler = async (req, res, next) => {
    try {
      const slug = String(req.params.slug ?? "");
      if (!slug) {
        throw new HttpError("Slug requerido", 400, "missing_slug");
      }
      const product = await this.getBySlug.execute(slug);
      res.json(toPublicProductJson(product));
    } catch (e) {
      next(e);
    }
  };

  getByIdHandler: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params.id ?? "");
      if (!id) {
        throw new HttpError("Id requerido", 400, "missing_id");
      }
      const product = await this.getById.execute(id);
      res.json(toPublicProductJson(product));
    } catch (e) {
      next(e);
    }
  };

  create: RequestHandler = async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const title = body.title;
      const price = body.price;
      if (typeof title !== "string" || title.trim().length === 0) {
        throw new HttpError("title es obligatorio", 400, "invalid_body");
      }
      if (typeof price !== "number" || !Number.isFinite(price)) {
        throw new HttpError("price debe ser un número", 400, "invalid_body");
      }
      const userId = res.locals.adminUserId as string | undefined;
      const product = await this.createProduct.execute({
        title: title.trim(),
        description: typeof body.description === "string" ? body.description : null,
        content: typeof body.content === "string" ? body.content : null,
        characteristics:
          body.characteristics === undefined ? null : asCharacteristicsRecord(body.characteristics),
        price,
        stock: typeof body.stock === "number" ? body.stock : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
        createdBy: userId ?? null,
      });
      const full = await this.getById.execute(product.id);
      res.status(201).json(toAdminProductJson(full));
    } catch (e) {
      next(e);
    }
  };

  update: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params.id ?? "");
      if (!id) throw new HttpError("Id requerido", 400, "missing_id");
      const body = req.body as Record<string, unknown>;
      const patch: Parameters<UpdateProductUseCase["execute"]>[0] = { productId: id };
      if (body.title !== undefined) {
        if (typeof body.title !== "string" || body.title.trim().length === 0) {
          throw new HttpError("title inválido", 400, "invalid_body");
        }
        patch.title = body.title.trim();
      }
      if (body.description !== undefined) {
        patch.description = body.description === null ? null : String(body.description);
      }
      if (body.content !== undefined) {
        patch.content = body.content === null ? null : String(body.content);
      }
      if (body.characteristics !== undefined) {
        patch.characteristics =
          body.characteristics === null ? null : asCharacteristicsRecord(body.characteristics);
      }
      if (body.price !== undefined) {
        if (typeof body.price !== "number" || !Number.isFinite(body.price)) {
          throw new HttpError("price debe ser un número", 400, "invalid_body");
        }
        patch.price = body.price;
      }
      if (body.stock !== undefined) {
        if (typeof body.stock !== "number" || !Number.isFinite(body.stock)) {
          throw new HttpError("stock debe ser un número", 400, "invalid_body");
        }
        patch.stock = body.stock;
      }
      if (body.isActive !== undefined) {
        if (typeof body.isActive !== "boolean") {
          throw new HttpError("isActive debe ser booleano", 400, "invalid_body");
        }
        patch.isActive = body.isActive;
      }
      await this.updateProduct.execute(patch);
      const full = await this.getById.execute(id);
      res.json(toAdminProductJson(full));
    } catch (e) {
      next(e);
    }
  };

  remove: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params.id ?? "");
      if (!id) throw new HttpError("Id requerido", 400, "missing_id");
      await this.deleteProduct.execute(id);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  };

  addImage: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params.id ?? "");
      if (!id) throw new HttpError("Id requerido", 400, "missing_id");
      const file = req.file;
      if (!file?.buffer) {
        throw new HttpError("Archivo requerido (campo file)", 400, "missing_file");
      }
      const full = await this.addProductImage.execute({
        productId: id,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });
      res.status(201).json(toAdminProductJson(full));
    } catch (e) {
      next(e);
    }
  };

  removeImage: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params.id ?? "");
      const imageId = String(req.params.imageId ?? "");
      if (!id || !imageId) throw new HttpError("Id requerido", 400, "missing_id");
      const full = await this.deleteProductImage.execute(id, imageId);
      res.json(toAdminProductJson(full));
    } catch (e) {
      next(e);
    }
  };

  setMainImage: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params.id ?? "");
      const imageId = String(req.params.imageId ?? "");
      if (!id || !imageId) throw new HttpError("Id requerido", 400, "missing_id");
      const full = await this.setMainProductImage.execute(id, imageId);
      res.json(toAdminProductJson(full));
    } catch (e) {
      next(e);
    }
  };
}
