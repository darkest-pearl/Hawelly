import { LoginGate } from "../../../components/auth/login-gate";
import { TransferRequestForm } from "../../../components/sender/transfer-request-form";

export default function NewTransferPage() {
  return <LoginGate role="SENDER"><TransferRequestForm /></LoginGate>;
}

