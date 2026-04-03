import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "../../infrastructure/auth/create-auth.js";
import { sendFetchResponseToExpress } from "./http-response.util.js";

export class AuthHttpController {
  constructor(private readonly auth: Auth) {}

  registerWithEmail: RequestHandler = async (req, res, next) => {
    try {
      const response = await this.auth.api.signUpEmail({
        body: req.body,
        headers: fromNodeHeaders(req.headers),
        asResponse: true,
      });
      await sendFetchResponseToExpress(res, response);
    } catch (error) {
      next(error);
    }
  };

  loginWithEmail: RequestHandler = async (req, res, next) => {
    try {
      const response = await this.auth.api.signInEmail({
        body: req.body,
        headers: fromNodeHeaders(req.headers),
        asResponse: true,
      });
      await sendFetchResponseToExpress(res, response);
    } catch (error) {
      next(error);
    }
  };

  loginWithGoogle: RequestHandler = async (req, res, next) => {
    try {
      const response = await this.auth.api.signInSocial({
        body: {
          ...req.body,
          provider: "google",
        },
        headers: fromNodeHeaders(req.headers),
        asResponse: true,
      });
      await sendFetchResponseToExpress(res, response);
    } catch (error) {
      next(error);
    }
  };

  logout: RequestHandler = async (req, res, next) => {
    try {
      const response = await this.auth.api.signOut({
        headers: fromNodeHeaders(req.headers),
        asResponse: true,
      });
      await sendFetchResponseToExpress(res, response);
    } catch (error) {
      next(error);
    }
  };

  getSession: RequestHandler = async (req, res, next) => {
    try {
      const session = await this.auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      res.json(session);
    } catch (error) {
      next(error);
    }
  };
}
