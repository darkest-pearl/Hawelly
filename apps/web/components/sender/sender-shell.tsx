"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { getPortalNavigation } from "../../lib/portal";
import { useAuth } from "../auth/auth-provider";
import { Icon } from "../ui/icon";

export function SenderShell({
  active,
  children
}: {
  active: "Transfers" | "Recipients" | "Support";
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigation = getPortalNavigation("sender").primary;
  const initials = user?.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <main className="sender-portal">
      <header className="sender-header">
        <Link className="brand" href="/sender" aria-label="Hawelly sender home">Hawelly</Link>
        <nav aria-label="Sender navigation" className={menuOpen ? "is-open" : ""}>
          {navigation.map((item) => (
            <Link aria-current={item.label === active ? "page" : undefined} href={item.href} key={item.label}>{item.label}</Link>
          ))}
        </nav>
        <button className="sender-user" onClick={() => void logout()} type="button" aria-label="Sign out">
          <span className="avatar">{initials || "HW"}</span><span>{user?.fullName}</span><small>Sign out</small>
        </button>
        <button
          aria-expanded={menuOpen}
          aria-label="Toggle sender navigation"
          className="sender-menu-button icon-button"
          onClick={() => setMenuOpen((value) => !value)}
          type="button"
        >
          <Icon name="menu" />
        </button>
      </header>
      <div className="sender-content">{children}</div>
    </main>
  );
}
