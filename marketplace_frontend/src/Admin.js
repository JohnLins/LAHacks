import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
import { mergeUserResponse } from './userProfile';
import './App.css';

function Admin() {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetPasswords, setResetPasswords] = useState({});
  const navigate = useNavigate();

  const loadUsers = () => {
    setError('');
    apiFetch('/api/admin/users')
      .then(res => res.json().then(data => ({ ok: res.ok, status: res.status, data })))
      .then(({ ok, status, data }) => {
        if (status === 403 || status === 401) {
          navigate('/login');
          return;
        }
        if (!ok) {
          setError(data.error || 'Could not load users');
          return;
        }
        setUsers(data.users || []);
      })
      .catch(() => setError('Could not load users'));
  };

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(res => {
        if (res.status === 401) {
          navigate('/login');
          return null;
        }
        return res.json();
      })
      .then(user => {
        if (!user) return;
        const merged = mergeUserResponse(user);
        if (!merged.is_admin) {
          navigate('/tasks');
          return;
        }
        setCurrentUser(merged);
        loadUsers();
      });
  }, [navigate]);

  const handleResetPassword = user => {
    const password = resetPasswords[user.id] || '';
    setMessage('');
    setError('');
    apiFetch(`/api/admin/users/${user.id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || 'Could not reset password');
          return;
        }
        setMessage(`${data.message}. New password: ${data.temporary_password}`);
        setResetPasswords(current => ({ ...current, [user.id]: '' }));
        loadUsers();
      })
      .catch(() => setError('Could not reset password'));
  };

  const handleRemoveWorldID = user => {
    const confirmed = window.confirm(`Remove World ID verification from ${user.username}?`);
    if (!confirmed) return;
    setMessage('');
    setError('');
    apiFetch(`/api/admin/users/${user.id}/world-id`, {
      method: 'DELETE',
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || 'Could not remove World ID');
          return;
        }
        setMessage(data.message);
        loadUsers();
      })
      .catch(() => setError('Could not remove World ID'));
  };

  const handleDeleteUser = user => {
    const confirmed = window.confirm(`Delete ${user.username}? Their assigned tasks will return to open.`);
    if (!confirmed) return;
    setMessage('');
    setError('');
    apiFetch(`/api/admin/users/${user.id}`, {
      method: 'DELETE',
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || 'Could not delete user');
          return;
        }
        setMessage(data.message);
        loadUsers();
      })
      .catch(() => setError('Could not delete user'));
  };

  if (!currentUser) {
    return <main className="shell"><p className="empty-state">Loading admin console...</p></main>;
  }

  return (
    <main className="shell admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1>Users</h1>
        </div>
        <nav className="nav-actions" aria-label="Admin">
          <Link className="ghost-link" to="/dashboard">Dashboard</Link>
          <Link className="ghost-link" to="/tasks">Agent queue</Link>
        </nav>
      </header>

      <section className="panel">
        <div className="panel-header">
          <p className="eyebrow">Credentials</p>
          <h2>User access</h2>
          <p className="helper-text">
            Passwords are hashed, so the original value cannot be displayed. Reset a password to create a new one.
          </p>
        </div>
        {message && <p className="notice success">{message}</p>}
        {error && <p className="notice error">{error}</p>}

        <div className="admin-user-list">
          {users.map(user => (
            <article className="admin-user-card" key={user.id}>
              <div>
                <p className="eyebrow">#{user.id}</p>
                <h3>{user.username}</h3>
                <div className="profile-tags">
                  {user.is_admin && <span>admin</span>}
                  <span>{user.world_id_verified ? 'World ID verified' : 'World ID pending'}</span>
                  <span>{user.world_id_binding_count} World ID bindings</span>
                  <span>{user.assigned_task_count} assigned tasks</span>
                </div>
                <p className="helper-text">{user.password_status}</p>
              </div>

              <div className="admin-actions">
                <label>
                  New password
                  <input
                    placeholder="Leave blank to generate"
                    value={resetPasswords[user.id] || ''}
                    onChange={event => setResetPasswords(current => ({ ...current, [user.id]: event.target.value }))}
                  />
                </label>
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={() => handleResetPassword(user)}>
                    Reset password
                  </button>
                  <button className="secondary-button" type="button" onClick={() => handleRemoveWorldID(user)}>
                    Remove World ID
                  </button>
                  <button className="secondary-button danger-button" type="button" onClick={() => handleDeleteUser(user)} disabled={user.id === currentUser.id}>
                    Delete user
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default Admin;
