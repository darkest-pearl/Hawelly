"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import {
  formatMinorAmount,
  majorToMinor,
  payoutMethodLabels,
  type RecipientRecord,
  type TransferRecord
} from "../../lib/workflow";
import { Button } from "../ui/button";
import { RecipientDialog } from "./recipient-dialog";
import { SenderShell } from "./sender-shell";

export function TransferRequestForm() {
  const [recipients, setRecipients] = useState<RecipientRecord[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ recipients: RecipientRecord[] }>("/recipients")
      .then((result) => {
        if (!active) return;
        setRecipients(result.recipients);
        setRecipientId(result.recipients[0]?.id || "");
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => recipients.find((recipient) => recipient.id === recipientId) || null,
    [recipients, recipientId]
  );
  const amountMinor = majorToMinor(amount);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !amountMinor) {
      setError("Select a recipient and enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await apiFetch<{ transfer: TransferRecord }>("/transfers", {
        method: "POST",
        body: JSON.stringify({
          recipientId: selected.id,
          originCountry: "AE",
          destinationCountry: selected.country,
          sendAmountMinor: amountMinor,
          sendCurrency: "AED",
          requestedPayoutMethod: selected.payoutMethod,
          ...(note.trim() ? { senderNote: note.trim() } : {})
        })
      });
      window.location.assign(`/sender/transfers/${result.transfer.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SenderShell active="Transfers">
      <section className="sender-page-heading compact-heading"><h1>Request a transfer</h1></section>
      {error ? <p className="page-error" role="alert">{error}</p> : null}
      {loading ? <p className="page-state">Loading recipients…</p> : null}
      {!loading ? (
        <div className="transfer-request-layout">
          <form className="transfer-request-panel" onSubmit={submit}>
            <section aria-labelledby="recipient-section-title">
              <h2 id="recipient-section-title">Recipient</h2>
              <div className="recipient-picker">
                <label><span className="sr-only">Select recipient</span><select onChange={(event) => setRecipientId(event.target.value)} required value={recipientId}><option value="">Select recipient</option>{recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.fullName}</option>)}</select></label>
                <Button onClick={() => setRecipientOpen(true)} variant="outline">Add recipient</Button>
              </div>
            </section>
            <section className="transfer-form-section" aria-labelledby="transfer-details-title">
              <h2 id="transfer-details-title">Transfer details</h2>
              <div className="form-grid two-columns">
                <label>Origin country<select disabled value="AE"><option value="AE">United Arab Emirates</option></select></label>
                <label>Destination country<select disabled value="PH"><option value="PH">Philippines</option></select></label>
                <label className="form-span">You send<div className="money-input"><span>AED</span><input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="Enter amount" required value={amount} /></div></label>
                <label className="form-span">Payout method<select disabled value={selected?.payoutMethod || "BANK_TRANSFER"}><option value={selected?.payoutMethod || "BANK_TRANSFER"}>{selected ? payoutMethodLabels[selected.payoutMethod] : "Select a recipient"}</option></select></label>
                <label className="form-span">Optional note<textarea maxLength={1_000} onChange={(event) => setNote(event.target.value)} placeholder="Add a note (optional)" rows={4} value={note} /></label>
              </div>
              <Button disabled={submitting || !selected} fullWidth type="submit">{submitting ? "Requesting…" : "Request quote"}</Button>
            </section>
          </form>
          <aside className="transfer-request-summary" aria-label="Request summary">
            <span className="avatar">{selected ? selected.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("") : "—"}</span>
            <h2>{selected?.fullName || "Select a recipient"}</h2>
            <p className="summary-route">AE → {selected?.country || "PH"}</p>
            <dl><dt>You send</dt><dd>{amountMinor ? formatMinorAmount(amountMinor, "AED") : "AED 0.00"}</dd><dt>Quote timing</dt><dd>Expected within 45 minutes</dd></dl>
          </aside>
        </div>
      ) : null}
      {recipientOpen ? (
        <RecipientDialog
          key="new-transfer-recipient"
          onClose={() => setRecipientOpen(false)}
          onSaved={(recipient) => {
            setRecipients((current) => [recipient, ...current]);
            setRecipientId(recipient.id);
          }}
          open={recipientOpen}
          recipient={null}
        />
      ) : null}
    </SenderShell>
  );
}

