import type { ErrorRequestHandler } from "express";
import { HttpError } from "../../../domain/errors/http-error.js";
import type { LogInboundPayloadErrorUseCase } from "../../../use-cases/log-inbound-payload-error.use-case.js";

function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error("Error desconocido");
  }
}

function buildRequestPayload(req: Parameters<ErrorRequestHandler>[1]): unknown {
  return { body: req.body, query: req.query };
}

export function createGlobalErrorHandler(
  logError: LogInboundPayloadErrorUseCase,
): ErrorRequestHandler {
  return (err, req, res, next) => {
    const error = normalizeError(err);

    void logError
      .execute({
        httpMethod: req.method,
        path: req.path,
        payload: buildRequestPayload(req),
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack ?? null,
      })
      .catch((failure: unknown) => {
        console.error("No se pudo guardar el error en base de datos:", failure);
      });

    if (res.headersSent) {
      next(error);
      return;
    }

    if (error instanceof HttpError) {
      res.status(error.statusCode).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      });
      return;
    }

    const isProduction = process.env.NODE_ENV === "production";
    res.status(500).json({
      error: isProduction ? "Error interno del servidor" : error.message,
    });
  };
}
