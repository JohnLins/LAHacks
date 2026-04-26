import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
import { mergeUserResponse } from './userProfile';
import './App.css';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = event => {
    event.preventDefault();
    setError('');
    apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const nextFromResponse = rawUser => {
          const u = mergeUserResponse(rawUser);
          const serverModes = rawUser.account_modes || [];
          const needsContractorSetup = !serverModes.includes('worker') || !u.onboarding_completed;
          navigate(needsContractorSetup ? '/onboarding' : '/dashboard');
        };
        if (data.user) {
          nextFromResponse(data.user);
        } else {
          apiFetch('/api/auth/me')
            .then(r => (r.ok ? r.json() : Promise.reject()))
            .then(nextFromResponse)
            .catch(() => setError('Session could not be started after login.'));
        }
      });
  };

  return (
    <main className="shell narrow-shell">
      <section className="panel auth-panel">
        <p className="eyebrow">Human Agent access</p>
        <h1>Login</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Username
            <input value={username} onChange={event => setUsername(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">Login as human agent</button>
        </form>
        {error && <p className="notice error">{error}</p>}
        <p className="helper-text">No account yet? <Link to="/register">Create one</Link></p>
      </section>
    </main>
  );
}

export default Login;
