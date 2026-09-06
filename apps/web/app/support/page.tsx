import Link from "next/link";

export default function SupportPage() {
  return (
    <main className="support-page">
      <header className="support-header">
        <Link className="brand" href="/">Hawelly</Link>
        <Link className="sign-in" href="/sign-in?next=%2Fsender">Sender sign in</Link>
      </header>
      <div className="support-shell">
        <div className="support-intro">
          <p className="eyebrow">Controlled-beta support</p>
          <h1>Report clearly. Protect your information.</h1>
          <p>
            Hawelly does not publish a support address on this beta page. Use the
            verified channel through which you received beta access.
          </p>
        </div>
        <div className="support-grid">
          <section>
            <span className="support-index">01</span>
            <h2>Describe what happened</h2>
            <p>Include the screen, action, approximate time, and what you expected to happen.</p>
          </section>
          <section>
            <span className="support-index">02</span>
            <h2>Include the reference</h2>
            <p>If a transfer reference exists, include it. Do not include passwords, session codes, full bank details, or identity documents.</p>
          </section>
          <section>
            <span className="support-index">03</span>
            <h2>Avoid duplicate actions</h2>
            <p>If a submission appears stuck, check the transfer page first. Do not repeatedly submit, fund, or upload the same item.</p>
          </section>
        </div>
        <aside className="support-warning">
          <strong>Security reminder</strong>
          <p>Hawelly staff should never need your password. Share evidence only through the protected transfer flow when requested.</p>
        </aside>
        <div className="support-actions">
          <Link className="primary-action" href="/sender">Return to sender workspace</Link>
          <Link className="secondary-action" href="/">Back to homepage</Link>
        </div>
      </div>
    </main>
  );
}
