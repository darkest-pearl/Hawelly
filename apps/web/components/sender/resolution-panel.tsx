"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import { formatMinorAmount, type ResolutionState } from "../../lib/workflow";
import { Button } from "../ui/button";
import { StatusBadge } from "../ui/status-badge";

const visible = new Set(["PAYOUT_IN_PROGRESS", "PAYOUT_REPORTED", "CONFIRMATION_PENDING", "COMPLETED", "DISPUTED", "REFUND_PENDING", "REFUNDED"]);
const disputable = new Set(["PAYOUT_IN_PROGRESS", "PAYOUT_REPORTED", "CONFIRMATION_PENDING"]);

export function ResolutionPanel({ transferId, transferStatus, onStatus }: { transferId: string; transferStatus: string; onStatus(status: string): void }) {
  const [state, setState] = useState<ResolutionState | null>(null);
  const [category, setCategory] = useState("RECIPIENT_NOT_PAID");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);

  async function reload() {
    const result = await apiFetch<ResolutionState>(`/transfers/${transferId}/resolution`);
    setState(result); onStatus(result.transferStatus);
  }

  useEffect(() => {
    if (!visible.has(transferStatus)) return;
    let active = true;
    apiFetch<ResolutionState>(`/transfers/${transferId}/resolution`).then((result) => { if (active) setState(result); }).catch((caught) => { if (active) setError(errorMessage(caught)); });
    return () => { active = false; };
  }, [transferId, transferStatus]);

  async function confirm() {
    if (!window.confirm("Confirm that your recipient received the money?")) return;
    setActing(true); setError("");
    try { await apiFetch(`/transfers/${transferId}/recipient-confirmation`, { method: "POST", body: JSON.stringify({ ...(note.trim() ? { note: note.trim() } : {}) }) }); await reload(); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActing(false); }
  }

  async function dispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!window.confirm("Open a dispute and pause this transfer?")) return;
    setActing(true); setError("");
    try { await apiFetch(`/transfers/${transferId}/disputes`, { method: "POST", body: JSON.stringify({ category, reason: reason.trim() }) }); setReason(""); await reload(); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActing(false); }
  }

  if (!visible.has(transferStatus)) return null;
  const activeDispute = state?.disputes.find((item) => item.status === "OPEN" || item.status === "IN_REVIEW");
  return <section className="active-quote resolution-panel" aria-labelledby="resolution-title">
    <h2 id="resolution-title">Confirmation and support</h2>
    {error ? <p className="page-error" role="alert">{error}</p> : null}
    {transferStatus === "CONFIRMATION_PENDING" ? <div className="confirmation-callout"><StatusBadge label="Confirmation requested" tone="warning" /><p>Only confirm after your recipient has actually received the money.</p><label>Optional note<textarea maxLength={1000} onChange={(event) => setNote(event.target.value)} rows={2} value={note} /></label><Button disabled={acting} onClick={() => void confirm()}>My recipient received the money</Button></div> : null}
    {state?.confirmations.length ? <div className="confirmation-history"><h3>Confirmation history</h3>{state.confirmations.map((item) => <p key={item.id}><strong>{item.source === "STAFF" ? "Hawelly payout report" : item.source === "SENDER" ? "You confirmed receipt" : "Recipient confirmation"}</strong><span>{new Date(item.confirmedAt).toLocaleString()}</span></p>)}</div> : null}
    {activeDispute ? <div className="confirmation-callout"><StatusBadge label={activeDispute.status === "IN_REVIEW" ? "Under review" : "Dispute open"} tone="warning" /><p>Hawelly is reviewing the payout issue. Financial processing stays paused until an authorized resolution.</p></div> : null}
    {state?.refund ? <div className="confirmation-callout"><StatusBadge label={state.refund.status === "REFUNDED" ? "Refunded" : "Refund in progress"} tone={state.refund.status === "REFUNDED" ? "success" : "warning"} /><p><strong>{formatMinorAmount(state.refund.amountMinor, state.refund.currency)}</strong> · {state.refund.senderFacingReason}</p>{state.refund.refundedAt ? <p>Recorded refunded {new Date(state.refund.refundedAt).toLocaleString()}.</p> : null}</div> : null}
    {!activeDispute && disputable.has(transferStatus) ? <form className="funding-proof-form" onSubmit={dispute}><h3>Report a payout problem</h3><label>Issue<select onChange={(event) => setCategory(event.target.value)} value={category}><option value="RECIPIENT_NOT_PAID">Recipient has not received it</option><option value="WRONG_AMOUNT">Recipient received the wrong amount</option><option value="PAYOUT_DELAYED">Payout is delayed</option><option value="OTHER">Other issue</option></select></label><label>What happened?<textarea maxLength={2000} onChange={(event) => setReason(event.target.value)} required rows={3} value={reason} /></label><Button disabled={acting || !reason.trim()} type="submit" variant="outline">Open dispute</Button></form> : null}
  </section>;
}
