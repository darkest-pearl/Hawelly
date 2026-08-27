"use client";

import { useRef, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import {
  payoutMethodLabels,
  type PayoutMethod,
  type RecipientRecord
} from "../../lib/workflow";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

const supportedMethods: PayoutMethod[] = [
  "BANK_TRANSFER",
  "CASH_PICKUP",
  "MOBILE_MONEY"
];

function detailValue(recipient: RecipientRecord | null, key: string) {
  const value = recipient?.payoutDetails[key];
  return typeof value === "string" ? value : "";
}

export function RecipientDialog({
  open,
  recipient,
  onClose,
  onSaved
}: {
  open: boolean;
  recipient: RecipientRecord | null;
  onClose(): void;
  onSaved(recipient: RecipientRecord): void;
}) {
  const [fullName, setFullName] = useState(recipient?.fullName || "");
  const [phone, setPhone] = useState(recipient?.phone || "");
  const [address, setAddress] = useState(recipient?.address || "");
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>(
    recipient?.payoutMethod || "BANK_TRANSFER"
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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  function payoutDetails() {
    if (payoutMethod === "BANK_TRANSFER") {
      return { accountName, bankName, accountNumber };
    }
    if (payoutMethod === "CASH_PICKUP") return { city };
    return { provider, accountNumber };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = {
        fullName,
        country: "PH",
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
          <label>Country<select disabled value="PH"><option value="PH">Philippines</option></select></label>
          <label>Phone<input autoComplete="tel" maxLength={16} onChange={(event) => setPhone(event.target.value)} placeholder="+639171234567" type="tel" value={phone} /></label>
          <label>Address<input maxLength={500} onChange={(event) => setAddress(event.target.value)} value={address} /></label>
          <label className="form-span">Payout method<select onChange={(event) => setPayoutMethod(event.target.value as PayoutMethod)} value={payoutMethod}>{supportedMethods.map((method) => <option key={method} value={method}>{payoutMethodLabels[method]}</option>)}</select></label>
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
        </div>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <div className="dialog-actions"><Button onClick={onClose} variant="outline">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving…" : "Save recipient"}</Button></div>
      </form>
    </Dialog>
  );
}
