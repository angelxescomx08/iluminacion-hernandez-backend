import "dotenv/config";
import "express-async-errors";
import { createApp } from "../adapters/http/express-app.js";
import { createCheckoutRouter, createStripeWebhookRouter } from "../adapters/http/checkout.routes.js";
import { createContactRouter } from "../adapters/http/contact.routes.js";
import { createProductRouter } from "../adapters/http/product.routes.js";
import { ResendEmailSenderAdapter } from "../adapters/email/resend-email-sender.adapter.js";
import { StripeCatalogAdapter } from "../adapters/payments/stripe-catalog.adapter.js";
import { StripeCheckoutAdapter } from "../adapters/payments/stripe-checkout.adapter.js";
import { OrderDrizzleRepository } from "../adapters/persistence/drizzle/repositories/order.drizzle.repository.js";
import { type CheckoutConfig, DEFAULT_PICKUP_BRANCH } from "../domain/checkout-config.js";
import { CancelCheckoutUseCase } from "../use-cases/cancel-checkout.use-case.js";
import { CreateCheckoutSessionUseCase } from "../use-cases/create-checkout-session.use-case.js";
import { FulfillCheckoutUseCase } from "../use-cases/fulfill-checkout.use-case.js";
import { HandlePaymentAdjustmentsUseCase } from "../use-cases/handle-payment-adjustments.use-case.js";
import { HandleStripeWebhookUseCase } from "../use-cases/handle-stripe-webhook.use-case.js";
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
import { SendContactMessageUseCase } from "../use-cases/send-contact-message.use-case.js";
import { SetMainProductImageUseCase } from "../use-cases/set-main-product-image.use-case.js";
import { UpdateProductUseCase } from "../use-cases/update-product.use-case.js";
import { createAuth } from "./auth/create-auth.js";
import {
  createUnconfiguredEmailSenderPort,
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
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const contactToEmail = process.env.CONTACT_TO_EMAIL?.trim();
const contactFromEmail = process.env.CONTACT_FROM_EMAIL?.trim();
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
const publicSiteUrl = (process.env.PUBLIC_SITE_URL?.trim() || "https://iluminacion-hernandez.com").replace(/\/$/, "");
const shippingFlatRate = Number(process.env.SHIPPING_FLAT_RATE ?? "199");
const orderNotifyEmail = process.env.ORDER_NOTIFY_EMAIL?.trim() || contactToEmail || null;

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

const emailSender =
  resendApiKey && contactToEmail && contactFromEmail
    ? new ResendEmailSenderAdapter(resendApiKey)
    : createUnconfiguredEmailSenderPort();

if (!stripeSecretKey) {
  console.warn("STRIPE_SECRET_KEY ausente: POST/PATCH de productos responderán 503 hasta configurar Stripe.");
}
if (!s3Bucket) {
  console.warn("S3_BUCKET ausente: la subida de imágenes responderá 503 hasta configurar S3.");
}
if (!resendApiKey || !contactToEmail || !contactFromEmail) {
  console.warn(
    "RESEND_API_KEY, CONTACT_TO_EMAIL o CONTACT_FROM_EMAIL ausentes: el formulario de contacto responderá 503 hasta configurarlos.",
  );
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

const checkoutConfig: CheckoutConfig = {
  currency: stripeCurrency,
  shippingFlatRate: Number.isFinite(shippingFlatRate) && shippingFlatRate >= 0 ? shippingFlatRate : 199,
  pickupBranch: DEFAULT_PICKUP_BRANCH,
  siteUrl: publicSiteUrl,
  ownerEmail: orderNotifyEmail,
  fromEmail: contactFromEmail ?? null,
  sessionMinutes: 30,
  maxQuantityPerItem: 10,
  maxDistinctItems: 20,
};

let checkoutRouter: ReturnType<typeof createCheckoutRouter> | undefined;
let stripeWebhookRouter: ReturnType<typeof createStripeWebhookRouter> | undefined;
if (stripeSecretKey) {
  const orderRepo = new OrderDrizzleRepository(database.db);
  const payments = new StripeCheckoutAdapter(stripeSecretKey, stripeWebhookSecret);
  const fulfillCheckout = new FulfillCheckoutUseCase(orderRepo, payments, emailSender, checkoutConfig);
  checkoutRouter = createCheckoutRouter({
    auth,
    config: checkoutConfig,
    orders: orderRepo,
    createCheckout: new CreateCheckoutSessionUseCase(productRepo, orderRepo, payments, checkoutConfig),
    fulfillCheckout,
    cancelCheckout: new CancelCheckoutUseCase(orderRepo, payments, fulfillCheckout),
  });
  const adjustments = new HandlePaymentAdjustmentsUseCase(orderRepo, payments, fulfillCheckout, emailSender, checkoutConfig);
  stripeWebhookRouter = createStripeWebhookRouter(
    new HandleStripeWebhookUseCase(payments, fulfillCheckout, adjustments),
  );
  if (!stripeWebhookSecret) {
    console.warn("STRIPE_WEBHOOK_SECRET ausente: el webhook de Stripe responderá 503 (los pagos se confirman solo desde la página de éxito).");
  }
}

const contactRouter = createContactRouter({
  sendContactMessage: new SendContactMessageUseCase(
    emailSender,
    contactToEmail ?? "",
    contactFromEmail ?? "",
  ),
});

const port = Number(process.env.PORT) || 3000;
const app = createApp({
  auth,
  logInboundPayloadError,
  productRouter,
  contactRouter,
  checkoutRouter,
  stripeWebhookRouter,
});

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
