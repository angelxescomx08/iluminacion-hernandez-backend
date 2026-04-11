import "dotenv/config";
import "express-async-errors";
import { createApp } from "../adapters/http/express-app.js";
import { createProductRouter } from "../adapters/http/product.routes.js";
import { StripeCatalogAdapter } from "../adapters/payments/stripe-catalog.adapter.js";
import { InboundPayloadErrorLogDrizzleRepository } from "../adapters/persistence/drizzle/repositories/inbound-payload-error-log.drizzle.repository.js";
import { ProductDrizzleRepository } from "../adapters/persistence/drizzle/repositories/product.drizzle.repository.js";
import { PostgresDatabaseAdapter } from "../adapters/persistence/postgres/postgres-database.adapter.js";
import { S3ObjectStorageAdapter } from "../adapters/storage/s3-object-storage.adapter.js";
import { AddProductImageUseCase } from "../use-cases/add-product-image.use-case.js";
import { CreateProductUseCase } from "../use-cases/create-product.use-case.js";
import { DeleteProductImageUseCase } from "../use-cases/delete-product-image.use-case.js";
import { DeleteProductUseCase } from "../use-cases/delete-product.use-case.js";
import { GetProductByIdUseCase } from "../use-cases/get-product-by-id.use-case.js";
import { GetProductBySlugUseCase } from "../use-cases/get-product-by-slug.use-case.js";
import { ListProductsUseCase } from "../use-cases/list-products.use-case.js";
import { LogInboundPayloadErrorUseCase } from "../use-cases/log-inbound-payload-error.use-case.js";
import { SetMainProductImageUseCase } from "../use-cases/set-main-product-image.use-case.js";
import { UpdateProductUseCase } from "../use-cases/update-product.use-case.js";
import { createAuth } from "./auth/create-auth.js";
import {
  createUnconfiguredObjectStoragePort,
  createUnconfiguredProductCatalogPort,
} from "./unconfigured-ports.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL es obligatoria");
}

const database = new PostgresDatabaseAdapter(databaseUrl);
const auth = createAuth(database.db);
const inboundErrorLogRepository = new InboundPayloadErrorLogDrizzleRepository(database.db);
const logInboundPayloadError = new LogInboundPayloadErrorUseCase(inboundErrorLogRepository);

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
const stripeCurrency = (process.env.STRIPE_CURRENCY ?? "mxn").trim().toLowerCase();
const s3Bucket = process.env.S3_BUCKET?.trim();
const s3PublicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.trim();
const awsRegion = (process.env.AWS_REGION ?? "us-east-1").trim();
const s3Endpoint = process.env.S3_ENDPOINT?.trim();

const productRepo = new ProductDrizzleRepository(database.db);
const stripeCatalog = stripeSecretKey
  ? new StripeCatalogAdapter(stripeSecretKey)
  : createUnconfiguredProductCatalogPort();
const objectStorage = s3Bucket
  ? new S3ObjectStorageAdapter({
      region: awsRegion,
      bucket: s3Bucket,
      ...(s3PublicBaseUrl ? { publicBaseUrl: s3PublicBaseUrl } : {}),
      ...(s3Endpoint ? { endpoint: s3Endpoint } : {}),
    })
  : createUnconfiguredObjectStoragePort();

if (!stripeSecretKey) {
  console.warn("STRIPE_SECRET_KEY ausente: POST/PATCH de productos responderán 503 hasta configurar Stripe.");
}
if (!s3Bucket) {
  console.warn("S3_BUCKET ausente: la subida de imágenes responderá 503 hasta configurar S3.");
}

const productRouter = createProductRouter({
  auth,
  listProducts: new ListProductsUseCase(productRepo),
  getProductBySlug: new GetProductBySlugUseCase(productRepo),
  getProductById: new GetProductByIdUseCase(productRepo),
  createProduct: new CreateProductUseCase(productRepo, stripeCatalog, stripeCurrency),
  updateProduct: new UpdateProductUseCase(productRepo, stripeCatalog, stripeCurrency),
  deleteProduct: new DeleteProductUseCase(productRepo, stripeCatalog),
  addProductImage: new AddProductImageUseCase(productRepo, objectStorage, stripeCatalog),
  deleteProductImage: new DeleteProductImageUseCase(productRepo, objectStorage, stripeCatalog),
  setMainProductImage: new SetMainProductImageUseCase(productRepo, stripeCatalog),
});

const port = Number(process.env.PORT) || 3000;
const app = createApp({ auth, logInboundPayloadError, productRouter });

const server = app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});

async function shutdown(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await database.close();
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
