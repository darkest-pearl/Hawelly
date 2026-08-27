"use client";

import { useState } from "react";
import { senderTransfers } from "../../lib/milestone-2-fixtures";
import { getPortalNavigation } from "../../lib/portal";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Icon } from "../ui/icon";
import { StatusBadge } from "../ui/status-badge";

const workflow = ["Requested", "Quote ready", "Funding", "Payout", "Complete"];

export function SenderPortal() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const navigation = getPortalNavigation("sender").primary;

  return (
    <main className="sender-portal">
      <header className="sender-header">
        <a className="brand" href="/sender" aria-label="Hawelly sender home">Hawelly</a>
        <nav aria-label="Sender navigation" className={menuOpen ? "is-open" : ""}>
          {navigation.map((item, index) => (
            <a aria-current={index === 0 ? "page" : undefined} href={item.href} key={item.label}>{item.label}</a>
          ))}
        </nav>
        <button className="sender-user" type="button" aria-label="Open Maya Chen account menu">
          <span className="avatar">MC</span><span>Maya Chen</span><Icon className="account-chevron" name="chevron" />
        </button>
        <button
          aria-expanded={menuOpen}
          aria-label="Toggle sender navigation"
          className="sender-menu-button icon-button"
          onClick={() => setMenuOpen((value) => !value)}
          type="button"
        >
          <Icon name="menu" />
        </button>
      </header>

      <div className="sender-content">
        <section className="sender-page-heading" aria-labelledby="sender-title">
          <h1 id="sender-title">Your transfers</h1>
          <Button size="large">Request a transfer</Button>
        </section>

        <section className="active-quote" aria-labelledby="active-quote-title">
          <div className="active-quote-heading">
            <h2 id="active-quote-title">HW-24018</h2>
            <StatusBadge label="Quote ready" tone="info" />
          </div>
          <dl className="quote-economics">
            <div><dt>You send</dt><dd>AED 2,500.00</dd></div>
            <div><dt>Fee</dt><dd>AED 35.00</dd></div>
            <div><dt>Recipient gets</dt><dd>PHP 38,612.50</dd></div>
            <div><dt>Expected by</dt><dd>29 Aug</dd></div>
          </dl>
          <div className="quote-actions">
            <Button onClick={() => setQuoteOpen(true)}>Review quote</Button>
            <Button onClick={() => setQuoteOpen(true)} variant="outline">Reject</Button>
          </div>
          <ol className="sender-progress" aria-label="Transfer progress">
            {workflow.map((step, index) => (
              <li className={index < 2 ? "is-reached" : ""} key={step}>
                <span className="progress-number">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="sender-recent" aria-labelledby="sender-recent-title">
          <h2 id="sender-recent-title">Recent transfers</h2>
          <div className="sender-table" role="table" aria-label="Recent transfers">
            <div className="sender-table-head" role="row">
              <span role="columnheader">Transfer ID</span><span role="columnheader">You send</span><span role="columnheader">Recipient gets</span><span role="columnheader">Status</span><span role="columnheader">Expected by</span><span aria-hidden="true" />
            </div>
            {senderTransfers.map((transfer) => (
              <div className="sender-transfer-row" role="row" key={transfer.reference}>
                <strong role="cell">{transfer.reference}</strong>
                <span role="cell">{transfer.sent}</span>
                <span role="cell">{transfer.received}</span>
                <span role="cell"><StatusBadge label={transfer.status} tone={transfer.tone} /></span>
                <span role="cell">{transfer.expected}</span>
                <button role="cell" type="button" onClick={() => setQuoteOpen(true)}>View</button>
                <span aria-hidden="true" className="mobile-amounts">{transfer.sent}<i>•</i>{transfer.received}</span>
              </div>
            ))}
          </div>
          <button className="text-link" type="button">View all transfers</button>
        </section>
        <span id="recipients" /><span id="support" />
      </div>

      <Dialog
        description="Review the current economics and timing before choosing an action."
        onClose={() => setQuoteOpen(false)}
        open={quoteOpen}
        title="Quote HW-24018"
      >
        <dl className="dialog-detail-list">
          <div><dt>You send</dt><dd>AED 2,500.00</dd></div>
          <div><dt>Fee</dt><dd>AED 35.00</dd></div>
          <div><dt>Recipient gets</dt><dd>PHP 38,612.50</dd></div>
          <div><dt>Expected by</dt><dd>29 Aug</dd></div>
        </dl>
        <div className="dialog-actions"><Button onClick={() => setQuoteOpen(false)}>Close</Button></div>
      </Dialog>
    </main>
  );
}
