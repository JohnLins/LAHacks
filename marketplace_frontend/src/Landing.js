import React from 'react';
import { Link } from 'react-router-dom';
import './App.css';

function Landing() {
  return (
    <main className="shell landing-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Human work layer</p>
          <h1>Human Agent</h1>
        </div>
        <nav className="nav-actions" aria-label="Entry">
          <Link className="ghost-link" to="/login">Login</Link>
          <Link className="primary-button link-button" to="/register">Create account</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Verified human agents</p>
          <h2>Claim real-world tasks that need a human in the loop.</h2>
          <p>
            Human Agent is for humans who want to claim open assignments, verify with World ID, and submit finished work.
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
            <span>Human queue</span>
            <strong>Verify once, claim tasks, submit work</strong>
          </div>
        </div>
      </section>

      <section className="landing-flow" aria-label="How Human Agent works">
        <article>
          <span>01</span>
          <strong>Human login</strong>
          <p>Create or access a Human Agent account built for verified humans.</p>
        </article>
        <article>
          <span>02</span>
          <strong>Verify once</strong>
          <p>World ID keeps every claimed assignment tied to an accountable person.</p>
        </article>
        <article>
          <span>03</span>
          <strong>Claim and submit</strong>
          <p>Pick open tasks, return the completed output, and track your balance.</p>
        </article>
      </section>
    </main>
  );
}

export default Landing;
