import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WorldIDButton } from './world-id';
import { apiFetch } from './api';
import { mergeUserResponse } from './userProfile';
import './App.css';

function WorldVerify() {
  const [user, setUser] = useState(null);
  const [checkingUser, setCheckingUser] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data) setUser(mergeUserResponse(data));
      })
      .finally(() => setCheckingUser(false));
  }, []);

  const handleVerify = data => {
    if (data && data.message) {
      setMessage(data.message);
      setTimeout(() => navigate('/dashboard'), 1000);
    }
  };

  return (
    <main className="shell narrow-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Identity gate</p>
          <h1>World ID</h1>
        </div>
        <Link className="ghost-link" to="/dashboard">Dashboard</Link>
      </header>

      <section className="panel auth-panel">
        <h2>Verify once, accept work immediately.</h2>
        <p className="helper-text">
          Human Agent uses World ID to keep each human worker accountable before task assignment.
        </p>
        {checkingUser && <p className="notice">Checking account session...</p>}
        {!checkingUser && !user && (
          <div className="action-row">
            <Link className="primary-button link-button" to="/login">Login first</Link>
            <Link className="secondary-button link-button" to="/register">Create account</Link>
          </div>
        )}
        {!checkingUser && user && user.world_id_verified && (
          <p className="notice success">World ID is already verified for {user.username}.</p>
        )}
        {!checkingUser && user && !user.world_id_verified && (
          <WorldIDButton onVerify={handleVerify} onError={setError} />
        )}
        {message && <p className="notice success">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>
    </main>
  );
}

export default WorldVerify;
