import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/service.js";
import { requireAuth } from "./auth.js";

describe("requireAuth", () => {
  it.each([undefined, "Basic credentials", "Bearer   "])(
    "rejects a missing bearer token with a clean 401 (%s)",
    async (authorization) => {
      const authenticate = vi.fn();
      const authService = { authenticate } as unknown as AuthService;
      const app = express();
      app.get("/protected", requireAuth(authService), (_request, response) => {
        response.json({ ok: true });
      });
      const errorHandler: ErrorRequestHandler = (_error, _request, response, next) => {
        void next;
        response.status(500).json({ error: "Internal server error" });
      };
      app.use(errorHandler);

      const operation = request(app).get("/protected");
      if (authorization) operation.set("Authorization", authorization);
      const response = await operation;

      expect(response.status).toBe(401);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toEqual({
        error: { code: "AUTH_REQUIRED", message: "Authentication required" }
      });
      expect(authenticate).not.toHaveBeenCalled();
    }
  );
});
