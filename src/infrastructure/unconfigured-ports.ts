import { HttpError } from "../domain/errors/http-error.js";
import type { EmailSenderPort } from "../domain/ports/email-sender.port.js";
import type { ObjectStoragePort } from "../domain/ports/object-storage.port.js";
import type { ProductCatalogPort } from "../domain/ports/product-catalog.port.js";

function stripeNotConfigured(): never {
  throw new HttpError(
    "Stripe no configurado: define STRIPE_SECRET_KEY en el entorno para crear o sincronizar productos.",
    503,
    "stripe_not_configured",
  );
}

function s3NotConfigured(): never {
  throw new HttpError(
    "Almacenamiento de imágenes no configurado: define S3_BUCKET (y credenciales AWS o S3_ENDPOINT para MinIO).",
    503,
    "s3_not_configured",
  );
}

function resendNotConfigured(): never {
  throw new HttpError(
    "Envío de correo no configurado: define RESEND_API_KEY, CONTACT_TO_EMAIL y CONTACT_FROM_EMAIL en el entorno.",
    503,
    "email_not_configured",
  );
}

/**
 * Permite montar las rutas del catálogo aunque falte Stripe; las operaciones que lo requieren responden 503.
 */
export function createUnconfiguredProductCatalogPort(): ProductCatalogPort {
  return {
    createListedProductWithDefaultPrice: async () => stripeNotConfigured(),
    updateListedProduct: async () => stripeNotConfigured(),
    replaceDefaultPrice: async () => stripeNotConfigured(),
    archiveListedProduct: async () => {
      /* sin clave de Stripe no hay recurso remoto que archivar */
    },
    deleteListedProduct: async () => {
      /* idem */
    },
  };
}

export function createUnconfiguredObjectStoragePort(): ObjectStoragePort {
  return {
    uploadPublicObject: async () => s3NotConfigured(),
    deleteObject: async () => s3NotConfigured(),
  };
}

/**
 * Permite montar la ruta de contacto aunque falte Resend; responde 503 en vez de tirar el servidor.
 */
export function createUnconfiguredEmailSenderPort(): EmailSenderPort {
  return {
    sendEmail: async () => resendNotConfigured(),
  };
}
