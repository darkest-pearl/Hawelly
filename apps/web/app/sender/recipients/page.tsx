import { LoginGate } from "../../../components/auth/login-gate";
import { RecipientsManager } from "../../../components/sender/recipients-manager";

export default function RecipientsPage() {
  return <LoginGate role="SENDER"><RecipientsManager /></LoginGate>;
}

