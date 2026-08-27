import { OperationsPortal } from "../../components/operations/operations-portal";
import { LoginGate } from "../../components/auth/login-gate";

export default function StaffPage() {
  return <LoginGate role="STAFF"><OperationsPortal role="staff" /></LoginGate>;
}
