import { AuthEntry } from "../../components/auth/auth-entry";
import { safeAuthDestination } from "../../lib/auth-destination";

interface RegisterPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const parameters = await searchParams;
  return (
    <AuthEntry
      destination={safeAuthDestination(parameters.next, "SENDER")}
      mode="register"
      portalRole="SENDER"
    />
  );
}
