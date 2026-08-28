import { Router, type Request } from "express";
import { z } from "zod";
import { Capability, Role } from "../generated/prisma/enums.js";
import type { AuthService } from "../auth/service.js";
import { PublicApiError } from "../http/errors.js";
import { asyncHandler, contextFrom, noStore } from "../http/router.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { uuidSchema } from "../transfers/validation.js";
import type { AdminWorkflowService } from "./service.js";
import {
  activateConfigurationSchema,
  adminListSchema,
  createFundingTemplateSchema,
  createStaffSchema,
  grantCapabilitySchema,
  revokeCapabilitySchema,
  updateFundingTemplateSchema,
  updateStaffSchema
} from "./validation.js";

function principalFrom(request: Request) {
  const principal = (request as AuthRequest).auth;
  if (!principal) throw new PublicApiError(401, "AUTH_REQUIRED", "Authentication required");
  return principal;
}

export function createAdminRouter(auth: AuthService, workflow: AdminWorkflowService) {
  const router = Router();
  router.use(requireAuth(auth));
  router.use(asyncHandler(async (request, _response, next) => {
    const principal = principalFrom(request);
    if (principal.role !== Role.ADMIN) {
      await workflow.auditAdminDenied(principal, contextFrom(request));
      throw new PublicApiError(403, "FORBIDDEN", "Forbidden");
    }
    next();
  }));

  router.get("/staff", asyncHandler(async (request, response) => {
    const query = adminListSchema.parse(request.query);
    noStore(response); response.json({ staff: await workflow.listStaff(principalFrom(request), query.limit) });
  }));
  router.post("/staff", asyncHandler(async (request, response) => {
    const staff = await workflow.createStaff(principalFrom(request), createStaffSchema.parse(request.body), contextFrom(request));
    noStore(response); response.status(201).json({ staff });
  }));
  router.patch("/staff/:id", asyncHandler(async (request, response) => {
    const staff = await workflow.updateStaff(principalFrom(request), uuidSchema.parse(request.params.id), updateStaffSchema.parse(request.body), contextFrom(request));
    noStore(response); response.json({ staff });
  }));
  router.post("/staff/:id/capabilities", asyncHandler(async (request, response) => {
    const staff = await workflow.grantCapability(principalFrom(request), uuidSchema.parse(request.params.id), grantCapabilitySchema.parse(request.body), contextFrom(request));
    noStore(response); response.status(201).json({ staff });
  }));
  router.delete("/staff/:id/capabilities/:capability", asyncHandler(async (request, response) => {
    const input = revokeCapabilitySchema.parse(request.body);
    const capability = z.enum(Capability).parse(request.params.capability);
    const staff = await workflow.revokeCapability(principalFrom(request), uuidSchema.parse(request.params.id), capability, input.reason, input.confirmed, contextFrom(request));
    noStore(response); response.json({ staff });
  }));

  router.get("/configuration", asyncHandler(async (request, response) => {
    noStore(response); response.json({ configuration: await workflow.getConfiguration(principalFrom(request)) });
  }));
  router.post("/configuration", asyncHandler(async (request, response) => {
    const configuration = await workflow.activateConfiguration(principalFrom(request), activateConfigurationSchema.parse(request.body), contextFrom(request));
    noStore(response); response.status(201).json({ configuration });
  }));

  router.get("/funding-templates", asyncHandler(async (request, response) => {
    const query = adminListSchema.parse(request.query);
    noStore(response); response.json({ templates: await workflow.listFundingTemplates(principalFrom(request), query.limit) });
  }));
  router.post("/funding-templates", asyncHandler(async (request, response) => {
    const template = await workflow.createFundingTemplate(principalFrom(request), createFundingTemplateSchema.parse(request.body), contextFrom(request));
    noStore(response); response.status(201).json({ template });
  }));
  router.patch("/funding-templates/:id", asyncHandler(async (request, response) => {
    const template = await workflow.updateFundingTemplate(principalFrom(request), uuidSchema.parse(request.params.id), updateFundingTemplateSchema.parse(request.body), contextFrom(request));
    noStore(response); response.json({ template });
  }));

  router.get("/activity", asyncHandler(async (request, response) => {
    const query = adminListSchema.parse(request.query);
    noStore(response); response.json({ events: await workflow.listActivity(principalFrom(request), query.limit) });
  }));
  router.get("/dashboard", asyncHandler(async (request, response) => {
    noStore(response); response.json(await workflow.getDashboard(principalFrom(request)));
  }));
  return router;
}
