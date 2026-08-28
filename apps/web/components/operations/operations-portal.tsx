"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/api-client";
import {
  formatMinorAmount,
  payoutMethodLabels,
  transferStatus,
  type PayoutMethod,
  type QuoteRecord
} from "../../lib/workflow";
import { getPortalNavigation } from "../../lib/portal";
import { useAuth } from "../auth/auth-provider";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Icon } from "../ui/icon";
import { StatusBadge } from "../ui/status-badge";
import { QuoteDialog } from "./quote-dialog";
import { FundingActions } from "./funding-actions";
import { PayoutActions } from "./payout-actions";

type OperationsRole = "staff" | "admin";

interface QueueTransfer {
  id: string;
  reference: string;
  sender: { id: string; fullName: string };
  recipientName: string;
  originCountry: string;
  destinationCountry: string;
  sendAmountMinor: string;
  sendCurrency: string;
  requestedPayoutMethod: PayoutMethod;
  status: string;
  quoteDueAt: string;
  createdAt: string;
}

interface OperationsDetail extends QueueTransfer {
  recipient: Record<string, unknown>;
  sender: { id: string; fullName: string; email: string };
  senderNote: string | null;
}

type ReasonAction = "REQUEST_INFO" | "DECLINE";

export function OperationsPortal({ role }: { role: OperationsRole }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [transfers, setTransfers] = useState<QueueTransfer[]>([]);
  const [selected, setSelected] = useState<OperationsDetail | null>(null);
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState("");
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null);
  const navigation = getPortalNavigation(role);

  useEffect(() => {
    let active = true;
    apiFetch<{ transfers: QueueTransfer[] }>("/operations/transfers")
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

  const filteredTransfers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return transfers;
    return transfers.filter((transfer) =>
      [
        transfer.reference,
        transfer.sender.fullName,
        transfer.recipientName,
        transfer.originCountry,
        transfer.destinationCountry
      ].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [query, transfers]);

  async function openDetail(transfer: QueueTransfer, trigger: HTMLButtonElement) {
    selectedTriggerRef.current = trigger;
    setError("");
    try {
      const result = await apiFetch<{ transfer: OperationsDetail }>(
        `/operations/transfers/${transfer.id}`
      );
      setSelected(result.transfer);
      if (user?.capabilities?.includes("QUOTE_MANAGE")) {
        const quoteResult = await apiFetch<{ quotes: QuoteRecord[] }>(
          `/operations/transfers/${transfer.id}/quotes`
        );
        setQuotes(quoteResult.quotes);
      } else {
        setQuotes([]);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function closeDetail() {
    setSelected(null);
    setQuotes([]);
    setQuoteOpen(false);
    requestAnimationFrame(() => selectedTriggerRef.current?.focus());
  }

  async function applyReview(action: "START_QUOTING" | ReasonAction) {
    if (!selected) return;
    setActing(true);
    setError("");
    try {
      const result = await apiFetch<{ transfer: OperationsDetail }>(`/operations/transfers/${selected.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          action,
          ...(action === "START_QUOTING" ? {} : { reason: reason.trim() })
        })
      });
      if (action === "START_QUOTING") {
        setSelected((current) => current ? { ...current, ...result.transfer } : current);
        setTransfers((current) => current.map((transfer) => transfer.id === selected.id ? { ...transfer, status: result.transfer.status } : transfer));
      } else {
        setTransfers((current) => current.filter((transfer) => transfer.id !== selected.id));
        setSelected(null);
      }
      setReasonAction(null);
      setReason("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  async function sendExistingDraft(quote: QuoteRecord) {
    if (!selected) return;
    setActing(true);
    setError("");
    try {
      const result = await apiFetch<{ quote: QuoteRecord }>(
        `/operations/transfers/${selected.id}/quotes/${quote.id}/send`,
        { method: "POST", body: "{}" }
      );
      setQuotes((current) => current.map((item) => item.id === quote.id ? result.quote : item));
      setSelected((current) => current ? { ...current, status: "QUOTED" } : current);
      setTransfers((current) => current.map((transfer) => transfer.id === selected.id ? { ...transfer, status: "QUOTED" } : transfer));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setActing(false);
    }
  }

  const initials = user?.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const latestQuote = quotes[0];
  return (
    <main className={selected ? "operations-portal has-detail" : "operations-portal"}>
      <aside className={menuOpen ? "operations-sidebar is-open" : "operations-sidebar"}>
        <a className="brand" href={role === "admin" ? "/admin" : "/staff"}>Hawelly</a>
        <p className="sidebar-label">Operations</p>
        <nav aria-label={`${role} operations navigation`}>
          {navigation.primary.map((item, index) => (
            <a aria-current={index === 0 ? "page" : undefined} href={item.href} key={item.label}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </a>
          ))}
        </nav>
        {navigation.administration.length ? (
          <div className="admin-navigation">
            <p className="sidebar-label">Administration</p>
            <nav aria-label="Administration navigation">
              {navigation.administration.map((item) => (
                <a href={item.href} key={item.label}><Icon name={item.icon} /><span>{item.label}</span></a>
              ))}
            </nav>
          </div>
        ) : null}
        <button className="operations-user operations-user-button" onClick={() => void logout()} type="button">
          <span className="avatar">{initials}</span><span><strong>{user?.fullName}</strong><small>{role === "admin" ? "Admin · Sign out" : "Staff · Sign out"}</small></span>
        </button>
      </aside>

      <section className="operations-workspace">
        <header className="operations-mobile-header">
          <a className="brand" href={role === "admin" ? "/admin" : "/staff"}>Hawelly</a><span>Operations</span>
          <button aria-expanded={menuOpen} aria-label="Toggle operations navigation" className="icon-button" onClick={() => setMenuOpen((value) => !value)} type="button"><Icon name="menu" /></button>
        </header>
        <div className="operations-topbar"><h1>Transfer operations</h1><label className="search-field"><span className="sr-only">Search reference or sender</span><Icon name="search" /><input onChange={(event) => setQuery(event.target.value)} placeholder="Search reference or sender" type="search" value={query} /></label></div>
        <div className="operations-content">
          <section className="metric-strip metric-strip-single" aria-label="Transfer queue summary"><div className="metric metric-info"><Icon name="transfers" /><span><small>Open transfer work</small><strong>{transfers.length}</strong></span></div></section>
          {error ? <p className="page-error" role="alert">{error}</p> : null}
          <section className="transfer-queue" id="transfers" aria-labelledby="new-requests-title">
            <h2 id="new-requests-title">Requests, quotes, funding, and payouts</h2>
            <div className="operations-table-wrap">
              <table className="operations-table">
                <thead><tr><th>Reference</th><th>Sender</th><th>Recipient</th><th>Route</th><th>Amount</th><th>Status</th><th>Quote due</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {filteredTransfers.map((transfer) => (
                    <tr className={selected?.id === transfer.id ? "is-selected" : ""} key={transfer.id}>
                      <td><button className="table-link" onClick={(event) => void openDetail(transfer, event.currentTarget)} type="button">{transfer.reference}</button></td>
                      <td>{transfer.sender.fullName}</td><td>{transfer.recipientName}</td><td>{transfer.originCountry} → {transfer.destinationCountry}</td><td>{formatMinorAmount(transfer.sendAmountMinor, transfer.sendCurrency)}</td><td><StatusBadge {...transferStatus(transfer.status)} /></td><td className={new Date(transfer.quoteDueAt) < new Date() ? "due-soon" : ""}>{new Date(transfer.quoteDueAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td>
                      <td><button aria-label={`View ${transfer.reference}`} className="row-action" onClick={(event) => void openDetail(transfer, event.currentTarget)} type="button"><span className="desktop-more">•••</span><span className="mobile-view">View <Icon name="chevron" /></span></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !filteredTransfers.length ? <p className="queue-empty">No new requests.</p> : null}
              {loading ? <p className="queue-empty">Loading requests…</p> : null}
            </div>
          </section>
        </div>
      </section>

      {selected ? (
        <aside className="transfer-detail" aria-label={`${selected.reference} details`}>
          <div className="detail-heading"><h2>{selected.reference}</h2><button aria-label="Close transfer details" className="icon-button" onClick={closeDetail} type="button"><Icon name="close" /></button></div>
          <StatusBadge {...transferStatus(selected.status)} />
          <dl className="detail-list"><div><dt>Sender</dt><dd>{selected.sender.fullName}</dd></div><div><dt>Recipient</dt><dd>{typeof selected.recipient.fullName === "string" ? selected.recipient.fullName : selected.recipientName}</dd></div><div><dt>Route</dt><dd>{selected.originCountry} → {selected.destinationCountry}</dd></div><div><dt>Amount</dt><dd>{formatMinorAmount(selected.sendAmountMinor, selected.sendCurrency)}</dd></div><div><dt>Payout</dt><dd>{payoutMethodLabels[selected.requestedPayoutMethod]}</dd></div><div><dt>Quote due</dt><dd>{new Date(selected.quoteDueAt).toLocaleString()}</dd></div>{selected.senderNote ? <div className="detail-divider"><dt>Sender note</dt><dd>{selected.senderNote}</dd></div> : null}</dl>
          {selected.status === "REQUESTED" || selected.status === "NEEDS_INFO" ? <div className="detail-actions"><h3>Request review</h3><Button disabled={acting} fullWidth onClick={() => void applyReview("START_QUOTING")}>Start quote</Button><Button disabled={acting} fullWidth onClick={() => { setReason(""); setReasonAction("REQUEST_INFO"); }} variant="outline">Request information</Button><Button disabled={acting} fullWidth onClick={() => { setReason(""); setReasonAction("DECLINE"); }} variant="ghost">Decline request</Button></div> : null}
          {user?.capabilities?.includes("QUOTE_MANAGE") && ["QUOTING", "QUOTED"].includes(selected.status) ? <div className="detail-actions"><h3>{selected.status === "QUOTED" ? "Active quote" : "Quote preparation"}</h3>{latestQuote ? <p className="detail-note">Version {latestQuote.version} Â· {latestQuote.status} Â· Recipient gets {formatMinorAmount(latestQuote.receiveAmountMinor, latestQuote.receiveCurrency)}</p> : null}{latestQuote?.status === "DRAFT" ? <Button disabled={acting} fullWidth onClick={() => void sendExistingDraft(latestQuote)}>{acting ? "Sendingâ€¦" : "Send draft quote"}</Button> : <Button disabled={acting} fullWidth onClick={() => setQuoteOpen(true)}>{selected.status === "QUOTED" ? "Prepare replacement quote" : "Prepare quote"}</Button>}</div> : null}
          {user?.capabilities?.includes("FUNDING_REVIEW") && ["QUOTE_ACCEPTED", "FUNDING_PENDING", "FUNDING_SUBMITTED", "FUNDS_CONFIRMED"].includes(selected.status) ? <FundingActions onStatus={(status) => { setSelected((current) => current ? { ...current, status } : current); setTransfers((current) => current.map((transfer) => transfer.id === selected.id ? { ...transfer, status } : transfer)); }} transfer={selected} /> : null}
          {user?.capabilities?.includes("PAYOUT_MANAGE") && ["FUNDS_CONFIRMED", "PAYOUT_IN_PROGRESS", "PAYOUT_REPORTED", "ON_HOLD"].includes(selected.status) ? <PayoutActions canManageAssociates={Boolean(user.capabilities.includes("ASSOCIATE_MANAGE"))} canViewAssociates={Boolean(user.capabilities.includes("ASSOCIATE_VIEW"))} onStatus={(status) => { setSelected((current) => current ? { ...current, status } : current); setTransfers((current) => current.map((transfer) => transfer.id === selected.id ? { ...transfer, status } : transfer)); }} transfer={selected} /> : null}
        </aside>
      ) : null}

      <Dialog description={reasonAction === "DECLINE" ? "Give the sender a concise reason for declining this request." : "Tell the sender exactly which information is needed."} onClose={() => setReasonAction(null)} open={reasonAction !== null} title={reasonAction === "DECLINE" ? "Decline request" : "Request information"}>
        <form onSubmit={(event) => { event.preventDefault(); if (reasonAction) void applyReview(reasonAction); }}><label htmlFor="review-reason">Sender-facing reason</label><textarea id="review-reason" maxLength={1_000} onChange={(event) => setReason(event.target.value)} required rows={5} value={reason} /><div className="dialog-actions"><Button onClick={() => setReasonAction(null)} variant="outline">Cancel</Button><Button disabled={acting || !reason.trim()} type="submit" variant={reasonAction === "DECLINE" ? "danger" : "primary"}>{acting ? "Applying…" : reasonAction === "DECLINE" ? "Decline" : "Send request"}</Button></div></form>
      </Dialog>
      {selected ? <QuoteDialog key={selected.id} onClose={() => setQuoteOpen(false)} onSent={(quote) => { setQuotes((current) => [quote, ...current]); setSelected((current) => current ? { ...current, status: "QUOTED" } : current); setTransfers((current) => current.map((transfer) => transfer.id === selected.id ? { ...transfer, status: "QUOTED" } : transfer)); }} open={quoteOpen} transfer={selected} /> : null}
    </main>
  );
}
