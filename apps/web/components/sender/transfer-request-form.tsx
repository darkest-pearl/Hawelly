"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import {
  countryLabel,
  formatMinorAmount,
  majorToMinor,
  payoutMethodLabels,
  type RecipientRecord,
  type SenderTransferOptions,
  type TransferRecord
} from "../../lib/workflow";
import { Button } from "../ui/button";
import { RecipientDialog } from "./recipient-dialog";
import { SenderShell } from "./sender-shell";

export function TransferRequestForm() {
  const [recipients, setRecipients] = useState<RecipientRecord[]>([]);
  const [options, setOptions] = useState<SenderTransferOptions | null>(null);
  const [recipientId, setRecipientId] = useState("");
  const [originCountry, setOriginCountry] = useState("");
  const [sendCurrency, setSendCurrency] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ recipients: RecipientRecord[] }>("/recipients"),
      apiFetch<{ options: SenderTransferOptions }>("/transfers/options")
    ])
      .then(([recipientResult, optionResult]) => {
        if (!active) return;
        const firstRecipient = recipientResult.recipients[0];
        const firstRoute = optionResult.options.corridors.find(
          (corridor) =>
            corridor.destinationCountry === firstRecipient?.country &&
            corridor.payoutMethods.includes(firstRecipient.payoutMethod)
        );
        setRecipients(recipientResult.recipients);
        setOptions(optionResult.options);
        setRecipientId(firstRecipient?.id || "");
        setOriginCountry(firstRoute?.originCountry || "");
        setSendCurrency(firstRoute?.sendCurrencies[0] || "");
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
  const recipientCorridors = (options?.corridors || []).filter(
    (corridor) =>
      corridor.destinationCountry === selected?.country &&
      Boolean(selected && corridor.payoutMethods.includes(selected.payoutMethod))
  );
  const originCountries = [...new Set(recipientCorridors.map((item) => item.originCountry))];
  const sendCurrencies = [
    ...new Set(
      recipientCorridors
        .filter((item) => item.originCountry === originCountry)
        .flatMap((item) => item.sendCurrencies)
    )
  ];
  const receiveCurrencies = [
    ...new Set(recipientCorridors.flatMap((item) => item.receiveCurrencies))
  ];
  const amountMinor = majorToMinor(amount);

  function selectRecipient(nextRecipientId: string) {
    const nextRecipient = recipients.find((item) => item.id === nextRecipientId);
    const nextRoute = options?.corridors.find(
      (corridor) =>
        corridor.destinationCountry === nextRecipient?.country &&
        Boolean(nextRecipient && corridor.payoutMethods.includes(nextRecipient.payoutMethod))
    );
    setRecipientId(nextRecipientId);
    setOriginCountry(nextRoute?.originCountry || "");
    setSendCurrency(nextRoute?.sendCurrencies[0] || "");
  }

  function selectOrigin(nextOrigin: string) {
    const nextRoute = recipientCorridors.find(
      (corridor) => corridor.originCountry === nextOrigin
    );
    setOriginCountry(nextOrigin);
    setSendCurrency(nextRoute?.sendCurrencies[0] || "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !amountMinor || !originCountry || !sendCurrency) {
      setError("Select an available route and enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await apiFetch<{ transfer: TransferRecord }>("/transfers", {
        method: "POST",
        body: JSON.stringify({
          recipientId: selected.id,
          originCountry,
          destinationCountry: selected.country,
          sendAmountMinor: amountMinor,
          sendCurrency,
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
      {!loading && options?.corridors.length === 0 ? <p className="page-state">No transfer corridors are currently configured.</p> : null}
      {!loading ? (
        <div className="transfer-request-layout">
          <form className="transfer-request-panel" onSubmit={submit}>
            <section aria-labelledby="recipient-section-title">
              <h2 id="recipient-section-title">Recipient</h2>
              <div className="recipient-picker">
                <label><span className="sr-only">Select recipient</span><select onChange={(event) => selectRecipient(event.target.value)} required value={recipientId}><option value="">Select recipient</option>{recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.fullName}</option>)}</select></label>
                <Button disabled={!options?.corridors.length} onClick={() => setRecipientOpen(true)} variant="outline">Add recipient</Button>
              </div>
            </section>
            <section className="transfer-form-section" aria-labelledby="transfer-details-title">
              <h2 id="transfer-details-title">Transfer details</h2>
              <div className="form-grid two-columns">
                <label>Origin country<select disabled={originCountries.length <= 1} onChange={(event) => selectOrigin(event.target.value)} required value={originCountry}><option value="">Select origin</option>{originCountries.map((country) => <option key={country} value={country}>{countryLabel(country)} ({country})</option>)}</select></label>
                <label>Destination country<select disabled value={selected?.country || ""}><option value={selected?.country || ""}>{selected ? `${countryLabel(selected.country)} (${selected.country})` : "Select a recipient"}</option></select></label>
                <label>Send currency<select disabled={sendCurrencies.length <= 1} onChange={(event) => setSendCurrency(event.target.value)} required value={sendCurrency}><option value="">Select currency</option>{sendCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
                <label>Receiving currency<select disabled value={receiveCurrencies[0] || ""}><option value={receiveCurrencies[0] || ""}>{receiveCurrencies.join(", ") || "No receiving currency configured"}</option></select></label>
                <label>You send<input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="Enter amount" required value={amount} /></label>
                <label className="form-span">Payout method<select disabled value={selected?.payoutMethod || "BANK_TRANSFER"}><option value={selected?.payoutMethod || "BANK_TRANSFER"}>{selected ? payoutMethodLabels[selected.payoutMethod] : "Select a recipient"}</option></select></label>
                <label className="form-span">Optional note<textarea maxLength={1_000} onChange={(event) => setNote(event.target.value)} placeholder="Add a note (optional)" rows={4} value={note} /></label>
              </div>
              <Button disabled={submitting || !selected || !originCountry || !sendCurrency} fullWidth type="submit">{submitting ? "Requesting…" : "Request quote"}</Button>
            </section>
          </form>
          <aside className="transfer-request-summary" aria-label="Request summary">
            <span className="avatar">{selected ? selected.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("") : "—"}</span>
            <h2>{selected?.fullName || "Select a recipient"}</h2>
            <p className="summary-route">{originCountry || "—"} → {selected?.country || "—"}</p>
            <dl><dt>You send</dt><dd>{amountMinor && sendCurrency ? formatMinorAmount(amountMinor, sendCurrency) : `${sendCurrency || "—"} 0.00`}</dd><dt>Quote timing</dt><dd>Expected within {options?.quoteSlaMinutes || 45} minutes</dd></dl>
          </aside>
        </div>
      ) : null}
      {recipientOpen && options ? (
        <RecipientDialog
          key="new-transfer-recipient"
          onClose={() => setRecipientOpen(false)}
          onSaved={(recipient) => {
            const nextRoute = options?.corridors.find(
              (corridor) =>
                corridor.destinationCountry === recipient.country &&
                corridor.payoutMethods.includes(recipient.payoutMethod)
            );
            setRecipients((current) => [recipient, ...current]);
            setRecipientId(recipient.id);
            setOriginCountry(nextRoute?.originCountry || "");
            setSendCurrency(nextRoute?.sendCurrencies[0] || "");
          }}
          open={recipientOpen}
          options={options}
          recipient={null}
        />
      ) : null}
    </SenderShell>
  );
}
