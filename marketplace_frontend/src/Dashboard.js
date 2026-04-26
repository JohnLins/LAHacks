import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
import './App.css';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [identityMessage, setIdentityMessage] = useState('');
  const [identityError, setIdentityError] = useState('');
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
        setUser(currentUser);
        return apiFetch('/api/tasks/')
          .then(res => res.json())
          .then(allTasks => setTasks(allTasks));
      });
  }, [navigate]);

  const earned = Number(user?.fake_balance || 0);
  const modes = user?.account_modes || [];
  const isWorker = modes.includes('worker');
  const isContractor = modes.includes('contractor');
  const isHybrid = isWorker && isContractor;
  const roleLabel = isContractor && !isWorker ? 'Requester' : isWorker && !isContractor ? 'Worker' : 'Hybrid';
  const assignedTasks = useMemo(() => tasks.filter(task => task.assigned_user === user?.username), [tasks, user]);
  const postedTasks = useMemo(() => tasks.filter(task => task.created_by === user?.username), [tasks, user]);
  const activeTasks = useMemo(() => assignedTasks.filter(task => task.status === 'accepted'), [assignedTasks]);
  const completedTasks = useMemo(() => assignedTasks.filter(task => task.status === 'completed'), [assignedTasks]);
  const openPostedTasks = useMemo(() => postedTasks.filter(task => task.status === 'open'), [postedTasks]);

  const handleLogout = () => {
    apiFetch('/api/auth/logout', {
      method: 'POST',
    }).finally(() => {
      setUser(null);
      setTasks([]);
      navigate('/login');
    });
  };

  const handleDeregisterWorldID = () => {
    const confirmed = window.confirm('Deregister World ID from this account? You will need to verify again before accepting work.');
    if (!confirmed) return;

    setIdentityMessage('');
    setIdentityError('');
    apiFetch('/api/world/registration', {
      method: 'DELETE',
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setIdentityError(data.error || 'Could not deregister World ID');
          return;
        }
        setUser(current => current ? { ...current, world_id_verified: false } : current);
        setIdentityMessage(data.message || 'World ID deregistered');
      })
      .catch(() => setIdentityError('Could not deregister World ID'));
  };

  if (!user) {
    return <main className="shell"><p className="empty-state">Loading dashboard...</p></main>;
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{isContractor && !isWorker ? 'Requester console' : isWorker && !isContractor ? 'Worker console' : 'Account console'}</p>
          <h1>{isContractor && !isWorker ? 'Requester' : isWorker && !isContractor ? 'Worker' : 'Dashboard'}</h1>
        </div>
        <nav className="nav-actions" aria-label="Dashboard">
          {user.is_admin && <Link className="ghost-link" to="/admin">Admin</Link>}
          <Link className="ghost-link" to="/tasks">Task queue</Link>
          {isWorker && <Link className="ghost-link" to="/verify">World ID</Link>}
          <button className="secondary-button" type="button" onClick={handleLogout}>Logout</button>
        </nav>
      </header>

      <section className="panel identity-panel">
        <div>
          <p className="eyebrow">Signed in as</p>
          <h2>{user.username}</h2>
          <div className="profile-tags">
            {(user.account_modes || []).map(mode => (
              <span key={mode}>{mode === 'worker' ? 'Looking for work' : 'Posting work'}</span>
            ))}
            {(user.task_topics || []).map(topic => (
              <span key={topic}>{topic}</span>
            ))}
          </div>
          {identityMessage && <p className="notice success">{identityMessage}</p>}
          {identityError && <p className="notice error">{identityError}</p>}
        </div>
        <div className="identity-actions">
          <span className={`status-pill ${user.world_id_verified ? 'completed' : 'open'}`}>
            {user.world_id_verified ? 'World ID verified' : 'World ID pending'}
          </span>
          {user.world_id_verified && (
            <button className="secondary-button danger-button" type="button" onClick={handleDeregisterWorldID}>
              Deregister World ID
            </button>
          )}
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
        {isWorker && (
          <>
            <div className="metric">
              <span>Balance</span>
              <strong>${earned.toFixed(2)}</strong>
            </div>
            <div className="metric">
              <span>Active</span>
              <strong>{activeTasks.length}</strong>
            </div>
          </>
        )}
        {isContractor && (
          <>
            <div className="metric">
              <span>Posted</span>
              <strong>{postedTasks.length}</strong>
            </div>
            <div className="metric">
              <span>Open</span>
              <strong>{openPostedTasks.length}</strong>
            </div>
          </>
        )}
      </section>

      {isWorker && !user.world_id_verified && (
        <section className="panel callout-panel">
          <div>
            <h2>Verify once to accept work</h2>
            <p>Open tasks require World ID verification before assignment.</p>
          </div>
          <Link className="primary-button link-button" to="/verify">Verify with World ID</Link>
        </section>
      )}

      {isContractor && (
        <section className="panel callout-panel">
          <div>
            <h2>Turn a messy request into reviewed tasks</h2>
            <p>Use the Fetch.ai agent draft flow first, then post only the tasks you approve.</p>
          </div>
          <Link className="primary-button link-button" to="/tasks">Open agent</Link>
        </section>
      )}

      {isWorker && (
        <section className="panel">
        <div className="panel-header split">
          <div>
            <h2>Your tasks</h2>
          </div>
          {!isHybrid && <Link className="secondary-button link-button" to="/tasks">Find work</Link>}
        </div>

        {assignedTasks.length === 0 ? (
          <p className="empty-state">No assigned tasks yet.</p>
        ) : (
          <div className="task-stack">
            {assignedTasks.map(task => (
              <Link className="task-row" to={`/task/${task.id}`} key={task.id}>
                <div>
                  <span className={`status-pill ${task.status}`}>{task.status}</span>
                  <h3>{task.description}</h3>
                  <p>{task.created_by ? `Requested by ${task.created_by}` : 'Marketplace request'}</p>
                </div>
                <strong>${Number(task.compensation || 0).toFixed(2)}</strong>
              </Link>
            ))}
          </div>
        )}
        </section>
      )}

      {isContractor && (
        <section className="panel">
          <div className="panel-header split">
            <div>
              <h2>Your dispatches</h2>
            </div>
          </div>

          {postedTasks.length === 0 ? (
            <p className="empty-state">No posted tasks yet.</p>
          ) : (
            <div className="task-stack">
              {postedTasks.map(task => (
                <Link className="task-row" to={`/task/${task.id}`} key={task.id}>
                  <div>
                    <span className={`status-pill ${task.status}`}>{task.status}</span>
                    <h3>{task.description}</h3>
                    <p>{task.assigned_user ? `Assigned to ${task.assigned_user}` : 'Waiting for worker'}</p>
                  </div>
                  <strong>${Number(task.compensation || 0).toFixed(2)}</strong>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default Dashboard;
