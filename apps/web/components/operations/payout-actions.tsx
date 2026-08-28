"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import { formatMinorAmount, payoutMethodLabels, type AssociateRecord, type OperationsPayoutState, type PayoutEvidenceRecord } from "../../lib/workflow";
import { Button } from "../ui/button";

function localDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function PayoutActions({ transfer, canViewAssociates, canManageAssociates, onStatus }: {
  transfer: { id: string; status: string; destinationCountry: string; requestedPayoutMethod: "BANK_TRANSFER" | "CASH_PICKUP" | "MOBILE_MONEY" | "OTHER" };
  canViewAssociates: boolean;
  canManageAssociates: boolean;
  onStatus(status: string): void;
}) {
  const [state, setState] = useState<OperationsPayoutState | null>(null);
  const [associates, setAssociates] = useState<AssociateRecord[]>([]);
  const [associateId, setAssociateId] = useState("");
  const [expectedBy, setExpectedBy] = useState(() => localDateTime(new Date(Date.now() + 86_400_000)));
  const [externalReference, setExternalReference] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [senderFacingNote, setSenderFacingNote] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [completedAt, setCompletedAt] = useState(() => localDateTime(new Date()));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [showAssociateForm, setShowAssociateForm] = useState(false);
  const [newAssociate, setNewAssociate] = useState({ businessName: "", country: transfer.destinationCountry, city: "", currency: "", email: "" });

  async function reload() {
    const result = await apiFetch<OperationsPayoutState>(`/operations/transfers/${transfer.id}/payout`);
    setState(result);
    onStatus(result.transferStatus);
  }

  async function reloadAssociates() {
    if (!canViewAssociates) return;
    const result = await apiFetch<{ associates: AssociateRecord[] }>("/operations/associates");
    setAssociates(result.associates);
  }

  useEffect(() => {
    let active = true;
    setState(null);
    setError("");
    Promise.all([
      apiFetch<OperationsPayoutState>(`/operations/transfers/${transfer.id}/payout`),
      canViewAssociates ? apiFetch<{ associates: AssociateRecord[] }>("/operations/associates") : Promise.resolve({ associates: [] })
    ]).then(([payoutResult, associateResult]) => {
      if (!active) return;
      setState(payoutResult);
      setAssociates(associateResult.associates);
      const currentAssociate = payoutResult.payoutCase?.associateContactId || "";
      setAssociateId(currentAssociate);
      if (payoutResult.payoutCase) {
        setExpectedBy(localDateTime(new Date(payoutResult.payoutCase.expectedBy)));
        setExternalReference(payoutResult.payoutCase.externalReference || "");
        setInternalNote(payoutResult.payoutCase.internalNote || "");
        setSenderFacingNote(payoutResult.payoutCase.senderFacingNote || "");
      }
    }).catch((caught) => { if (active) setError(errorMessage(caught)); });
    return () => { active = false; };
  }, [transfer.id, canViewAssociates]);

  const compatibleAssociates = useMemo(() => associates.filter((associate) => associate.status === "ACTIVE" && associate.countries.includes(transfer.destinationCountry) && associate.payoutMethods.includes(transfer.requestedPayoutMethod)), [associates, transfer.destinationCountry, transfer.requestedPayoutMethod]);
  const payoutCase = state?.payoutCase;

  async function createCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setActing(true); setError("");
    try {
      await apiFetch(`/operations/transfers/${transfer.id}/payout-case`, { method: "POST", body: JSON.stringify({ expectedBy: new Date(expectedBy).toISOString(), ...(associateId ? { associateContactId: associateId } : {}), ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}), ...(senderFacingNote.trim() ? { senderFacingNote: senderFacingNote.trim() } : {}) }) });
      await reload();
    } catch (caught) { setError(errorMessage(caught)); } finally { setActing(false); }
  }

  async function saveCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setActing(true); setError("");
    try {
      await apiFetch(`/operations/transfers/${transfer.id}/payout-case`, { method: "PATCH", body: JSON.stringify({ expectedBy: new Date(expectedBy).toISOString(), ...(associateId ? { associateContactId: associateId } : {}), ...(externalReference.trim() ? { externalReference: externalReference.trim() } : {}), ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}), ...(senderFacingNote.trim() ? { senderFacingNote: senderFacingNote.trim() } : {}) }) });
      await reload();
    } catch (caught) { setError(errorMessage(caught)); } finally { setActing(false); }
  }

  async function addAssociate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setActing(true); setError("");
    try {
      const result = await apiFetch<{ associate: AssociateRecord }>("/operations/associates", { method: "POST", body: JSON.stringify({
        businessName: newAssociate.businessName.trim(), countries: [newAssociate.country.trim().toUpperCase()], cities: newAssociate.city.trim() ? [newAssociate.city.trim()] : [], payoutMethods: [transfer.requestedPayoutMethod], currencies: [newAssociate.currency.trim().toUpperCase()], contactChannels: { operationsEmail: newAssociate.email.trim() }
      }) });
      await reloadAssociates(); setAssociateId(result.associate.id); setShowAssociateForm(false);
    } catch (caught) { setError(errorMessage(caught)); } finally { setActing(false); }
  }

  async function addEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setActing(true); setError("");
    try {
      const result = await apiFetch<{ evidence: PayoutEvidenceRecord; upload: null | { url: string; contentType: string } }>(`/operations/transfers/${transfer.id}/payout-evidence`, { method: "POST", body: JSON.stringify({ ...(evidenceReference.trim() ? { externalReference: evidenceReference.trim() } : {}), ...(evidenceFile ? { attachment: { filename: evidenceFile.name, contentType: evidenceFile.type, sizeBytes: evidenceFile.size } } : {}) }) });
      if (result.upload && evidenceFile) {
        const upload = await fetch(result.upload.url, { method: "PUT", body: evidenceFile, headers: { "Content-Type": result.upload.contentType }, credentials: "omit" });
        if (!upload.ok) throw new Error("Payout receipt upload failed");
      }
      setEvidenceReference(""); setEvidenceFile(null); await reload();
    } catch (caught) { setError(errorMessage(caught)); } finally { setActing(false); }
  }

  async function download(evidenceId: string) {
    setError("");
    try {
      const result = await apiFetch<{ url: string }>(`/operations/transfers/${transfer.id}/payout-evidence/${evidenceId}/read-url`, { method: "POST", body: "{}" });
      const anchor = document.createElement("a"); anchor.href = result.url; anchor.rel = "noopener noreferrer"; anchor.target = "_blank"; anchor.click();
    } catch (caught) { setError(errorMessage(caught)); }
  }

  async function changeHold(action: "hold" | "release") {
    if (!reason.trim()) return; setActing(true); setError("");
    try {
      await apiFetch(`/operations/transfers/${transfer.id}/payout-${action}`, { method: "POST", body: JSON.stringify({ reason: reason.trim(), ...(senderFacingNote.trim() ? { senderFacingNote: senderFacingNote.trim() } : {}) }) });
      setReason(""); await reload();
    } catch (caught) { setError(errorMessage(caught)); } finally { setActing(false); }
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!payoutCase) return; setActing(true); setError("");
    try {
      await apiFetch(`/operations/transfers/${transfer.id}/payout-report`, { method: "POST", body: JSON.stringify({ completedAmountMinor: payoutCase.amountMinor, currency: payoutCase.currency, completedAt: new Date(completedAt).toISOString(), ...(externalReference.trim() ? { externalReference: externalReference.trim() } : {}), ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}), ...(senderFacingNote.trim() ? { senderFacingNote: senderFacingNote.trim() } : {}) }) });
      await reload();
    } catch (caught) { setError(errorMessage(caught)); } finally { setActing(false); }
  }

  return <div className="detail-actions payout-actions">
    <h3>Payout operations</h3>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {!payoutCase && transfer.status === "FUNDS_CONFIRMED" ? <form className="funding-publish-form" onSubmit={createCase}>
      {canViewAssociates ? <label>Associate contact<select onChange={(event) => setAssociateId(event.target.value)} value={associateId}><option value="">Assign later</option>{compatibleAssociates.map((associate) => <option key={associate.id} value={associate.id}>{associate.businessName}</option>)}</select></label> : null}
      <label>Expected delivery<input min={localDateTime(new Date())} onChange={(event) => setExpectedBy(event.target.value)} required type="datetime-local" value={expectedBy} /></label>
      <label>Sender update<textarea maxLength={500} onChange={(event) => setSenderFacingNote(event.target.value)} rows={2} value={senderFacingNote} /></label>
      <Button disabled={acting} fullWidth type="submit">{acting ? "Starting…" : "Start payout case"}</Button>
    </form> : null}
    {canManageAssociates && state && !payoutCase && transfer.status === "FUNDS_CONFIRMED" ? <><Button onClick={() => setShowAssociateForm((value) => !value)} variant="ghost">{showAssociateForm ? "Close associate form" : "Add associate contact"}</Button>{showAssociateForm ? <form className="funding-publish-form" onSubmit={addAssociate}><label>Business name<input maxLength={200} onChange={(event) => setNewAssociate((value) => ({ ...value, businessName: event.target.value }))} required value={newAssociate.businessName} /></label><label>Country<input maxLength={2} onChange={(event) => setNewAssociate((value) => ({ ...value, country: event.target.value }))} required value={newAssociate.country} /></label><label>City<input maxLength={120} onChange={(event) => setNewAssociate((value) => ({ ...value, city: event.target.value }))} value={newAssociate.city} /></label><label>Payout currency<input maxLength={3} onChange={(event) => setNewAssociate((value) => ({ ...value, currency: event.target.value }))} required value={newAssociate.currency} /></label><label>Operations email<input maxLength={320} onChange={(event) => setNewAssociate((value) => ({ ...value, email: event.target.value }))} required type="email" value={newAssociate.email} /></label><Button disabled={acting} type="submit">Save associate</Button></form> : null}</> : null}
    {payoutCase ? <>
      <dl className="compact-funding"><div><dt>Committed payout</dt><dd>{formatMinorAmount(payoutCase.amountMinor, payoutCase.currency)}</dd></div><div><dt>Method</dt><dd>{payoutMethodLabels[payoutCase.payoutMethod]}</dd></div><div><dt>Owner</dt><dd>{payoutCase.staffOwner?.fullName || "Assigned staff"}</dd></div><div><dt>Associate</dt><dd>{payoutCase.associate?.businessName || "Not assigned"}</dd></div></dl>
      {payoutCase.status === "IN_PROGRESS" ? <form className="funding-publish-form" onSubmit={saveCase}>{canViewAssociates ? <label>Associate<select onChange={(event) => setAssociateId(event.target.value)} value={associateId}><option value="">Not assigned</option>{compatibleAssociates.map((associate) => <option key={associate.id} value={associate.id}>{associate.businessName}</option>)}</select></label> : null}<label>Expected delivery<input min={localDateTime(new Date())} onChange={(event) => setExpectedBy(event.target.value)} required type="datetime-local" value={expectedBy} /></label><label>External reference<input maxLength={300} onChange={(event) => setExternalReference(event.target.value)} value={externalReference} /></label><label>Internal note<textarea maxLength={2000} onChange={(event) => setInternalNote(event.target.value)} rows={2} value={internalNote} /></label><label>Sender update<textarea maxLength={500} onChange={(event) => setSenderFacingNote(event.target.value)} rows={2} value={senderFacingNote} /></label><Button disabled={acting} type="submit" variant="outline">Save case details</Button></form> : null}
      {payoutCase.status === "IN_PROGRESS" ? <form className="funding-publish-form" onSubmit={addEvidence}><strong>Payout evidence</strong><label>External reference<input maxLength={300} onChange={(event) => setEvidenceReference(event.target.value)} value={evidenceReference} /></label><label>Receipt (PDF, JPEG, or PNG)<input accept="application/pdf,image/jpeg,image/png" onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)} type="file" /></label><Button disabled={acting || (!evidenceReference.trim() && !evidenceFile)} type="submit">Record evidence</Button></form> : null}
      {payoutCase.evidence.map((evidence) => <article className="funding-review-card" key={evidence.id}><strong>{evidence.externalReference || evidence.originalFilename || "Payout evidence"}</strong><span>{evidence.uploadedAt ? "Receipt stored" : evidence.originalFilename ? "Upload pending" : "Reference recorded"}</span>{evidence.hasAttachment ? <Button onClick={() => void download(evidence.id)} variant="ghost">View receipt</Button> : null}</article>)}
      {payoutCase.status === "IN_PROGRESS" ? <><form className="funding-publish-form" onSubmit={report}><strong>Report payout sent</strong><p className="detail-note">This records the exact committed payout as sent. It does not mark the transfer completed.</p><label>Completed at<input onChange={(event) => setCompletedAt(event.target.value)} required type="datetime-local" value={completedAt} /></label><Button disabled={acting || (!externalReference.trim() && !payoutCase.evidence.some((item) => item.externalReference || item.uploadedAt)) || !payoutCase.associateContactId} type="submit">Report payout</Button></form><label>Hold reason<textarea maxLength={1000} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} /></label><Button disabled={acting || !reason.trim()} onClick={() => void changeHold("hold")} variant="outline">Place payout on hold</Button></> : null}
      {payoutCase.status === "ON_HOLD" ? <><label>Release reason<textarea maxLength={1000} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} /></label><Button disabled={acting || !reason.trim()} onClick={() => void changeHold("release")}>Release payout hold</Button></> : null}
      {payoutCase.status === "REPORTED" ? <p className="success-note">Payout reported. Awaiting the confirmation workflow.</p> : null}
    </> : null}
  </div>;
}
