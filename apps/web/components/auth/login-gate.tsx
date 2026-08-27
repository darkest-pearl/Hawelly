"use client";

import { useState, type FormEvent, type ReactNode } from "react";
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
  const { user, loading, login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="auth-screen"><p>Loading Hawelly…</p></main>;
  }
  if (user && user.role !== role) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <a className="brand" href="/">Hawelly</a>
          <h1>This workspace is not available for your account.</h1>
          <p>Signed in as {user.fullName} ({user.role.toLowerCase()}).</p>
          <Button onClick={() => void logout()} variant="outline">Sign out</Button>
        </section>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="auth-screen">
        <form className="auth-panel" onSubmit={submit}>
          <a className="brand" href="/">Hawelly</a>
          <h1>Sign in</h1>
          <p>Use your Hawelly {role.toLowerCase()} account.</p>
          <label>Email<input autoComplete="username" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label>Password<input autoComplete="current-password" maxLength={128} minLength={1} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          <Button disabled={submitting} fullWidth type="submit">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </main>
    );
  }
  return children;
}

