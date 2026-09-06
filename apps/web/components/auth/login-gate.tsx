"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { authEntryPath, portalHome } from "../../lib/auth-destination";
import { Button } from "../ui/button";
import { useAuth } from "./auth-provider";

type PortalRole = "SENDER" | "STAFF" | "ADMIN";

export function LoginGate({
  role,
  children
}: {
  role: PortalRole;
  children: ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const signedIn = Boolean(user);

  useEffect(() => {
    if (!loading && !signedIn) router.replace(authEntryPath(role, pathname));
  }, [loading, pathname, role, router, signedIn]);

  if (loading) {
    return <main className="auth-screen"><p>Loading Hawelly…</p></main>;
  }
  if (user && user.role !== role) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <Link className="brand" href="/">Hawelly</Link>
          <h1>This workspace is not available for your account.</h1>
          <p>Signed in as {user.fullName} ({user.role.toLowerCase()}).</p>
          <Link className="primary-action auth-continue" href={portalHome(user.role)}>
            Go to your workspace
          </Link>
          <Button onClick={() => void logout()} variant="outline">Sign out</Button>
        </section>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="auth-screen">
        <p>Opening secure sign in…</p>
      </main>
    );
  }
  return children;
}
