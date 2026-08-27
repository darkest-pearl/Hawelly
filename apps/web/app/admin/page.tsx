import { OperationsPortal } from "../../components/operations/operations-portal";
import { LoginGate } from "../../components/auth/login-gate";

export default function AdminPage() {
  return <LoginGate role="ADMIN"><OperationsPortal role="admin" /></LoginGate>;
}
