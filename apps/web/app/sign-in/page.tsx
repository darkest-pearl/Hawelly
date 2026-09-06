import { AuthEntry } from "../../components/auth/auth-entry";
import {
  parsePortalRole,
  safeAuthDestination
} from "../../lib/auth-destination";

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const parameters = await searchParams;
  const portalRole = parsePortalRole(parameters.portal);
  const destination = safeAuthDestination(parameters.next, portalRole);
  return (
    <AuthEntry
      destination={destination}
      mode="login"
      portalRole={portalRole}
    />
  );
}
