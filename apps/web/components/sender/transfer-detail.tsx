"use client";

import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import {
  formatMinorAmount,
  payoutMethodLabels,
  recipientName,
  transferStatus,
  type TransferRecord,
  type TransferTimelineItem
} from "../../lib/workflow";
import { Button } from "../ui/button";
import { StatusBadge } from "../ui/status-badge";
import { SenderShell } from "./sender-shell";

type DetailedTransfer = TransferRecord & { timeline: TransferTimelineItem[] };

export function TransferDetail({ transferId }: { transferId: string }) {
  const [transfer, setTransfer] = useState<DetailedTransfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<{ transfer: DetailedTransfer }>(`/transfers/${transferId}`)
      .then((result) => {
        if (active) setTransfer(result.transfer);
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
  }, [transferId]);

  async function cancel() {
    if (!transfer || !window.confirm(`Cancel ${transfer.reference}?`)) return;
    setCancelling(true);
    setError("");
    try {
      const result = await apiFetch<{ transfer: TransferRecord }>(
        `/transfers/${transfer.id}/cancel`,
        { method: "POST", body: "{}" }
      );
      setTransfer((current) => current ? { ...current, ...result.transfer } : current);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <SenderShell active="Transfers">
      {loading ? <p className="page-state">Loading transfer…</p> : null}
      {error ? <p className="page-error" role="alert">{error}</p> : null}
      {transfer ? (
        <>
          <section className="transfer-detail-heading"><div><a className="text-link" href="/sender">Back to transfers</a><h1>{transfer.reference}</h1></div><StatusBadge {...transferStatus(transfer.status)} /></section>
          <section className="sender-transfer-detail">
            <dl className="detail-summary-grid">
              <div><dt>You send</dt><dd>{formatMinorAmount(transfer.sendAmountMinor, transfer.sendCurrency)}</dd></div>
              <div><dt>Recipient</dt><dd>{recipientName(transfer)}</dd></div>
              <div><dt>Route</dt><dd>{transfer.originCountry} → {transfer.destinationCountry}</dd></div>
              <div><dt>Payout method</dt><dd>{payoutMethodLabels[transfer.requestedPayoutMethod]}</dd></div>
              <div><dt>Requested</dt><dd>{new Date(transfer.createdAt).toLocaleString()}</dd></div>
              <div><dt>Quote expected</dt><dd>{new Date(transfer.quoteDueAt).toLocaleString()}</dd></div>
            </dl>
            {!["CANCELLED", "DECLINED"].includes(transfer.status) ? <Button disabled={cancelling} onClick={() => void cancel()} variant="outline">{cancelling ? "Cancelling…" : "Cancel request"}</Button> : null}
          </section>
          <section className="transfer-timeline" aria-labelledby="timeline-title"><h2 id="timeline-title">Activity</h2><ol>{transfer.timeline.map((item, index) => <li key={`${item.occurredAt}-${index}`}><span className="timeline-dot" /><div><strong>{item.status ? transferStatus(item.status).label : item.type}</strong><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time>{item.reason ? <p>{item.reason}</p> : null}</div></li>)}</ol></section>
        </>
      ) : null}
    </SenderShell>
  );
}

