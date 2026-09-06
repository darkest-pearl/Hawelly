import { Router, type Request } from "express";
import { Capability, Role } from "../generated/prisma/enums.js";
import { PublicApiError } from "../http/errors.js";
import { asyncHandler, contextFrom, noStore } from "../http/router.js";
import {
  requireAuth,
  requireCapability,
  requireRole,
  type AuthRequest
} from "../middleware/auth.js";
import type { AuthService } from "../auth/service.js";
import type { TransferWorkflowService } from "./service.js";
import {
  cancelTransferSchema,
  createTransferSchema,
  listQuerySchema,
  recipientCreateSchema,
  recipientPatchSchema,
  reviewTransferSchema,
  uuidSchema
} from "./validation.js";

function principalFrom(request: Request) {
  const principal = (request as AuthRequest).auth;
  if (!principal) {
    throw new PublicApiError(401, "AUTH_REQUIRED", "Authentication required");
  }
  return principal;
}

function idFrom(request: Request) {
  return uuidSchema.parse(request.params.id);
}

export function createRecipientsRouter(
  authService: AuthService,
  workflow: TransferWorkflowService
) {
  const router = Router();
  router.use(requireAuth(authService), requireRole(Role.SENDER));

  router.get(
    "/",
    asyncHandler(async (request, response) => {
      const { limit } = listQuerySchema.parse(request.query);
      const recipients = await workflow.listRecipients(principalFrom(request), limit);
      noStore(response);
      response.json({ recipients });
    })
  );

  router.post(
    "/",
    asyncHandler(async (request, response) => {
      const input = recipientCreateSchema.parse(request.body);
      const recipient = await workflow.createRecipient(
        principalFrom(request),
        input,
        contextFrom(request)
      );
      noStore(response);
      response.status(201).json({ recipient });
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (request, response) => {
      const recipient = await workflow.getRecipient(
        principalFrom(request),
        idFrom(request),
        contextFrom(request)
      );
      noStore(response);
      response.json({ recipient });
    })
  );

  router.patch(
    "/:id",
    asyncHandler(async (request, response) => {
      const input = recipientPatchSchema.parse(request.body);
      const recipient = await workflow.updateRecipient(
        principalFrom(request),
        idFrom(request),
        input,
        contextFrom(request)
      );
      noStore(response);
      response.json({ recipient });
    })
  );

  router.delete(
    "/:id",
    asyncHandler(async (request, response) => {
      await workflow.deleteRecipient(
        principalFrom(request),
        idFrom(request),
        contextFrom(request)
      );
      noStore(response);
      response.status(204).send();
    })
  );
  return router;
}

export function createTransfersRouter(
  authService: AuthService,
  workflow: TransferWorkflowService
) {
  const router = Router();
  router.use(requireAuth(authService), requireRole(Role.SENDER));

  router.get(
    "/options",
    asyncHandler(async (request, response) => {
      const options = await workflow.getSenderOptions(principalFrom(request));
      noStore(response);
      response.json({ options });
    })
  );

  router.get(
    "/",
    asyncHandler(async (request, response) => {
      const { limit } = listQuerySchema.parse(request.query);
      const transfers = await workflow.listSenderTransfers(principalFrom(request), limit);
      noStore(response);
      response.json({ transfers });
    })
  );

  router.post(
    "/",
    asyncHandler(async (request, response) => {
      const input = createTransferSchema.parse(request.body);
      const transfer = await workflow.createTransfer(
        principalFrom(request),
        input,
        contextFrom(request)
      );
      noStore(response);
      response.status(201).json({ transfer });
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (request, response) => {
      const transfer = await workflow.getSenderTransfer(
        principalFrom(request),
        idFrom(request),
        contextFrom(request)
      );
      noStore(response);
      response.json({ transfer });
    })
  );

  router.post(
    "/:id/cancel",
    asyncHandler(async (request, response) => {
      const { reason } = cancelTransferSchema.parse(request.body || {});
      const transfer = await workflow.cancelSenderTransfer(
        principalFrom(request),
        idFrom(request),
        reason,
        contextFrom(request)
      );
      noStore(response);
      response.json({ transfer });
    })
  );
  return router;
}

export function createOperationsTransfersRouter(
  authService: AuthService,
  workflow: TransferWorkflowService
) {
  const router = Router();
  router.use(
    requireAuth(authService),
    requireCapability(Capability.TRANSFER_REVIEW, async (request, principal) => {
      await workflow.auditCapabilityDenied(
        principal,
        Capability.TRANSFER_REVIEW,
        contextFrom(request)
      );
    })
  );

  router.get(
    "/",
    asyncHandler(async (request, response) => {
      const { limit } = listQuerySchema.parse(request.query);
      const transfers = await workflow.listOperationsRequests(
        principalFrom(request),
        limit
      );
      noStore(response);
      response.json({ transfers });
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (request, response) => {
      const transfer = await workflow.getOperationsRequest(
        principalFrom(request),
        idFrom(request)
      );
      noStore(response);
      response.json({ transfer });
    })
  );

  router.post(
    "/:id/review",
    asyncHandler(async (request, response) => {
      const input = reviewTransferSchema.parse(request.body);
      const transfer = await workflow.reviewRequest(
        principalFrom(request),
        idFrom(request),
        input.action,
        input.reason,
        contextFrom(request)
      );
      noStore(response);
      response.json({ transfer });
    })
  );
  return router;
}
