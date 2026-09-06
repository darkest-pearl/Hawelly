"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { portalHome, type PortalRole } from "../../lib/auth-destination";
import { Button } from "../ui/button";
import { useAuth } from "./auth-provider";

export function AuthEntry({
  destination,
  mode,
  portalRole
}: {
  destination: string;
  mode: "login" | "register";
  portalRole: PortalRole;
}) {
  const router = useRouter();
  const { user, loading, login, register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const signedInRole = user?.role;

  useEffect(() => {
    if (signedInRole) {
      router.replace(
        signedInRole === portalRole ? destination : portalHome(signedInRole)
      );
    }
  }, [destination, portalRole, router, signedInRole]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const current = mode === "register"
        ? await register(fullName.trim(), email.trim(), password)
        : await login(email.trim(), password);
      router.replace(current.role === portalRole ? destination : portalHome(current.role));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request could not be completed");
    } finally {
      setSubmitting(false);
    }
  }

  const isRegistration = mode === "register";
  const portalLabel = portalRole === "SENDER" ? "sender" : portalRole.toLowerCase();
  const alternativeHref = isRegistration
    ? `/sign-in?next=${encodeURIComponent(destination)}`
    : `/register?next=${encodeURIComponent(destination)}`;

  return (
    <main className="auth-screen">
      <section className="auth-context" aria-label="Hawelly transfer process">
        <Link className="brand brand-inverse" href="/">Hawelly</Link>
        <p className="eyebrow">Controlled beta</p>
        <h1>{isRegistration ? "Create your sender account." : `Enter the ${portalLabel} workspace.`}</h1>
        <p>
          {isRegistration
            ? "Start with a recipient and transfer request. Hawelly staff prepare the quote before you decide."
            : "Sign in to continue securely. Your portal access is determined by your account, not this page."}
        </p>
        <ol className="auth-route" aria-label="Transfer steps">
          <li><span>1</span>Request</li>
          <li><span>2</span>Review</li>
          <li><span>3</span>Decide</li>
        </ol>
      </section>

      <form className="auth-panel" onSubmit={submit}>
        <div>
          <p className="eyebrow">{isRegistration ? "Sender registration" : `${portalLabel} access`}</p>
          <h2>{isRegistration ? "Create account" : "Sign in"}</h2>
          <p>
            {isRegistration
              ? "Public registration creates a sender account only."
              : `Use your Hawelly ${portalLabel} account.`}
          </p>
        </div>
        {isRegistration ? (
          <label>
            Full name
            <input
              autoComplete="name"
              maxLength={160}
              minLength={1}
              onChange={(event) => setFullName(event.target.value)}
              required
              value={fullName}
            />
          </label>
        ) : null}
        <label>
          Email
          <input
            autoCapitalize="none"
            autoComplete="username"
            maxLength={320}
            onChange={(event) => setEmail(event.target.value)}
            required
            spellCheck={false}
            type="email"
            value={email}
          />
        </label>
        <label>
          Password
          <input
            aria-describedby={isRegistration ? "password-guidance" : undefined}
            autoComplete={isRegistration ? "new-password" : "current-password"}
            maxLength={128}
            minLength={isRegistration ? 12 : 1}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {isRegistration ? (
          <>
            <p className="field-hint" id="password-guidance">Use 12–128 characters.</p>
            <label>
              Confirm password
              <input
                autoComplete="new-password"
                maxLength={128}
                minLength={12}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </label>
          </>
        ) : null}
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <Button disabled={submitting || loading} fullWidth type="submit">
          {submitting
            ? isRegistration ? "Creating account…" : "Signing in…"
            : isRegistration ? "Create sender account" : "Sign in"}
        </Button>
        {portalRole === "SENDER" ? (
          <p className="auth-alternative">
            {isRegistration ? "Already have an account?" : "New to Hawelly?"}{" "}
            <Link href={alternativeHref}>{isRegistration ? "Sign in" : "Create a sender account"}</Link>
          </p>
        ) : null}
        <Link className="auth-back" href="/">← Back to Hawelly</Link>
      </form>
    </main>
  );
}
