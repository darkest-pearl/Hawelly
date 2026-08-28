"use client";

import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import { formatMinorAmount, payoutMethodLabels, type SenderPayoutState } from "../../lib/workflow";
import { StatusBadge } from "../ui/status-badge";

const visibleStatuses = new Set(["FUNDS_CONFIRMED", "PAYOUT_IN_PROGRESS", "PAYOUT_REPORTED", "CONFIRMATION_PENDING", "COMPLETED", "ON_HOLD"]);

export function PayoutPanel({ transferId, transferStatus }: { transferId: string; transferStatus: string }) {
  const [state, setState] = useState<SenderPayoutState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visibleStatuses.has(transferStatus)) return;
    let active = true;
    apiFetch<SenderPayoutState>(`/transfers/${transferId}/payout`)
      .then((result) => { if (active) setState(result); })
      .catch((caught) => { if (active) setError(errorMessage(caught)); });
    return () => { active = false; };
  }, [transferId, transferStatus]);

  if (!visibleStatuses.has(transferStatus)) return null;
  const payout = state?.payout;
  return (
    <section className="active-quote payout-panel" aria-labelledby="payout-title">
      <div className="active-quote-heading"><StatusBadge label={transferStatus === "PAYOUT_REPORTED" ? "Sent" : transferStatus === "ON_HOLD" ? "Attention" : "In progress"} tone={transferStatus === "PAYOUT_REPORTED" ? "success" : transferStatus === "ON_HOLD" ? "warning" : "info"} /><h2 id="payout-title">Recipient payout</h2></div>
      {error ? <p className="page-error" role="alert">{error}</p> : null}
      {!payout && transferStatus === "FUNDS_CONFIRMED" ? <p>Funds are confirmed. Hawelly is preparing the recipient payout.</p> : null}
      {payout ? <>
        <dl className="detail-summary-grid payout-summary"><div><dt>Recipient gets</dt><dd>{formatMinorAmount(payout.amountMinor, payout.currency)}</dd></div><div><dt>Method</dt><dd>{payoutMethodLabels[payout.payoutMethod]}</dd></div><div><dt>Expected by</dt><dd>{new Date(payout.expectedBy).toLocaleString()}</dd></div>{payout.completedAt ? <div><dt>Reported sent</dt><dd>{new Date(payout.completedAt).toLocaleString()}</dd></div> : null}</dl>
        {payout.senderFacingNote ? <p>{payout.senderFacingNote}</p> : null}
        <p className={transferStatus === "PAYOUT_REPORTED" ? "success-note" : "funding-guidance"}>{transferStatus === "PAYOUT_REPORTED" ? "Hawelly has recorded the payout as sent. Recipient confirmation is the next step." : transferStatus === "ON_HOLD" ? "This payout needs an operational check. Hawelly will update you when it resumes." : "Hawelly staff are coordinating the payout outside the platform."}</p>
      </> : null}
    </section>
  );
}
