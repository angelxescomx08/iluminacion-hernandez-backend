import type { Auth } from "../../infrastructure/auth/create-auth.js";
import { Router } from "express";
import multer from "multer";
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
import { ProductHttpController } from "./product-http.controller.js";
import { createRequireAdminMiddleware } from "./middleware/require-admin.middleware.js";

const imageMime = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ProductRouterDeps = {
  auth: Auth;
  listProducts: ListProductsUseCase;
  getProductBySlug: GetProductBySlugUseCase;
  getProductById: GetProductByIdUseCase;
  createProduct: CreateProductUseCase;
  updateProduct: UpdateProductUseCase;
  deleteProduct: DeleteProductUseCase;
  addProductImage: AddProductImageUseCase;
  deleteProductImage: DeleteProductImageUseCase;
  setMainProductImage: SetMainProductImageUseCase;
};

export function createProductRouter(deps: ProductRouterDeps): Router {
  const router = Router();
  const admin = createRequireAdminMiddleware(deps.auth);

  const controller = new ProductHttpController(
    deps.listProducts,
    deps.getProductBySlug,
    deps.getProductById,
    deps.createProduct,
    deps.updateProduct,
    deps.deleteProduct,
    deps.addProductImage,
    deps.deleteProductImage,
    deps.setMainProductImage,
  );

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const mime = file.mimetype.toLowerCase().split(";")[0]?.trim() ?? "";
      if (imageMime.has(mime)) {
        cb(null, true);
        return;
      }
      cb(
        new HttpError("Solo se permiten imágenes JPEG, PNG o WebP", 400, "invalid_file_type"),
      );
    },
  });

  router.get("/", controller.list);
  router.get("/by-slug/:slug", controller.getBySlugHandler);
  router.get("/:id", controller.getByIdHandler);

  router.post("/", admin, controller.create);
  router.patch("/:id", admin, controller.update);
  router.delete("/:id", admin, controller.remove);

  router.post("/:id/images", admin, upload.single("file"), controller.addImage);
  router.delete("/:id/images/:imageId", admin, controller.removeImage);
  router.patch("/:id/images/:imageId/main", admin, controller.setMainImage);

  return router;
}
