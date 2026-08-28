"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import { formatMinorAmount, type DisputeRecord, type ResolutionState } from "../../lib/workflow";
import { Button } from "../ui/button";

export function ResolutionActions({ transfer, isAdmin, canManageDisputes, canManageRefunds, onStatus }: {
  transfer: { id: string; status: string };
  isAdmin: boolean;
  canManageDisputes: boolean;
  canManageRefunds: boolean;
  onStatus(status: string): void;
}) {
  const [state, setState] = useState<ResolutionState | null>(null);
  const [reason, setReason] = useState("");
  const [senderFacingReason, setSenderFacingReason] = useState("");
  const [action, setAction] = useState("RESUME");
  const [externalReference, setExternalReference] = useState("");
  const [refundedAt, setRefundedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);

  async function reload() {
    const result = await apiFetch<ResolutionState>(`/operations/transfers/${transfer.id}/resolution`);
    setState(result); onStatus(result.transferStatus);
  }

  useEffect(() => {
    let active = true;
    apiFetch<ResolutionState>(`/operations/transfers/${transfer.id}/resolution`).then((result) => { if (active) setState(result); }).catch((caught) => { if (active) setError(errorMessage(caught)); });
    return () => { active = false; };
  }, [transfer.id]);

  async function simpleAction(path: string, body: Record<string, string>) {
    setActing(true); setError("");
    try { const result = await apiFetch<{ transferStatus: string }>(`/operations/transfers/${transfer.id}/${path}`, { method: "POST", body: JSON.stringify(body) }); onStatus(result.transferStatus); await reload(); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActing(false); }
  }

  async function review(dispute: DisputeRecord) {
    setActing(true); setError("");
    try { await apiFetch(`/operations/transfers/${transfer.id}/disputes/${dispute.id}/review`, { method: "POST", body: "{}" }); await reload(); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActing(false); }
  }

  async function resolve(event: FormEvent<HTMLFormElement>, dispute: DisputeRecord) {
    event.preventDefault(); setActing(true); setError("");
    try { const result = await apiFetch<{ transferStatus: string }>(`/operations/transfers/${transfer.id}/disputes/${dispute.id}/resolve`, { method: "POST", body: JSON.stringify({ action, resolution: reason.trim(), ...(senderFacingReason.trim() ? { senderFacingReason: senderFacingReason.trim() } : {}) }) }); onStatus(result.transferStatus); setReason(""); setSenderFacingReason(""); await reload(); }
    catch (caught) { setError(errorMessage(caught)); } finally { setActing(false); }
  }

  async function startRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); await simpleAction("refund", { reason: reason.trim(), senderFacingReason: senderFacingReason.trim() });
  }

  async function confirmRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); await simpleAction("refund-confirmation", { externalReference: externalReference.trim(), refundedAt: new Date(refundedAt).toISOString(), reason: reason.trim() });
  }

  const activeDispute = state?.disputes.find((item) => item.status === "OPEN" || item.status === "IN_REVIEW");
  return <div className="detail-actions resolution-actions">
    <h3>Confirmation and exceptions</h3>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {transfer.status === "PAYOUT_REPORTED" ? <><p className="detail-note">Staff payout evidence is recorded. Request the sender’s recipient-received signal next.</p><Button disabled={acting} fullWidth onClick={() => void simpleAction("confirmation-request", {})}>Request recipient confirmation</Button>{isAdmin ? <><label>Admin completion reason<textarea maxLength={1000} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} /></label><Button disabled={acting || !reason.trim()} fullWidth onClick={() => void simpleAction("admin-completion", { reason: reason.trim() })} variant="outline">Complete from staff evidence</Button></> : null}</> : null}
    {transfer.status === "CONFIRMATION_PENDING" ? <p className="detail-note">Waiting for the sender to confirm recipient receipt.</p> : null}
    {activeDispute ? <article className="funding-review-card"><strong>{activeDispute.category.toLowerCase().replaceAll("_", " ")}</strong><span>{activeDispute.reason}</span>{canManageDisputes ? activeDispute.status === "OPEN" ? <Button disabled={acting} onClick={() => void review(activeDispute)}>Start review</Button> : <form className="funding-publish-form" onSubmit={(event) => void resolve(event, activeDispute)}><label>Resolution action<select onChange={(event) => setAction(event.target.value)} value={action}><option value="RESUME">Resume workflow</option><option value="REJECT">Reject dispute and resume</option><option value="REFUND">Start refund</option>{isAdmin ? <><option value="COMPLETE">Complete transfer</option><option value="FAIL">Mark failed</option></> : null}</select></label><label>Internal resolution<textarea maxLength={4000} onChange={(event) => setReason(event.target.value)} required rows={3} value={reason} /></label><label>Sender update<textarea maxLength={1000} onChange={(event) => setSenderFacingReason(event.target.value)} rows={2} value={senderFacingReason} /></label><Button disabled={acting || !reason.trim()} type="submit">Resolve dispute</Button></form> : <span>Requires dispute management capability.</span>}</article> : null}
    {canManageRefunds && ["FUNDS_CONFIRMED", "ON_HOLD"].includes(transfer.status) && !state?.refund ? <form className="funding-publish-form" onSubmit={startRefund}><strong>Start refund</strong><label>Internal reason<textarea maxLength={2000} onChange={(event) => setReason(event.target.value)} required rows={3} value={reason} /></label><label>Sender-facing reason<textarea maxLength={1000} onChange={(event) => setSenderFacingReason(event.target.value)} required rows={2} value={senderFacingReason} /></label><Button disabled={acting || !reason.trim() || !senderFacingReason.trim()} type="submit" variant="outline">Move to refund pending</Button></form> : null}
    {state?.refund ? <article className="funding-review-card"><strong>{formatMinorAmount(state.refund.amountMinor, state.refund.currency)} · {state.refund.status}</strong><span>{state.refund.senderFacingReason}</span>{state.refund.status === "PENDING" && isAdmin ? <form className="funding-publish-form" onSubmit={confirmRefund}><label>External refund reference<input maxLength={300} onChange={(event) => setExternalReference(event.target.value)} required value={externalReference} /></label><label>Refunded at<input onChange={(event) => setRefundedAt(event.target.value)} required type="datetime-local" value={refundedAt} /></label><label>Admin confirmation reason<textarea maxLength={1000} onChange={(event) => setReason(event.target.value)} required rows={2} value={reason} /></label><Button disabled={acting || !externalReference.trim() || !reason.trim()} type="submit">Confirm refund completed</Button></form> : null}</article> : null}
  </div>;
}
