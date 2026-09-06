"use client";

import { useRef, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import {
  countryLabel,
  payoutMethodLabels,
  recipientDestinationOptions,
  type PayoutMethod,
  type RecipientRecord,
  type SenderTransferOptions
} from "../../lib/workflow";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

function detailValue(recipient: RecipientRecord | null, key: string) {
  const value = recipient?.payoutDetails[key];
  return typeof value === "string" ? value : "";
}

export function RecipientDialog({
  open,
  recipient,
  options,
  onClose,
  onSaved
}: {
  open: boolean;
  recipient: RecipientRecord | null;
  options: SenderTransferOptions;
  onClose(): void;
  onSaved(recipient: RecipientRecord): void;
}) {
  const destinations = recipientDestinationOptions(options);
  const initialCountry = recipient?.country || destinations[0]?.country || "";
  const [fullName, setFullName] = useState(recipient?.fullName || "");
  const [country, setCountry] = useState(initialCountry);
  const [phone, setPhone] = useState(recipient?.phone || "");
  const [address, setAddress] = useState(recipient?.address || "");
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>(
    recipient?.payoutMethod || destinations[0]?.payoutMethods[0] || "BANK_TRANSFER"
  );
  const [accountName, setAccountName] = useState(
    detailValue(recipient, "accountName") || recipient?.fullName || ""
  );
  const [bankName, setBankName] = useState(detailValue(recipient, "bankName"));
  const [accountNumber, setAccountNumber] = useState(
    detailValue(recipient, "accountNumber")
  );
  const [city, setCity] = useState(detailValue(recipient, "city"));
  const [provider, setProvider] = useState(detailValue(recipient, "provider"));
  const [instructions, setInstructions] = useState(
    detailValue(recipient, "instructions")
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const destination = destinations.find((item) => item.country === country);
  const supportedMethods = destination?.payoutMethods || [];
  const displayedMethods = supportedMethods.length
    ? supportedMethods
    : recipient
      ? [recipient.payoutMethod]
      : [];
  const routeAvailable = Boolean(
    destination && supportedMethods.includes(payoutMethod)
  );

  function payoutDetails() {
    if (payoutMethod === "BANK_TRANSFER") {
      return { accountName, bankName, accountNumber };
    }
    if (payoutMethod === "CASH_PICKUP") return { city };
    if (payoutMethod === "MOBILE_MONEY") return { provider, accountNumber };
    return { instructions };
  }

  function selectCountry(nextCountry: string) {
    const nextMethods = destinations.find(
      (item) => item.country === nextCountry
    )?.payoutMethods || [];
    setCountry(nextCountry);
    if (!nextMethods.includes(payoutMethod) && nextMethods[0]) {
      setPayoutMethod(nextMethods[0]);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = {
        fullName,
        country,
        phone: phone || (recipient ? null : undefined),
        address: address || (recipient ? null : undefined),
        payoutMethod,
        payoutDetails: payoutDetails()
      };
      const result = await apiFetch<{ recipient: RecipientRecord }>(
        recipient ? `/recipients/${recipient.id}` : "/recipients",
        {
          method: recipient ? "PATCH" : "POST",
          body: JSON.stringify(body)
        }
      );
      onSaved(result.recipient);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      description="Recipient details are saved securely and can be selected for future transfer requests."
      initialFocusRef={firstFieldRef}
      onClose={onClose}
      open={open}
      title={recipient ? "Edit recipient" : "Add recipient"}
    >
      <form className="recipient-form" onSubmit={submit}>
        <div className="form-grid two-columns">
          <label>Full name<input id="recipient-full-name" maxLength={160} onChange={(event) => setFullName(event.target.value)} ref={firstFieldRef} required value={fullName} /></label>
          <label>Country<select onChange={(event) => selectCountry(event.target.value)} required value={country}>{recipient && !destinations.some((item) => item.country === recipient.country) ? <option disabled value={recipient.country}>{countryLabel(recipient.country)} ({recipient.country}) — unavailable</option> : null}{destinations.map((item) => <option key={item.country} value={item.country}>{countryLabel(item.country)} ({item.country})</option>)}</select></label>
          <label>Phone<input autoComplete="tel" maxLength={16} onChange={(event) => setPhone(event.target.value)} placeholder="International format" type="tel" value={phone} /></label>
          <label>Address<input maxLength={500} onChange={(event) => setAddress(event.target.value)} value={address} /></label>
          <label className="form-span">Payout method<select onChange={(event) => setPayoutMethod(event.target.value as PayoutMethod)} value={payoutMethod}>{displayedMethods.map((method) => <option key={method} value={method}>{payoutMethodLabels[method]}</option>)}</select></label>
          {payoutMethod === "BANK_TRANSFER" ? (
            <>
              <label>Account name<input maxLength={160} onChange={(event) => setAccountName(event.target.value)} required value={accountName} /></label>
              <label>Bank name<input maxLength={160} onChange={(event) => setBankName(event.target.value)} required value={bankName} /></label>
              <label className="form-span">Account number<input autoComplete="off" maxLength={100} onChange={(event) => setAccountNumber(event.target.value)} required value={accountNumber} /></label>
            </>
          ) : null}
          {payoutMethod === "CASH_PICKUP" ? <label className="form-span">Pickup city<input maxLength={160} onChange={(event) => setCity(event.target.value)} required value={city} /></label> : null}
          {payoutMethod === "MOBILE_MONEY" ? (
            <>
              <label>Provider<input maxLength={160} onChange={(event) => setProvider(event.target.value)} required value={provider} /></label>
              <label>Account number<input maxLength={100} onChange={(event) => setAccountNumber(event.target.value)} required value={accountNumber} /></label>
            </>
          ) : null}
          {payoutMethod === "OTHER" ? <label className="form-span">Payout instructions<textarea maxLength={500} onChange={(event) => setInstructions(event.target.value)} required rows={3} value={instructions} /></label> : null}
        </div>
        {!routeAvailable ? <p className="field-error" role="alert">This recipient route is not currently available. Choose an enabled country and payout method.</p> : null}
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <div className="dialog-actions"><Button onClick={onClose} variant="outline">Cancel</Button><Button disabled={saving || !routeAvailable} type="submit">{saving ? "Saving…" : "Save recipient"}</Button></div>
      </form>
    </Dialog>
  );
}
