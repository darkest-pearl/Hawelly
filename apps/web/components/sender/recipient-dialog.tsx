"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { apiFetch, errorFields, errorMessage } from "../../lib/api-client";
import { validateRecipientDraft } from "../../lib/recipient-validation";
import {
  countryLabel,
  payoutMethodLabels,
  reconcileRecipientDestination,
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
  const destinations = useMemo(() => recipientDestinationOptions(options), [options]);
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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

  useEffect(() => {
    const selection = reconcileRecipientDestination(destinations, country, payoutMethod);
    if (selection.country !== country) setCountry(selection.country);
    if (selection.payoutMethod && selection.payoutMethod !== payoutMethod) {
      setPayoutMethod(selection.payoutMethod);
    }
  }, [country, destinations, payoutMethod]);

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function selectCountry(nextCountry: string) {
    const selection = reconcileRecipientDestination(
      destinations,
      nextCountry,
      payoutMethod
    );
    setCountry(selection.country);
    if (selection.payoutMethod) setPayoutMethod(selection.payoutMethod);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    const validated = validateRecipientDraft({
      fullName,
      phone,
      address,
      payoutMethod,
      accountName,
      bankName,
      accountNumber,
      city,
      provider,
      instructions
    });
    if (!validated.value) {
      setFieldErrors(validated.errors);
      setError("Check the highlighted fields.");
      firstFieldRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const body = {
        fullName: validated.value.fullName,
        country,
        phone: validated.value.phone ?? (recipient ? null : undefined),
        address: validated.value.address ?? (recipient ? null : undefined),
        payoutMethod,
        payoutDetails: validated.value.payoutDetails
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
      setFieldErrors(errorFields(caught));
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
          <label>Full name<input aria-describedby={fieldErrors.fullName ? "recipient-full-name-error" : undefined} aria-invalid={Boolean(fieldErrors.fullName)} id="recipient-full-name" maxLength={160} onChange={(event) => { setFullName(event.target.value); clearFieldError("fullName"); }} ref={firstFieldRef} required value={fullName} />{fieldErrors.fullName ? <span className="field-error" id="recipient-full-name-error">{fieldErrors.fullName}</span> : null}</label>
          <label>Country<select disabled={!destinations.length || saving} onChange={(event) => selectCountry(event.target.value)} required value={country}><option disabled value="">{destinations.length ? "Select a country" : "No countries configured"}</option>{recipient && !destinations.some((item) => item.country === recipient.country) ? <option disabled value={recipient.country}>{countryLabel(recipient.country)} ({recipient.country}) — unavailable</option> : null}{destinations.map((item) => <option key={item.country} value={item.country}>{countryLabel(item.country)} ({item.country})</option>)}</select></label>
          <label>Receiving currency<select disabled value={destination?.receiveCurrencies[0] || ""}><option value={destination?.receiveCurrencies[0] || ""}>{destination?.receiveCurrencies.join(", ") || "Select a country"}</option></select></label>
          <label>Phone<input aria-describedby={fieldErrors.phone ? "recipient-phone-error" : "recipient-phone-help"} aria-invalid={Boolean(fieldErrors.phone)} autoComplete="tel" maxLength={16} onChange={(event) => { setPhone(event.target.value); clearFieldError("phone"); }} placeholder="+971501234567" type="tel" value={phone} /><span className="field-help" id="recipient-phone-help">Optional. If provided, use international format beginning with +.</span>{fieldErrors.phone ? <span className="field-error" id="recipient-phone-error">{fieldErrors.phone}</span> : null}</label>
          <label>Address<input aria-describedby={fieldErrors.address ? "recipient-address-error" : undefined} aria-invalid={Boolean(fieldErrors.address)} maxLength={500} onChange={(event) => { setAddress(event.target.value); clearFieldError("address"); }} value={address} />{fieldErrors.address ? <span className="field-error" id="recipient-address-error">{fieldErrors.address}</span> : null}</label>
          <label className="form-span">Payout method<select onChange={(event) => setPayoutMethod(event.target.value as PayoutMethod)} value={payoutMethod}>{displayedMethods.map((method) => <option key={method} value={method}>{payoutMethodLabels[method]}</option>)}</select></label>
          {payoutMethod === "BANK_TRANSFER" ? (
            <>
              <label>Account name<input aria-invalid={Boolean(fieldErrors.accountName)} maxLength={160} onChange={(event) => { setAccountName(event.target.value); clearFieldError("accountName"); }} required value={accountName} />{fieldErrors.accountName ? <span className="field-error">{fieldErrors.accountName}</span> : null}</label>
              <label>Bank name<input aria-invalid={Boolean(fieldErrors.bankName)} maxLength={160} onChange={(event) => { setBankName(event.target.value); clearFieldError("bankName"); }} required value={bankName} />{fieldErrors.bankName ? <span className="field-error">{fieldErrors.bankName}</span> : null}</label>
              <label className="form-span">Account number<input aria-invalid={Boolean(fieldErrors.accountNumber)} autoComplete="off" maxLength={100} onChange={(event) => { setAccountNumber(event.target.value); clearFieldError("accountNumber"); }} required value={accountNumber} />{fieldErrors.accountNumber ? <span className="field-error">{fieldErrors.accountNumber}</span> : null}</label>
            </>
          ) : null}
          {payoutMethod === "CASH_PICKUP" ? <label className="form-span">Pickup city<input aria-invalid={Boolean(fieldErrors.city)} maxLength={160} onChange={(event) => { setCity(event.target.value); clearFieldError("city"); }} required value={city} />{fieldErrors.city ? <span className="field-error">{fieldErrors.city}</span> : null}</label> : null}
          {payoutMethod === "MOBILE_MONEY" ? (
            <>
              <label>Provider<input aria-invalid={Boolean(fieldErrors.provider)} maxLength={160} onChange={(event) => { setProvider(event.target.value); clearFieldError("provider"); }} required value={provider} />{fieldErrors.provider ? <span className="field-error">{fieldErrors.provider}</span> : null}</label>
              <label>Account number<input aria-invalid={Boolean(fieldErrors.accountNumber)} maxLength={100} onChange={(event) => { setAccountNumber(event.target.value); clearFieldError("accountNumber"); }} required value={accountNumber} />{fieldErrors.accountNumber ? <span className="field-error">{fieldErrors.accountNumber}</span> : null}</label>
            </>
          ) : null}
          {payoutMethod === "OTHER" ? <label className="form-span">Payout instructions<textarea aria-invalid={Boolean(fieldErrors.instructions)} maxLength={500} onChange={(event) => { setInstructions(event.target.value); clearFieldError("instructions"); }} required rows={3} value={instructions} />{fieldErrors.instructions ? <span className="field-error">{fieldErrors.instructions}</span> : null}</label> : null}
        </div>
        {!routeAvailable ? <p className="field-error" role="alert">This recipient route is not currently available. Choose an enabled country and payout method.</p> : null}
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <div className="dialog-actions"><Button onClick={onClose} variant="outline">Cancel</Button><Button disabled={saving || !routeAvailable} type="submit">{saving ? "Saving…" : "Save recipient"}</Button></div>
      </form>
    </Dialog>
  );
}
