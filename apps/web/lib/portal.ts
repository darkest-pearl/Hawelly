export type PortalRole = "sender" | "staff" | "admin";

export interface PortalNavigationItem {
  label: string;
  href: string;
  icon: "overview" | "transfers" | "funding" | "payouts" | "exceptions" | "users" | "configuration" | "activity";
}

const senderNavigation = [
  { label: "Transfers", href: "/sender", icon: "transfers" },
  { label: "Recipients", href: "/sender/recipients", icon: "users" },
  { label: "Support", href: "/sender#support", icon: "activity" }
] satisfies PortalNavigationItem[];

const operationsNavigation = [
  { label: "Overview", href: "/staff", icon: "overview" },
  { label: "Transfers", href: "/staff#transfers", icon: "transfers" },
  { label: "Funding", href: "/staff#funding", icon: "funding" },
  { label: "Payouts", href: "/staff#payouts", icon: "payouts" },
  { label: "Exceptions", href: "/staff#exceptions", icon: "exceptions" }
] satisfies PortalNavigationItem[];

const adminNavigation = [
  { label: "Users", href: "/admin#users", icon: "users" },
  {
    label: "Configuration",
    href: "/admin#configuration",
    icon: "configuration"
  },
  { label: "Activity", href: "/admin#activity", icon: "activity" }
] satisfies PortalNavigationItem[];

export const forbiddenPortalTerms = [
  "agent",
  "settlement",
  "float",
  "wallet",
  "commission",
  "reconciliation"
] as const;

export function getPortalNavigation(role: PortalRole) {
  if (role === "sender") return { primary: senderNavigation, administration: [] };
  return {
    primary: operationsNavigation.map((item) => ({
      ...item,
      href: role === "admin" ? item.href.replace("/staff", "/admin") : item.href
    })),
    administration: role === "admin" ? adminNavigation : []
  };
}

export function validateOperationalReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized) return "Add a concise operational reason";
  if (normalized.length > 240) return "Keep the reason to 240 characters or fewer";
  return null;
}
