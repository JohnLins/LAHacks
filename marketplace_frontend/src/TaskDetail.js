import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from './api';
import './App.css';

const statusLabels = {
  open: 'Open',
  accepted: 'In flight',
  completed: 'Paid',
};

function TaskDetail() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const navigate = useNavigate();

  const loadTask = () => {
    apiFetch('/api/tasks/')
      .then(res => {
        if (res.status === 401) {
          navigate('/login');
          return null;
        }
        return res.json();
      })
      .then(tasks => {
        if (!tasks) return;
        const selectedTask = tasks.find(candidate => String(candidate.id) === id);
        setTask(selectedTask || false);
      })
      .catch(() => setError('Could not load task.'));
  };

  useEffect(() => {
    loadTask();
  }, [id]);

  const runAction = action => {
    setError('');
    setBusy(action);
    apiFetch(`/api/tasks/${id}/${action}`, { method: 'POST' })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Could not ${action} task.`);
        return data;
      })
      .then(() => navigate('/dashboard'))
      .catch(err => setError(err.message))
      .finally(() => setBusy(''));
  };

  if (task === null) {
    return <main className="shell"><p className="empty-state">Loading task...</p></main>;
  }

  if (task === false) {
    return (
      <main className="shell narrow-shell">
        <section className="panel">
          <p className="eyebrow">Missing task</p>
          <h1>Task not found</h1>
          <Link className="primary-button link-button" to="/tasks">Back to queue</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="shell narrow-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Task #{task.id}</p>
          <h1>Task Detail</h1>
        </div>
        <Link className="ghost-link" to="/tasks">Back to queue</Link>
      </header>

      <section className="panel detail-panel">
        <div className="detail-meta">
          <span className={`status-pill ${task.status}`}>{statusLabels[task.status]}</span>
          <strong>${Number(task.compensation || 0).toFixed(2)}</strong>
        </div>
        <p className="task-brief">{task.description}</p>
        <dl className="detail-list">
          <div>
            <dt>Assignee</dt>
            <dd>{task.assigned_user || 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Requirement</dt>
            <dd>World ID verified worker</dd>
          </div>
        </dl>

        {error && <p className="notice error">{error}</p>}
        {error === 'World ID verification required' && (
          <Link className="secondary-button link-button" to="/verify">Verify with World ID</Link>
        )}

        <div className="button-row">
          {task.status === 'open' && (
            <button
              className="primary-button"
              type="button"
              onClick={() => runAction('accept')}
              disabled={busy === 'accept'}
            >
              {busy === 'accept' ? 'Accepting...' : 'Accept task'}
            </button>
          )}
          {task.status === 'accepted' && (
            <button
              className="primary-button"
              type="button"
              onClick={() => runAction('complete')}
              disabled={busy === 'complete'}
            >
              {busy === 'complete' ? 'Completing...' : 'Mark complete'}
            </button>
          )}
          <button className="secondary-button" type="button" onClick={() => navigate(-1)}>Back</button>
        </div>
      </section>
    </main>
  );
}

export default TaskDetail;
