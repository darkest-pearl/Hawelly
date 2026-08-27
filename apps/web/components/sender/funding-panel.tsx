"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import { formatMinorAmount, majorToMinor, type FundingState } from "../../lib/workflow";
import { Button } from "../ui/button";
import { StatusBadge } from "../ui/status-badge";

const visibleStatuses = new Set(["QUOTE_ACCEPTED", "FUNDING_PENDING", "FUNDING_SUBMITTED", "FUNDS_CONFIRMED"]);

function proofLabel(status: FundingState["proofs"][number]["status"]) {
  return status.toLowerCase().replaceAll("_", " ");
}

export function FundingPanel({ transferId, transferStatus, onStatus }: {
  transferId: string;
  transferStatus: string;
  onStatus(status: string): void;
}) {
  const [funding, setFunding] = useState<FundingState | null>(null);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [transferredAt, setTransferredAt] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const result = await apiFetch<FundingState>(`/transfers/${transferId}/funding`);
    setFunding(result);
    onStatus(result.transferStatus);
  }, [onStatus, transferId]);

  useEffect(() => {
    if (!visibleStatuses.has(transferStatus)) return;
    let active = true;
    apiFetch<FundingState>(`/transfers/${transferId}/funding`)
      .then((result) => {
        if (active) setFunding(result);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => { active = false; };
  }, [transferId, transferStatus]);

  if (!visibleStatuses.has(transferStatus)) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = amount.trim() ? majorToMinor(amount) : null;
    if (amount.trim() && !amountMinor) {
      setError("Enter a valid amount paid.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch<{
        proof: FundingState["proofs"][number];
        upload: { url: string; method: "PUT"; contentType: string } | null;
      }>(`/transfers/${transferId}/funding-proofs`, {
        method: "POST",
        body: JSON.stringify({
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          ...(amountMinor && funding?.instruction ? { amountMinor, currency: funding.instruction.currency } : {}),
          ...(transferredAt ? { transferredAt: new Date(transferredAt).toISOString() } : {}),
          ...(note.trim() ? { senderNote: note.trim() } : {}),
          ...(file ? { attachment: { filename: file.name, contentType: file.type, sizeBytes: file.size } } : {})
        })
      });
      if (result.upload && file) {
        const uploadResponse = await fetch(result.upload.url, {
          method: result.upload.method,
          headers: { "Content-Type": result.upload.contentType },
          body: file
        });
        if (!uploadResponse.ok) {
          const payload = await uploadResponse.json().catch(() => null) as { error?: { message?: string } } | null;
          throw new Error(payload?.error?.message || "Receipt upload could not be completed.");
        }
      }
      setReference("");
      setAmount("");
      setTransferredAt("");
      setNote("");
      setFile(null);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function download(proofId: string) {
    setError("");
    try {
      const result = await apiFetch<{ url: string }>(`/transfers/${transferId}/funding-proofs/${proofId}/read-url`, { method: "POST", body: "{}" });
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.rel = "noopener noreferrer";
      anchor.target = "_blank";
      anchor.click();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section className="funding-panel" aria-labelledby="funding-title">
      <div className="active-quote-heading"><StatusBadge label={transferStatus === "FUNDS_CONFIRMED" ? "Confirmed" : "Funding"} tone={transferStatus === "FUNDS_CONFIRMED" ? "success" : "info"} /><h2 id="funding-title">Funding</h2></div>
      {error ? <p className="page-error" role="alert">{error}</p> : null}
      {!funding?.instruction ? <p>Hawelly is preparing your funding instructions. Do not send money until they appear here.</p> : (
        <>
          <dl className="funding-instructions">
            <div><dt>Amount to send</dt><dd>{formatMinorAmount(funding.instruction.amountMinor, funding.instruction.currency)}</dd></div>
            <div><dt>Payee</dt><dd>{funding.instruction.payeeName}</dd></div>
            {funding.instruction.provider ? <div><dt>Bank or provider</dt><dd>{funding.instruction.provider}</dd></div> : null}
            {funding.instruction.accountReference ? <div><dt>Account details</dt><dd>{funding.instruction.accountReference}</dd></div> : null}
            <div><dt>Your required reference</dt><dd><strong>{funding.instruction.senderReference}</strong></dd></div>
            {funding.instruction.validUntil ? <div><dt>Valid until</dt><dd>{new Date(funding.instruction.validUntil).toLocaleString()}</dd></div> : null}
          </dl>
          <p className="funding-guidance">{funding.instruction.instructions}</p>
        </>
      )}
      {funding?.instruction && transferStatus === "FUNDING_PENDING" ? (
        <form className="funding-proof-form" onSubmit={submit}>
          <h3>Submit payment details</h3>
          <p>A reference or receipt is required. Submission does not mean Hawelly has received the funds.</p>
          <label>Transaction reference<input maxLength={200} onChange={(event) => setReference(event.target.value)} value={reference} /></label>
          <div className="form-grid two-columns">
            <label>Amount paid ({funding.instruction.currency})<input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="1,250.00" value={amount} /></label>
            <label>Transfer time<input onChange={(event) => setTransferredAt(event.target.value)} type="datetime-local" value={transferredAt} /></label>
          </div>
          <label>Receipt (PDF, JPG, or PNG; max 8 MB)<input accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} type="file" /></label>
          <label>Note<textarea maxLength={1_000} onChange={(event) => setNote(event.target.value)} rows={3} value={note} /></label>
          <Button disabled={saving || (!reference.trim() && !file)} type="submit">{saving ? "Submitting…" : "Submit for review"}</Button>
        </form>
      ) : null}
      {transferStatus === "FUNDING_SUBMITTED" ? <p className="funding-guidance">Your payment details are under review. Only Hawelly staff can confirm funds received.</p> : null}
      {transferStatus === "FUNDS_CONFIRMED" ? <p className="funding-guidance success-note">Funds received. Hawelly will coordinate payout next.</p> : null}
      {funding?.proofs.length ? <div className="funding-proof-history"><h3>Submissions</h3>{funding.proofs.map((proof) => <article key={proof.id}><div><strong>{proof.reference || proof.originalFilename || "Funding proof"}</strong><span>{proofLabel(proof.status)}</span></div>{proof.reviewReason ? <p>{proof.reviewReason}</p> : null}{proof.hasAttachment ? <Button onClick={() => void download(proof.id)} variant="ghost">View receipt</Button> : null}</article>)}</div> : null}
    </section>
  );
}
