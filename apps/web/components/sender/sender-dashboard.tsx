"use client";

import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import {
  formatMinorAmount,
  payoutMethodLabels,
  recipientName,
  transferStatus,
  type TransferRecord
} from "../../lib/workflow";
import { StatusBadge } from "../ui/status-badge";
import { SenderShell } from "./sender-shell";

export function SenderDashboard() {
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ transfers: TransferRecord[] }>("/transfers")
      .then((result) => {
        if (active) setTransfers(result.transfers);
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

  const latest = transfers[0];
  return (
    <SenderShell active="Transfers">
      <section className="sender-page-heading" aria-labelledby="sender-title">
        <h1 id="sender-title">Your transfers</h1>
        <a className="button button-primary button-large" href="/sender/new-transfer">Request a transfer</a>
      </section>
      {error ? <p className="page-error" role="alert">{error}</p> : null}
      {loading ? <p className="page-state">Loading transfers…</p> : null}
      {!loading && !latest ? (
        <section className="empty-workflow">
          <h2>No transfer requests yet</h2>
          <p>Create a recipient, then request your first Hawelly quote.</p>
        </section>
      ) : null}
      {latest ? (
        <section className="active-quote request-summary" aria-labelledby="active-request-title">
          <div className="active-quote-heading">
            <h2 id="active-request-title">{latest.reference}</h2>
            <StatusBadge {...transferStatus(latest.status)} />
          </div>
          <dl className="request-economics">
            <div><dt>You send</dt><dd>{formatMinorAmount(latest.sendAmountMinor, latest.sendCurrency)}</dd></div>
            <div><dt>Recipient</dt><dd>{recipientName(latest)}</dd></div>
            <div><dt>Payout</dt><dd>{payoutMethodLabels[latest.requestedPayoutMethod]}</dd></div>
            <div><dt>Quote expected</dt><dd>{new Date(latest.quoteDueAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</dd></div>
          </dl>
          <div className="request-summary-actions">
            <a className="button button-outline button-medium" href={`/sender/transfers/${latest.id}`}>View request</a>
          </div>
        </section>
      ) : null}
      {transfers.length ? (
        <section className="sender-recent" aria-labelledby="sender-recent-title">
          <h2 id="sender-recent-title">Recent transfers</h2>
          <div className="sender-table" role="table" aria-label="Recent transfers">
            <div className="sender-table-head sender-request-columns" role="row">
              <span role="columnheader">Transfer ID</span><span role="columnheader">You send</span><span role="columnheader">Recipient</span><span role="columnheader">Status</span><span role="columnheader">Quote due</span><span aria-hidden="true" />
            </div>
            {transfers.map((transfer) => (
              <div className="sender-transfer-row sender-request-columns" role="row" key={transfer.id}>
                <strong role="cell">{transfer.reference}</strong>
                <span role="cell">{formatMinorAmount(transfer.sendAmountMinor, transfer.sendCurrency)}</span>
                <span role="cell">{recipientName(transfer)}</span>
                <span role="cell"><StatusBadge {...transferStatus(transfer.status)} /></span>
                <span role="cell">{new Date(transfer.quoteDueAt).toLocaleDateString([], { day: "numeric", month: "short" })}</span>
                <a role="cell" className="text-link" href={`/sender/transfers/${transfer.id}`}>View</a>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </SenderShell>
  );
}
