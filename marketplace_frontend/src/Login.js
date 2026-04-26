import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
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
        if (data.error) setError(data.error);
        else if (data.user?.is_admin) navigate('/admin');
        else navigate(data.user && !data.user.onboarding_completed ? '/onboarding' : '/dashboard');
      });
  };

  return (
    <main className="shell narrow-shell">
      <section className="panel auth-panel">
        <p className="eyebrow">Worker access</p>
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
          <button className="primary-button" type="submit">Login</button>
        </form>
        {error && <p className="notice error">{error}</p>}
        <p className="helper-text">No account yet? <Link to="/register">Create one</Link></p>
      </section>
    </main>
  );
}

export default Login;
