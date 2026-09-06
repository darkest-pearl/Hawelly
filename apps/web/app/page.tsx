import Link from "next/link";
import { publicLinks } from "../lib/public-entry";

const workflow = [
  {
    number: "01",
    title: "Tell us the route",
    detail: "Choose a recipient, destination, amount, and payout method."
  },
  {
    number: "02",
    title: "Review the quote",
    detail: "Staff prepare the rate, fees, delivery estimate, and expiry."
  },
  {
    number: "03",
    title: "Decide before funding",
    detail: "Accept only when the quote works for you; then follow its instructions."
  }
] as const;

export default function Home() {
  return (
    <main className="public-site">
      <header className="site-header">
        <Link className="brand" href={publicLinks.brand} aria-label="Hawelly home">
          Hawelly
        </Link>
        <nav aria-label="Primary navigation">
          <Link href={publicLinks.transfers}>Transfers</Link>
          <Link href={publicLinks.recipients}>Recipients</Link>
          <Link href={publicLinks.support}>Support</Link>
        </nav>
        <div className="site-actions">
          <Link className="sign-in" href={publicLinks.signIn}>Sender sign in</Link>
          <Link className="header-create" href={publicLinks.createAccount}>Create account</Link>
        </div>
      </header>

      <section className="public-hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow">Staff-guided cross-border transfers</p>
          <h1 id="page-title">Know the route before money moves.</h1>
          <p className="hero-lede">
            Create a request, receive a clear quote from Hawelly staff, and decide
            before funding. No anonymous transfer details are shown here.
          </p>
          <div className="hero-actions">
            <Link className="primary-action" href={publicLinks.requestTransfer}>
              Request a transfer <span aria-hidden="true">→</span>
            </Link>
            <Link className="secondary-action" href={publicLinks.createAccount}>
              Create sender account
            </Link>
          </div>
          <p className="beta-note">
            <span aria-hidden="true" /> Controlled beta · Availability depends on route and review
          </p>
        </div>

        <div className="route-board" aria-label="How a Hawelly transfer moves">
          <div className="route-board-heading">
            <span>Transfer route</span>
            <strong>Review before funding</strong>
          </div>
          <ol>
            <li>
              <span className="route-marker">A</span>
              <div><strong>Your request</strong><small>Recipient · amount · payout preference</small></div>
            </li>
            <li>
              <span className="route-marker route-marker-review">H</span>
              <div><strong>Hawelly review</strong><small>Rate · fees · timing · quote expiry</small></div>
            </li>
            <li>
              <span className="route-marker">B</span>
              <div><strong>Your decision</strong><small>Accept or decline before funding</small></div>
            </li>
          </ol>
          <div className="route-guardrail">
            <span aria-hidden="true">i</span>
            A request is not a completed transfer and does not move money.
          </div>
        </div>
      </section>

      <section className="public-workflow" aria-labelledby="workflow-title">
        <div className="section-intro">
          <p className="eyebrow">A deliberate process</p>
          <h2 id="workflow-title">Three clear decisions, in order.</h2>
        </div>
        <ol>
          {workflow.map((step) => (
            <li key={step.number}>
              <span className="workflow-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="public-portals" aria-labelledby="portal-title">
        <div>
          <p className="eyebrow">Already working with Hawelly?</p>
          <h2 id="portal-title">Go straight to your workspace.</h2>
        </div>
        <div className="portal-links">
          <Link href={publicLinks.transfers}><strong>Sender</strong><span>Transfers and recipients</span><b aria-hidden="true">→</b></Link>
          <Link href={publicLinks.staff}><strong>Staff</strong><span>Transfer operations</span><b aria-hidden="true">→</b></Link>
          <Link href={publicLinks.admin}><strong>Admin</strong><span>Configuration and access</span><b aria-hidden="true">→</b></Link>
        </div>
      </section>

      <footer className="public-footer">
        <Link className="brand brand-inverse" href="/">Hawelly</Link>
        <p>Cross-border transfer coordination with human review.</p>
        <Link href={publicLinks.support}>Beta support and safety guidance</Link>
      </footer>
    </main>
  );
}
