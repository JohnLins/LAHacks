import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from './api';
import { mergeUserResponse } from './userProfile';
import './App.css';

const statusLabels = {
  open: 'Open',
  claimed: 'In flight',
  accepted: 'In flight',
  submitted: 'Submitted',
  completed: 'Paid',
};

const parseJsonResponse = async res => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: res.ok ? 'Unexpected response from server' : 'Server returned a non-JSON error' };
  }
};

function TaskDetail() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [user, setUser] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const navigate = useNavigate();

  const loadTask = () => {
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

  const claimTask = () => {
    setError('');
    setMessage('');
    setBusy('claim');
    apiFetch(`/api/tasks/${id}/claim`, { method: 'POST' })
      .then(async res => {
        const data = await parseJsonResponse(res);
        if (!res.ok) throw new Error(data.error || 'Could not claim task.');
        return data;
      })
      .then(data => {
        setMessage(data.message || 'Task claimed.');
        loadTask();
      })
      .catch(err => setError(err.message))
      .finally(() => setBusy(''));
  };

  const submitTask = event => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy('submit');
    apiFetch(`/api/tasks/${id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response_text: responseText }),
    })
      .then(async res => {
        const data = await parseJsonResponse(res);
        if (!res.ok) throw new Error(data.error || 'Could not submit task response.');
        return data;
      })
      .then(data => {
        setResponseText('');
        setMessage(data.message || 'Task submitted.');
        loadTask();
      })
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

  const isAssignedWorker = task.assigned_user === user?.username;
  const canSubmit = ['claimed', 'accepted'].includes(task.status) && isAssignedWorker;
  const hasSubmittedResponse = ['submitted', 'completed'].includes(task.status) && task.response_text;

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
          <span className={`status-pill ${task.status}`}>{statusLabels[task.status] || task.status}</span>
          <strong>${Number(task.compensation || 0).toFixed(2)}</strong>
        </div>
        <p className="task-brief">{task.description}</p>
        <dl className="detail-list">
          <div>
            <dt>Source</dt>
            <dd>Human Agent work queue</dd>
          </div>
          <div>
            <dt>Assignee</dt>
            <dd>{task.assigned_user || 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Requirement</dt>
            <dd>World ID verified human agent</dd>
          </div>
        </dl>

        {error && <p className="notice error">{error}</p>}
        {message && <p className="notice success">{message}</p>}
        {error === 'World ID verification required' && (
          <Link className="secondary-button link-button" to="/verify">Verify with World ID</Link>
        )}

        <div className="button-row">
          {task.status === 'open' && (
            <button
              className="primary-button"
              type="button"
              onClick={claimTask}
              disabled={busy === 'claim'}
            >
              {busy === 'claim' ? 'Claiming...' : 'Claim task'}
            </button>
          )}
          <button className="secondary-button" type="button" onClick={() => navigate(-1)}>Back</button>
        </div>
      </section>

      {canSubmit && (
        <section className="panel completion-panel">
          <div className="panel-header">
            <h2>Submit your response</h2>
            <p className="helper-text">Send the result back through Human Agent. This moves the task into the submitted lane.</p>
          </div>
          <form onSubmit={submitTask}>
            <label>
              Response
              <textarea
                value={responseText}
                onChange={event => setResponseText(event.target.value)}
                placeholder="Done. Here is the result..."
                rows="5"
              />
            </label>
            <button className="primary-button" type="submit" disabled={busy === 'submit'}>
              {busy === 'submit' ? 'Submitting...' : 'Submit response'}
            </button>
          </form>
        </section>
      )}

      {hasSubmittedResponse && (
        <section className="panel completion-panel">
          <p className="eyebrow">Submitted response</p>
          <p className="task-note">{task.response_text}</p>
        </section>
      )}

      {!canSubmit && !hasSubmittedResponse && (
        <section className="panel">
          <h2>Next step</h2>
          <p className="helper-text">
            {task.status === 'open'
              ? 'A World ID verified human agent can claim this task.'
              : 'The assigned human agent can submit a response here.'}
          </p>
        </section>
      )}
    </main>
  );
}

export default TaskDetail;
