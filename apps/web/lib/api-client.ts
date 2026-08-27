"use client";

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: "SENDER" | "STAFF" | "ADMIN";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  capabilities?: string[];
}

export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession() {
  refreshPromise ??= fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  })
    .then((response) => response.ok)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? (payload.error as { code?: unknown; message?: unknown })
        : null;
    throw new ClientApiError(
      response.status,
      typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
      typeof error?.message === "string" ? error.message : "Request could not be completed"
    );
  }
  return payload as T;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const requestInit: RequestInit = {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  };
  let response = await fetch(`/api/backend${path}`, requestInit);
  if (response.status === 401 && (await refreshSession())) {
    response = await fetch(`/api/backend${path}`, requestInit);
  }
  return parseResponse<T>(response);
}

export function errorMessage(error: unknown) {
  return error instanceof ClientApiError
    ? error.message
    : "Something went wrong. Please try again.";
}

