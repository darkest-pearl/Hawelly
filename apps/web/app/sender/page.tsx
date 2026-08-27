import { LoginGate } from "../../components/auth/login-gate";
import { SenderDashboard } from "../../components/sender/sender-dashboard";

export default function SenderPage() {
  return <LoginGate role="SENDER"><SenderDashboard /></LoginGate>;
}
