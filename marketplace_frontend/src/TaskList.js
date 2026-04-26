import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
import { mergeUserResponse } from './userProfile';
import './App.css';

const statusLabels = {
  all: 'All',
  open: 'Open',
  claimed: 'In flight',
  submitted: 'Submitted',
  completed: 'Paid',
};

const getStatusLabel = status => (status === 'accepted' ? 'In flight' : statusLabels[status] || status);

function TaskList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [statusFilter, setStatusFilter] = useState('open');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadTasks = () => {
    setLoading(true);
    apiFetch('/api/auth/me')
      .then(res => {
        if (res.status === 401) {
          navigate('/login');
          return null;
        }
        return res.json();
      })
      .then(currentUser => {
        if (!currentUser) return null;
        const serverModes = currentUser.account_modes || [];
        if (!serverModes.includes('worker') || currentUser.onboarding_completed === false) {
          navigate('/onboarding');
          return null;
        }
        setUser(mergeUserResponse(currentUser));
        return apiFetch('/api/tasks/');
      })
      .then(res => res ? res.json() : null)
      .then(data => {
        if (data) setTasks(Array.isArray(data) ? data : []);
      })
      .catch(() => setError('Could not load tasks.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    if (location.hash !== '#task-queue') return;
    const el = document.getElementById('task-queue');
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.pathname, location.hash, location.key]);

  const stats = useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        acc.total += 1;
        acc.value += Number(task.compensation || 0);
        return acc;
      },
      { total: 0, open: 0, claimed: 0, accepted: 0, submitted: 0, completed: 0, value: 0 }
    );
  }, [tasks]);

  const filteredTasks = tasks.filter(task => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'claimed') return ['claimed', 'accepted'].includes(task.status);
    return task.status === statusFilter;
  });
  const isLoadingUser = loading && !user;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Human Agent queue</p>
          <h1>Find Work</h1>
        </div>
        <nav className="nav-actions" aria-label="Primary">
          <Link className="ghost-link" to="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <section className="metrics-grid" aria-label="Human Agent metrics">
        <div className="metric">
          <span>Open</span>
          <strong>{stats.open || 0}</strong>
        </div>
        <div className="metric">
          <span>In flight</span>
          <strong>{(stats.claimed || 0) + (stats.accepted || 0)}</strong>
        </div>
        <div className="metric">
          <span>Submitted</span>
          <strong>{stats.submitted || 0}</strong>
        </div>
        <div className="metric">
          <span>Paid</span>
          <strong>{stats.completed || 0}</strong>
        </div>
        <div className="metric">
          <span>Listed value</span>
          <strong>${stats.value.toFixed(0)}</strong>
        </div>
      </section>

      <section className="workspace-grid worker-workspace">
        <section className="panel queue-panel" id="task-queue">
          <div className="panel-header split">
            <div>
              <p className="eyebrow">Live queue</p>
              <h2>Available work</h2>
            </div>
            <button className="secondary-button" type="button" onClick={loadTasks}>Refresh</button>
          </div>
          {error && <p className="notice error">{error}</p>}

          <div className="segmented-control" role="tablist" aria-label="Task status filter">
            {Object.keys(statusLabels).map(status => (
              <button
                key={status}
                className={statusFilter === status ? 'active' : ''}
                type="button"
                onClick={() => setStatusFilter(status)}
              >
                {statusLabels[status]}
              </button>
            ))}
          </div>

          {isLoadingUser ? (
            <p className="empty-state">Loading account...</p>
          ) : loading ? (
            <p className="empty-state">Loading tasks...</p>
          ) : filteredTasks.length === 0 ? (
            <p className="empty-state">No tasks in this lane.</p>
          ) : (
            <div className="task-stack">
              {filteredTasks.map(task => (
                <Link className="task-row" to={`/task/${task.id}`} key={task.id}>
                  <div>
                    <span className={`status-pill ${task.status}`}>{getStatusLabel(task.status)}</span>
                    <h3>{task.description}</h3>
                    <p>
                      {task.assigned_user ? `Assigned to ${task.assigned_user}` : 'Ready for a human agent'}
                    </p>
                  </div>
                  <strong>${Number(task.compensation || 0).toFixed(2)}</strong>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default TaskList;
