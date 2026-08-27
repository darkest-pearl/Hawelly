"use client";

import { useMemo, useRef, useState } from "react";
import { operationsTransfers, type OperationsTransfer } from "../../lib/milestone-2-fixtures";
import { getPortalNavigation } from "../../lib/portal";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { StatusBadge } from "../ui/status-badge";
import { HoldTransferDialog } from "./hold-transfer-dialog";

type OperationsRole = "staff" | "admin";

const metrics = [
  { label: "New requests", value: "12", tone: "info", icon: "transfers" as const },
  { label: "Quotes due", value: "5", tone: "warning", icon: "activity" as const },
  { label: "Funding review", value: "3", tone: "review", icon: "funding" as const },
  { label: "Exceptions", value: "2", tone: "danger", icon: "exceptions" as const }
];

export function OperationsPortal({ role }: { role: OperationsRole }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<OperationsTransfer>(() => {
    const firstTransfer = operationsTransfers[0];
    if (!firstTransfer) throw new Error("Milestone 2 operations fixtures are empty");
    return firstTransfer;
  });
  const [detailOpen, setDetailOpen] = useState(true);
  const [holdOpen, setHoldOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null);
  const holdTriggerRef = useRef<HTMLButtonElement | null>(null);
  const navigation = getPortalNavigation(role);

  const filteredTransfers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return operationsTransfers;
    return operationsTransfers.filter((transfer) =>
      [transfer.reference, transfer.sender, transfer.route, transfer.status, transfer.owner]
        .some((value) => value.toLowerCase().includes(normalized))
    );
  }, [query]);

  const closeDetail = () => {
    setDetailOpen(false);
    requestAnimationFrame(() => selectedTriggerRef.current?.focus());
  };

  const closeHold = () => {
    setHoldOpen(false);
    requestAnimationFrame(() => holdTriggerRef.current?.focus());
  };

  return (
    <main className={detailOpen ? "operations-portal has-detail" : "operations-portal"}>
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
        <div className="operations-user"><span className="avatar">NK</span><span><strong>Nadia Khan</strong><small>{role === "admin" ? "Admin" : "Staff"}</small></span></div>
      </aside>

      <section className="operations-workspace">
        <header className="operations-mobile-header">
          <a className="brand" href={role === "admin" ? "/admin" : "/staff"}>Hawelly</a>
          <span>Operations</span>
          <button aria-expanded={menuOpen} aria-label="Toggle operations navigation" className="icon-button" onClick={() => setMenuOpen((value) => !value)} type="button"><Icon name="menu" /></button>
        </header>
        <div className="operations-topbar">
          <h1>Transfer operations</h1>
          <label className="search-field">
            <span className="sr-only">Search reference or sender</span><Icon name="search" />
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Search reference or sender" type="search" value={query} />
          </label>
        </div>

        <div className="operations-content">
          <section className="metric-strip" aria-label="Transfer queue summary">
            {metrics.map((metric) => (
              <div className={`metric metric-${metric.tone}`} key={metric.label}>
                <Icon name={metric.icon} /><span><small>{metric.label}</small><strong>{metric.value}</strong></span>
              </div>
            ))}
          </section>

          <section className="transfer-queue" id="transfers" aria-labelledby="active-transfers-title">
            <h2 id="active-transfers-title">Active transfers</h2>
            <div className="operations-table-wrap">
              <table className="operations-table">
                <thead><tr><th>Reference</th><th>Sender</th><th>Route</th><th>Amount</th><th>Status</th><th>Owner</th><th>Due</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {filteredTransfers.map((transfer) => (
                    <tr className={selected.reference === transfer.reference && detailOpen ? "is-selected" : ""} key={transfer.reference}>
                      <td><button
                        aria-label={`View ${transfer.reference}`}
                        className="table-link"
                        onClick={(event) => {
                          selectedTriggerRef.current = event.currentTarget;
                          setSelected(transfer);
                          setDetailOpen(true);
                        }}
                        type="button"
                      >{transfer.reference}</button></td>
                      <td>{transfer.sender}</td><td>{transfer.route}</td><td>{transfer.amount}</td>
                      <td><StatusBadge label={transfer.status} tone={transfer.tone} /></td>
                      <td>{transfer.owner}</td><td className={transfer.due.includes("h") ? "due-soon" : ""}>{transfer.due}</td>
                      <td><button
                        className="row-action"
                        aria-label={`View ${transfer.reference} details`}
                        onClick={(event) => {
                          selectedTriggerRef.current = event.currentTarget;
                          setSelected(transfer);
                          setDetailOpen(true);
                        }}
                        type="button"
                      ><span className="desktop-more">•••</span><span className="mobile-view">View <Icon name="chevron" /></span></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredTransfers.length ? <p className="queue-empty">No transfers match this search.</p> : null}
            </div>
          </section>
        </div>
      </section>

      {detailOpen ? (
        <aside aria-label={`Transfer ${selected.reference} details`} className="transfer-detail">
          <div className="detail-heading"><h2>{selected.reference}</h2><button aria-label="Close transfer details" className="icon-button" onClick={closeDetail} type="button"><Icon name="close" /></button></div>
          <StatusBadge label={selected.status} tone={selected.tone} />
          <dl className="detail-list">
            <div><dt>Reference</dt><dd>{selected.reference}</dd></div><div><dt>Sender</dt><dd>{selected.sender}</dd></div><div><dt>Route</dt><dd>{selected.route}</dd></div><div><dt>Amount</dt><dd>{selected.amount}</dd></div>
            <div className="detail-divider"><dt>Status</dt><dd>{selected.status}</dd></div><div><dt>Owner</dt><dd>{selected.owner}</dd></div><div><dt>Due</dt><dd>{selected.due}</dd></div><div><dt>Created</dt><dd>{selected.created}</dd></div>
            <div className="detail-divider"><dt>Source country</dt><dd>{selected.sourceCountry}</dd></div><div><dt>Destination country</dt><dd>{selected.destinationCountry}</dd></div><div><dt>Payment method</dt><dd>{selected.payoutMethod}</dd></div>
          </dl>
          <div className="detail-actions"><h3>Actions</h3><Button fullWidth>Open transfer</Button><Button fullWidth onClick={() => { holdTriggerRef.current = document.activeElement as HTMLButtonElement; setHoldOpen(true); }} variant="outline">Place on hold</Button></div>
        </aside>
      ) : null}

      <HoldTransferDialog
        onCancel={closeHold}
        onConfirm={() => {
          setAnnouncement("Confirmation interface completed. No transfer was changed.");
          closeHold();
        }}
        open={holdOpen}
        reference={selected.reference}
      />
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </main>
  );
}
