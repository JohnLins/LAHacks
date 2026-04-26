import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
import { mergeUserResponse } from './userProfile';
import './App.css';

const statusLabel = status => {
  if (status === 'claimed' || status === 'accepted') return 'In flight';
  if (status === 'submitted') return 'Submitted';
  if (status === 'completed') return 'Paid';
  return status || 'Open';
};

function Dashboard() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(res => {
        if (res.status === 401) {
          navigate('/login');
          return null;
        }
        return res.json();
      })
      .then(currentUser => {
        if (!currentUser) return;
        const serverModes = currentUser.account_modes || [];
        if (!serverModes.includes('worker') || currentUser.onboarding_completed === false) {
          navigate('/onboarding');
          return;
        }
        setUser(mergeUserResponse(currentUser));
        return apiFetch('/api/tasks/')
          .then(res => res.json())
          .then(allTasks => setTasks(allTasks));
      });
  }, [navigate]);

  const earned = Number(user?.fake_balance || 0);
  const roleLabel = 'Human';
  const assignedTasks = useMemo(() => tasks.filter(task => task.assigned_user === user?.username), [tasks, user]);
  const activeTasks = useMemo(() => assignedTasks.filter(task => ['claimed', 'accepted'].includes(task.status)), [assignedTasks]);
  const completedTasks = useMemo(() => assignedTasks.filter(task => task.status === 'completed'), [assignedTasks]);

  const handleLogout = () => {
    apiFetch('/api/auth/logout', {
      method: 'POST',
    }).finally(() => {
      setUser(null);
      setTasks([]);
      navigate('/login');
    });
  };

  if (!user) {
    return <main className="shell"><p className="empty-state">Loading dashboard...</p></main>;
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Human Agent console</p>
          <h1>Human Agent</h1>
        </div>
        <nav className="nav-actions" aria-label="Dashboard">
          <Link className="ghost-link" to="/tasks">Agent queue</Link>
          <Link className="ghost-link" to="/verify">World ID</Link>
          <button className="secondary-button" type="button" onClick={handleLogout}>Logout</button>
        </nav>
      </header>

      <section className="panel identity-panel">
        <div>
          <p className="eyebrow">Signed in as</p>
          <h2>{user.username}</h2>
          <div className="profile-tags">
            <span>Human Agent</span>
            {(user.task_topics || []).map(topic => (
              <span key={topic}>{topic}</span>
            ))}
          </div>
        </div>
        <div className="identity-actions">
          <span className={`status-pill ${user.world_id_verified ? 'completed' : 'open'}`}>
            {user.world_id_verified ? 'World ID verified' : 'World ID pending'}
          </span>
        </div>
      </section>

      <section className="metrics-grid">
        <div className="metric">
          <span>Verified</span>
          <strong>{user.world_id_verified ? 'Yes' : 'No'}</strong>
        </div>
        <div className="metric">
          <span>Mode</span>
          <strong>{roleLabel}</strong>
        </div>
        <div className="metric">
          <span>Balance</span>
          <strong>${earned.toFixed(2)}</strong>
        </div>
        <div className="metric">
          <span>Active</span>
          <strong>{activeTasks.length}</strong>
        </div>
        <div className="metric">
          <span>Completed</span>
          <strong>{completedTasks.length}</strong>
        </div>
      </section>

      {!user.world_id_verified && (
        <section className="panel callout-panel">
          <div>
            <h2>Verify once to accept agent work</h2>
            <p>Open tasks require World ID verification before a human agent can claim them.</p>
          </div>
          <Link className="primary-button link-button" to="/verify">Verify with World ID</Link>
        </section>
      )}

      <section className="panel">
        <div className="panel-header split">
          <div>
            <h2>Your tasks</h2>
          </div>
          <Link className="secondary-button link-button" to="/tasks">Find work</Link>
        </div>

        {assignedTasks.length === 0 ? (
          <p className="empty-state">No assigned tasks yet.</p>
        ) : (
          <div className="task-stack">
            {assignedTasks.map(task => (
              <Link className="task-row" to={`/task/${task.id}`} key={task.id}>
                <div>
                  <span className={`status-pill ${task.status}`}>{statusLabel(task.status)}</span>
                  <h3>{task.description}</h3>
                  <p>Human Agent work request</p>
                </div>
                <strong>${Number(task.compensation || 0).toFixed(2)}</strong>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default Dashboard;
