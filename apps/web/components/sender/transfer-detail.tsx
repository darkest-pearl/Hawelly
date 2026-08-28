"use client";

import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import {
  formatMinorAmount,
  payoutMethodLabels,
  recipientName,
  transferStatus,
  type QuoteRecord,
  type TransferRecord,
  type TransferTimelineItem
} from "../../lib/workflow";
import { Button } from "../ui/button";
import { StatusBadge } from "../ui/status-badge";
import { SenderShell } from "./sender-shell";
import { FundingPanel } from "./funding-panel";
import { PayoutPanel } from "./payout-panel";
import { ResolutionPanel } from "./resolution-panel";

type DetailedTransfer = TransferRecord & { timeline: TransferTimelineItem[] };

export function TransferDetail({ transferId }: { transferId: string }) {
  const [transfer, setTransfer] = useState<DetailedTransfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ transfer: DetailedTransfer }>(`/transfers/${transferId}`),
      apiFetch<{ quotes: QuoteRecord[] }>(`/transfers/${transferId}/quotes`)
    ])
      .then(([transferResult, quoteResult]) => {
        if (active) {
          setTransfer(transferResult.transfer);
          setQuotes(quoteResult.quotes);
        }
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

  async function decide(quote: QuoteRecord, decision: "ACCEPT" | "REJECT") {
    if (!transfer || !window.confirm(`${decision === "ACCEPT" ? "Accept" : "Reject"} quote version ${quote.version}?`)) return;
    setDeciding(true);
    setError("");
    try {
      const result = await apiFetch<{ quote: QuoteRecord; transferStatus: string }>(
        `/transfers/${transfer.id}/quotes/${quote.id}/decision`,
        { method: "POST", body: JSON.stringify({ decision }) }
      );
      setQuotes((current) => current.map((item) => item.id === quote.id ? result.quote : item));
      setTransfer((current) => current ? { ...current, status: result.transferStatus } : current);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setDeciding(false);
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
            {["REQUESTED", "NEEDS_INFO", "QUOTING", "QUOTED", "QUOTE_ACCEPTED", "FUNDING_PENDING"].includes(transfer.status) ? <Button disabled={cancelling} onClick={() => void cancel()} variant="outline">{cancelling ? "Cancelling…" : "Cancel request"}</Button> : null}
          </section>
          {quotes.find((quote) => quote.status === "SENT") ? (() => {
            const quote = quotes.find((item) => item.status === "SENT")!;
            return <section className="active-quote" aria-labelledby="active-quote-title"><div className="active-quote-heading"><StatusBadge label="Ready" tone="success" /><h2 id="active-quote-title">Your quote</h2></div><dl className="quote-economics"><div><dt>You send</dt><dd>{formatMinorAmount(quote.sendAmountMinor, quote.sendCurrency)}</dd></div><div><dt>Fee</dt><dd>{formatMinorAmount(quote.feeAmountMinor, quote.sendCurrency)}</dd></div><div><dt>Recipient gets</dt><dd>{formatMinorAmount(quote.receiveAmountMinor, quote.receiveCurrency)}</dd></div><div><dt>Rate</dt><dd>{quote.effectiveRate}</dd></div></dl><dl className="detail-summary-grid quote-timing"><div><dt>Expected by</dt><dd>{new Date(quote.expectedDeliveryAt).toLocaleString()}</dd></div><div><dt>Quote expires</dt><dd>{new Date(quote.expiresAt).toLocaleString()}</dd></div></dl>{quote.senderFacingNote ? <p>{quote.senderFacingNote}</p> : null}<div className="quote-actions"><Button disabled={deciding} onClick={() => void decide(quote, "REJECT")} variant="outline">Reject</Button><Button disabled={deciding} onClick={() => void decide(quote, "ACCEPT")}>{deciding ? "Applyingâ€¦" : "Accept quote"}</Button></div></section>;
          })() : null}
          {!quotes.some((quote) => quote.status === "SENT") && quotes[0] ? <section className="active-quote"><div className="active-quote-heading"><StatusBadge label={quotes[0].status === "ACCEPTED" ? "Accepted" : quotes[0].status.toLowerCase()} tone={quotes[0].status === "ACCEPTED" ? "success" : "neutral"} /><h2>Quote version {quotes[0].version}</h2></div><p>{quotes[0].status === "ACCEPTED" ? transfer.status === "QUOTE_ACCEPTED" ? "You accepted this quote. Funding instructions will appear next." : "This accepted quote is locked to the funding workflow below." : `This quote is ${quotes[0].status.toLowerCase()}.`}</p></section> : null}
          <FundingPanel onStatus={(status) => setTransfer((current) => current ? { ...current, status } : current)} transferId={transfer.id} transferStatus={transfer.status} />
          <PayoutPanel transferId={transfer.id} transferStatus={transfer.status} />
          <ResolutionPanel onStatus={(status) => setTransfer((current) => current ? { ...current, status } : current)} transferId={transfer.id} transferStatus={transfer.status} />
          <section className="transfer-timeline" aria-labelledby="timeline-title"><h2 id="timeline-title">Activity</h2><ol>{transfer.timeline.map((item, index) => <li key={`${item.occurredAt}-${index}`}><span className="timeline-dot" /><div><strong>{item.status ? transferStatus(item.status).label : item.type}</strong><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time>{item.reason ? <p>{item.reason}</p> : null}</div></li>)}</ol></section>
        </>
      ) : null}
    </SenderShell>
  );
}
