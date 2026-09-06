"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import {
  payoutMethodLabels,
  type RecipientRecord,
  type SenderTransferOptions
} from "../../lib/workflow";
import { Button } from "../ui/button";
import { RecipientDialog } from "./recipient-dialog";
import { SenderShell } from "./sender-shell";

export function RecipientsManager() {
  const [recipients, setRecipients] = useState<RecipientRecord[]>([]);
  const [options, setOptions] = useState<SenderTransferOptions | null>(null);
  const [selected, setSelected] = useState<RecipientRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [recipientResult, optionResult] = await Promise.all([
        apiFetch<{ recipients: RecipientRecord[] }>("/recipients"),
        apiFetch<{ options: SenderTransferOptions }>("/transfers/options")
      ]);
      setRecipients(recipientResult.recipients);
      setOptions(optionResult.options);
      setError("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setSelected(null);
    setDialogOpen(true);
  }

  async function remove(recipient: RecipientRecord) {
    if (!window.confirm(`Delete ${recipient.fullName}?`)) return;
    try {
      await apiFetch(`/recipients/${recipient.id}`, { method: "DELETE" });
      setRecipients((current) => current.filter((item) => item.id !== recipient.id));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <SenderShell active="Recipients">
      <section className="sender-page-heading compact-heading">
        <h1>Recipients</h1>
        <Button disabled={!options?.corridors.length} onClick={openCreate} size="large">Add recipient</Button>
      </section>
      {error ? <p className="page-error" role="alert">{error}</p> : null}
      {loading ? <p className="page-state">Loading recipients…</p> : null}
      {!loading && options?.corridors.length === 0 ? <p className="page-state">No recipient countries are currently configured.</p> : null}
      {!loading && !recipients.length ? (
        <section className="empty-workflow"><h2>No recipients yet</h2><p>Add a recipient before requesting a transfer.</p></section>
      ) : null}
      {recipients.length ? (
        <div className="recipient-list" role="list">
          {recipients.map((recipient) => (
            <article className="recipient-row" key={recipient.id} role="listitem">
              <span className="avatar">{recipient.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>
              <div><h2>{recipient.fullName}</h2><p>{recipient.country} · {payoutMethodLabels[recipient.payoutMethod]}{recipient.phone ? ` · ${recipient.phone}` : ""}</p></div>
              <div className="recipient-actions"><Button onClick={() => { setSelected(recipient); setDialogOpen(true); }} size="small" variant="outline">Edit</Button><Button onClick={() => void remove(recipient)} size="small" variant="ghost">Delete</Button></div>
            </article>
          ))}
        </div>
      ) : null}
      {dialogOpen && options ? (
        <RecipientDialog
          key={selected?.id || "new"}
          onClose={() => setDialogOpen(false)}
          onSaved={(saved) => {
            setRecipients((current) => {
              const exists = current.some((item) => item.id === saved.id);
              return exists
                ? current.map((item) => (item.id === saved.id ? saved : item))
                : [saved, ...current];
            });
          }}
          open={dialogOpen}
          options={options}
          recipient={selected}
        />
      ) : null}
    </SenderShell>
  );
}
