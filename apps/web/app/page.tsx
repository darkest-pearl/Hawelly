const workflow = [
  "Quote requested",
  "Quote ready",
  "Funding",
  "Payout",
  "Complete"
] as const;

function EmptyTrayIcon() {
  return (
    <svg
      aria-hidden="true"
      className="empty-icon"
      fill="none"
      viewBox="0 0 48 48"
    >
      <path d="M9 28.5h10l2.5 4h5l2.5-4h10" />
      <path d="m14 11-5 17.5V37h30v-8.5L34 11H14Z" />
    </svg>
  );
}

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Hawelly home">
          Hawelly
        </a>
        <nav aria-label="Primary navigation">
          <a href="#recent-transfers">Transfers</a>
          <a href="#recipients">Recipients</a>
          <a href="#support">Support</a>
        </nav>
        <a className="sign-in" href="#sign-in">
          Sign in
        </a>
      </header>

      <div className="page-shell" id="top">
        <section className="intro" aria-labelledby="page-title">
          <h1 id="page-title">Move money with clarity.</h1>
          <a className="primary-action" href="#recent-transfers">
            Request a transfer
          </a>
        </section>

        <section className="workflow" aria-labelledby="workflow-title">
          <h2 id="workflow-title">Transfer workflow</h2>
          <ol>
            {workflow.map((step, index) => (
              <li key={step}>
                <span className="step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="recent-transfers"
          id="recent-transfers"
          aria-labelledby="recent-title"
        >
          <h2 id="recent-title">Recent transfers</h2>
          <div className="empty-state">
            <EmptyTrayIcon />
            <p>No transfers yet</p>
          </div>
        </section>

        <span className="anchor-target" id="recipients" />
        <span className="anchor-target" id="support" />
        <span className="anchor-target" id="sign-in" />
      </div>
    </main>
  );
}
