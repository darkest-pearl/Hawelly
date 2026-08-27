"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import { formatMinorAmount, majorToMinor, type QuoteRecord } from "../../lib/workflow";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

function tomorrowLocal() {
  const value = new Date(Date.now() + 24 * 60 * 60_000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

export function QuoteDialog({
  open,
  transfer,
  onClose,
  onSent
}: {
  open: boolean;
  transfer: { id: string; sendAmountMinor: string; sendCurrency: string };
  onClose(): void;
  onSent(quote: QuoteRecord): void;
}) {
  const [fee, setFee] = useState("");
  const [rate, setRate] = useState("");
  const [receive, setReceive] = useState("");
  const [receiveCurrency, setReceiveCurrency] = useState("PHP");
  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState(tomorrowLocal);
  const [validForMinutes, setValidForMinutes] = useState("30");
  const [senderNote, setSenderNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const feeAmountMinor = majorToMinor(fee || "0");
    const receiveAmountMinor = majorToMinor(receive);
    if (!feeAmountMinor && fee.trim() !== "0" && fee.trim() !== "0.00") {
      setError("Enter a valid fee amount.");
      return;
    }
    if (!receiveAmountMinor) {
      setError("Enter a valid recipient amount.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const draft = await apiFetch<{ quote: QuoteRecord }>(
        `/operations/transfers/${transfer.id}/quotes`,
        {
          method: "POST",
          body: JSON.stringify({
            sendAmountMinor: transfer.sendAmountMinor,
            sendCurrency: transfer.sendCurrency,
            feeAmountMinor: feeAmountMinor || "0",
            effectiveRate: rate,
            receiveAmountMinor,
            receiveCurrency,
            expectedDeliveryAt: new Date(expectedDeliveryAt).toISOString(),
            validForMinutes: Number(validForMinutes),
            ...(senderNote.trim() ? { senderFacingNote: senderNote.trim() } : {}),
            ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {})
          })
        }
      );
      const sent = await apiFetch<{ quote: QuoteRecord }>(
        `/operations/transfers/${transfer.id}/quotes/${draft.quote.id}/send`,
        { method: "POST", body: "{}" }
      );
      onSent(sent.quote);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog description="The sender will see these exact economics and timing. Repricing creates a new version." onClose={onClose} open={open} title="Prepare quote">
      <form className="quote-form" onSubmit={submit}>
        <div className="form-grid two-columns">
          <label>You send<input disabled value={formatMinorAmount(transfer.sendAmountMinor, transfer.sendCurrency)} /></label>
          <label>Fee ({transfer.sendCurrency})<input inputMode="decimal" onChange={(event) => setFee(event.target.value)} placeholder="25.00" required value={fee} /></label>
          <label>Effective FX rate<input inputMode="decimal" onChange={(event) => setRate(event.target.value)} placeholder="15.125" required value={rate} /></label>
          <label>Recipient currency<input maxLength={3} onChange={(event) => setReceiveCurrency(event.target.value.toUpperCase())} required value={receiveCurrency} /></label>
          <label>Recipient gets<input inputMode="decimal" onChange={(event) => setReceive(event.target.value)} required value={receive} /></label>
          <label>Valid for minutes<input max={1440} min={5} onChange={(event) => setValidForMinutes(event.target.value)} required type="number" value={validForMinutes} /></label>
          <label className="form-span">Expected delivery<input onChange={(event) => setExpectedDeliveryAt(event.target.value)} required type="datetime-local" value={expectedDeliveryAt} /></label>
          <label className="form-span">Sender note<textarea maxLength={500} onChange={(event) => setSenderNote(event.target.value)} rows={2} value={senderNote} /></label>
          <label className="form-span">Internal note<textarea maxLength={2000} onChange={(event) => setInternalNote(event.target.value)} rows={2} value={internalNote} /></label>
        </div>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <div className="dialog-actions"><Button onClick={onClose} variant="outline">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Sendingâ€¦" : "Send quote"}</Button></div>
      </form>
    </Dialog>
  );
}
