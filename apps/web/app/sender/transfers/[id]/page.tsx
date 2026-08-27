import { LoginGate } from "../../../../components/auth/login-gate";
import { TransferDetail } from "../../../../components/sender/transfer-detail";

export default async function TransferPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LoginGate role="SENDER"><TransferDetail transferId={id} /></LoginGate>;
}

