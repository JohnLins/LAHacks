import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
import { setLocalProfile } from './userProfile';
import './App.css';

function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = event => {
    event.preventDefault();
    setError('');
    apiFetch('/api/auth/register', {
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
        // Minimal backends (e.g. LAHacks) do not create a session on register — sign in so /onboarding can load /me.
        return apiFetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
          .then(r => r.json().then(j => ({ ok: r.ok, j })))
          .then(({ ok, j }) => {
            if (!ok || j.error) {
              setError('Account created, but sign-in failed. Log in from the login page.');
              return;
            }
            setLocalProfile(username, { onboarding_completed: false, account_modes: ['worker'], task_topics: [] });
            navigate('/onboarding');
          });
      });
  };

  return (
    <main className="shell narrow-shell">
      <section className="panel auth-panel">
        <p className="eyebrow">Human Agent access</p>
        <h1>Sign Up</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Username
            <input value={username} onChange={event => setUsername(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">Create human agent account</button>
        </form>
        {error && <p className="notice error">{error}</p>}
        <p className="helper-text">Already registered? <Link to="/login">Login</Link></p>
      </section>
    </main>
  );
}

export default Register;
