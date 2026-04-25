import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
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
        if (data.error) setError(data.error);
        else navigate('/onboarding');
      });
  };

  return (
    <main className="shell narrow-shell">
      <section className="panel auth-panel">
        <p className="eyebrow">New account</p>
        <h1>Register</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Username
            <input value={username} onChange={event => setUsername(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">Create account</button>
        </form>
        {error && <p className="notice error">{error}</p>}
        <p className="helper-text">Already registered? <Link to="/login">Login</Link></p>
      </section>
    </main>
  );
}

export default Register;
