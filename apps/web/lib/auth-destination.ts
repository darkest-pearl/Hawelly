import type { SessionUser } from "./api-client";

export type PortalRole = SessionUser["role"];

const senderDetailPattern = /^\/sender\/transfers\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const senderDestinations = new Set([
  "/sender",
  "/sender/recipients",
  "/sender/new-transfer"
]);

export function portalHome(role: PortalRole) {
  if (role === "ADMIN") return "/admin";
  if (role === "STAFF") return "/staff";
  return "/sender";
}

export function parsePortalRole(value: string | string[] | undefined): PortalRole {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (normalized === "admin") return "ADMIN";
  if (normalized === "staff") return "STAFF";
  return "SENDER";
}

export function safeAuthDestination(
  value: string | string[] | undefined,
  role: PortalRole
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || candidate.includes("?") || candidate.includes("#") || candidate.includes("\\")) {
    return portalHome(role);
  }
  if (role === "ADMIN") return candidate === "/admin" ? candidate : "/admin";
  if (role === "STAFF") return candidate === "/staff" ? candidate : "/staff";
  return senderDestinations.has(candidate) || senderDetailPattern.test(candidate)
    ? candidate
    : "/sender";
}

export function authEntryPath(role: PortalRole, destination: string) {
  const parameters = new URLSearchParams({ next: safeAuthDestination(destination, role) });
  if (role !== "SENDER") parameters.set("portal", role.toLowerCase());
  return `/sign-in?${parameters.toString()}`;
}
