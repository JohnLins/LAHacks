import React from 'react';
import { Link } from 'react-router-dom';
import './App.css';

function Landing() {
  return (
    <main className="shell landing-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Human work exchange</p>
          <h1>Dispatch Board</h1>
        </div>
        <nav className="nav-actions" aria-label="Entry">
          <Link className="ghost-link" to="/login">Login</Link>
          <Link className="primary-button link-button" to="/register">Create account</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Verified labor / agent-assisted posting</p>
          <h2>Tool calls in the real world.</h2>
          <p>
            HumanAgent keeps the public surface simple: log in to see work, let an agent draft task briefs and prices, then require World ID before anyone can claim a job.
          </p>
          <div className="action-row">
            <Link className="primary-button link-button" to="/register">Get started</Link>
            <Link className="secondary-button link-button" to="/login">I have an account</Link>
          </div>
        </div>

        <div className="landing-showcase">
          <div className="landing-visual" aria-label="Abstract task routing visual">
            <img alt="" src="/assets/dispatch-abstract.png" />
          </div>
          <div className="visual-caption">
            <span>Task signal</span>
            <strong>Request → agent brief → verified worker</strong>
          </div>
        </div>
      </section>

      <section className="landing-flow" aria-label="How Dispatch Board works">
        <article>
          <span>01</span>
          <strong>Login gate</strong>
          <p>Visitors see the landing page. Accounts see the queue.</p>
        </article>
        <article>
          <span>02</span>
          <strong>Agent draft</strong>
          <p>Paste a messy request and preview priced tasks before posting.</p>
        </article>
        <article>
          <span>03</span>
          <strong>Human claim</strong>
          <p>World ID is required before a worker accepts assignments.</p>
        </article>
      </section>
    </main>
  );
}

export default Landing;
