"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import { formatMinorAmount, type FundingProofRecord, type FundingState, type FundingTemplateRecord } from "../../lib/workflow";
import { Button } from "../ui/button";

type ReviewAction = "VERIFY" | "REQUEST_RESUBMISSION" | "REJECT" | "CONFIRM";

export function FundingActions({ transfer, onStatus }: {
  transfer: { id: string; status: string; sendCurrency: string };
  onStatus(status: string): void;
}) {
  const [funding, setFunding] = useState<FundingState | null>(null);
  const [templates, setTemplates] = useState<FundingTemplateRecord[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [senderReference, setSenderReference] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [review, setReview] = useState<{ proof: FundingProofRecord; action: ReviewAction } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);

  async function reload() {
    const result = await apiFetch<FundingState>(`/operations/transfers/${transfer.id}/funding`);
    setFunding(result);
    onStatus(result.transferStatus);
  }

  useEffect(() => {
    let active = true;
    setFunding(null);
    setTemplates([]);
    setTemplateId("");
    Promise.all([
      apiFetch<FundingState>(`/operations/transfers/${transfer.id}/funding`),
      apiFetch<{ templates: FundingTemplateRecord[] }>("/operations/funding-templates")
    ])
      .then(([fundingResult, templateResult]) => {
        if (!active) return;
        setFunding(fundingResult);
        const matching = templateResult.templates.filter((template) => template.currency === transfer.sendCurrency);
        setTemplates(matching);
        setTemplateId(matching[0]?.id || "");
      })
      .catch((caught) => { if (active) setError(errorMessage(caught)); });
    return () => { active = false; };
  }, [transfer.id, transfer.sendCurrency]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActing(true);
    setError("");
    try {
      await apiFetch(`/operations/transfers/${transfer.id}/funding-instruction`, {
        method: "POST",
        body: JSON.stringify({ templateId, senderReference: senderReference.trim(), ...(validUntil ? { validUntil: new Date(validUntil).toISOString() } : {}) })
      });
      await reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function applyReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review) return;
    setActing(true);
    setError("");
    try {
      if (review.action === "CONFIRM") {
        await apiFetch(`/operations/transfers/${transfer.id}/funds-confirmation`, { method: "POST", body: JSON.stringify({ proofId: review.proof.id, reason: reason.trim() }) });
      } else {
        await apiFetch(`/operations/transfers/${transfer.id}/funding-proofs/${review.proof.id}/review`, { method: "POST", body: JSON.stringify({ decision: review.action, reason: reason.trim() }) });
      }
      setReview(null);
      setReason("");
      await reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function download(proofId: string) {
    setError("");
    try {
      const result = await apiFetch<{ url: string }>(`/operations/transfers/${transfer.id}/funding-proofs/${proofId}/read-url`, { method: "POST", body: "{}" });
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.rel = "noopener noreferrer";
      anchor.target = "_blank";
      anchor.click();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const submitted = funding?.proofs.find((proof) => proof.status === "SUBMITTED");
  const verified = funding?.proofs.find((proof) => proof.status === "VERIFIED");
  return (
    <div className="detail-actions funding-actions">
      <h3>Funding</h3>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {funding?.instruction ? <dl className="compact-funding"><div><dt>Expected</dt><dd>{formatMinorAmount(funding.instruction.amountMinor, funding.instruction.currency)}</dd></div><div><dt>Reference</dt><dd>{funding.instruction.senderReference}</dd></div><div><dt>Payee</dt><dd>{funding.instruction.payeeName}</dd></div></dl> : null}
      {transfer.status === "QUOTE_ACCEPTED" && !funding?.instruction ? (
        templates.length ? <form className="funding-publish-form" onSubmit={publish}>
          <label>Funding template<select onChange={(event) => setTemplateId(event.target.value)} required value={templateId}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.method.toLowerCase().replaceAll("_", " ")}</option>)}</select></label>
          <label>Sender reference<input maxLength={100} onChange={(event) => setSenderReference(event.target.value)} required value={senderReference} /></label>
          <label>Valid until (optional)<input onChange={(event) => setValidUntil(event.target.value)} type="datetime-local" value={validUntil} /></label>
          <Button disabled={acting || !templateId || !senderReference.trim()} fullWidth type="submit">{acting ? "Publishing…" : "Publish funding instructions"}</Button>
        </form> : <p className="detail-note">No active {transfer.sendCurrency} funding template is configured.</p>
      ) : null}
      {transfer.status === "FUNDING_PENDING" ? <p className="detail-note">Waiting for the sender to submit a transaction reference or receipt.</p> : null}
      {submitted ? <article className="funding-review-card"><strong>{submitted.reference || submitted.originalFilename || "Funding submission"}</strong>{submitted.amountMinor && submitted.currency ? <span>{formatMinorAmount(submitted.amountMinor, submitted.currency)}</span> : null}{submitted.hasAttachment ? <Button onClick={() => void download(submitted.id)} variant="ghost">View receipt</Button> : null}<div className="review-button-grid"><Button onClick={() => { setReview({ proof: submitted, action: "VERIFY" }); setReason(""); }}>Verify proof</Button><Button onClick={() => { setReview({ proof: submitted, action: "REQUEST_RESUBMISSION" }); setReason(""); }} variant="outline">Request resubmission</Button><Button onClick={() => { setReview({ proof: submitted, action: "REJECT" }); setReason(""); }} variant="ghost">Reject proof</Button></div></article> : null}
      {verified && transfer.status === "FUNDING_SUBMITTED" ? <><p className="detail-note">Proof verified. Funds are not confirmed until the next action is completed.</p><Button fullWidth onClick={() => { setReview({ proof: verified, action: "CONFIRM" }); setReason(""); }}>Confirm funds received</Button></> : null}
      {transfer.status === "FUNDS_CONFIRMED" ? <p className="success-note">Funds received confirmed. Ready for payout operations.</p> : null}
      {review ? <form className="funding-review-form" onSubmit={applyReview}><label>{review.action === "CONFIRM" ? "Confirmation reason" : "Review reason"}<textarea maxLength={1_000} onChange={(event) => setReason(event.target.value)} required rows={3} value={reason} /></label><div className="review-button-grid"><Button onClick={() => setReview(null)} variant="outline">Cancel</Button><Button disabled={acting || !reason.trim()} type="submit" variant={review.action === "REJECT" ? "danger" : "primary"}>{acting ? "Applying…" : review.action === "CONFIRM" ? "Confirm receipt" : "Apply review"}</Button></div></form> : null}
    </div>
  );
}
