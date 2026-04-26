import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
import './App.css';

const statusLabels = {
  all: 'All',
  open: 'Open',
  accepted: 'In flight',
  completed: 'Paid',
};

function TaskList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [statusFilter, setStatusFilter] = useState('open');
  const [description, setDescription] = useState('');
  const [compensation, setCompensation] = useState('10');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentTasks, setAgentTasks] = useState([]);
  const [agentMessage, setAgentMessage] = useState('');
  const [agentError, setAgentError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentPosting, setAgentPosting] = useState(false);

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
        setUser(currentUser);
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
      { total: 0, open: 0, accepted: 0, completed: 0, value: 0 }
    );
  }, [tasks]);

  const filteredTasks = tasks.filter(task => (
    statusFilter === 'all' ? true : task.status === statusFilter
  ));
  const modes = user?.account_modes || [];
  const isWorker = modes.includes('worker');
  const isContractor = modes.includes('contractor');
  const canPost = user?.is_admin || isContractor;
  const isLoadingUser = loading && !user;
  const pageMode = canPost ? 'requester' : isWorker ? 'worker' : 'loading';
  const heading = pageMode === 'requester' ? 'Agent Dispatch' : pageMode === 'worker' ? 'Find Work' : 'Loading Queue';
  const eyebrow = pageMode === 'requester' ? 'Requester dispatch' : pageMode === 'worker' ? 'Worker queue' : 'Marketplace';

  const createTask = event => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);

    apiFetch('/api/tasks/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        compensation: Number(compensation || 0),
      }),
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not post task.');
        return data;
      })
      .then(() => {
        setDescription('');
        setCompensation('10');
        setMessage('Task posted to the open queue.');
        loadTasks();
      })
      .catch(err => setError(err.message))
      .finally(() => setSaving(false));
  };

  const extractAgentTasks = event => {
    event.preventDefault();
    setAgentError('');
    setAgentMessage('');
    setAgentLoading(true);

    apiFetch('/api/agent/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: agentPrompt }),
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not extract tasks.');
        return data;
      })
      .then(data => {
        setAgentTasks(data.tasks || []);
        setAgentMessage((data.tasks || []).length ? 'Agent draft ready. Review before posting.' : 'No tasks extracted.');
      })
      .catch(err => setAgentError(err.message))
      .finally(() => setAgentLoading(false));
  };

  const updateAgentTask = (index, field, value) => {
    setAgentTasks(current => current.map((task, taskIndex) => (
      taskIndex === index ? { ...task, [field]: value } : task
    )));
  };

  const removeAgentTask = index => {
    setAgentTasks(current => current.filter((_, taskIndex) => taskIndex !== index));
  };

  const postAgentTasks = () => {
    setAgentError('');
    setAgentMessage('');
    setAgentPosting(true);

    apiFetch('/api/agent/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: agentTasks }),
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not post agent tasks.');
        return data;
      })
      .then(data => {
        setAgentMessage(data.message || 'Agent tasks posted.');
        setAgentTasks([]);
        setAgentPrompt('');
        loadTasks();
      })
      .catch(err => setAgentError(err.message))
      .finally(() => setAgentPosting(false));
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{heading}</h1>
        </div>
        <nav className="nav-actions" aria-label="Primary">
          <Link className="ghost-link" to="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <section className="metrics-grid" aria-label="Marketplace metrics">
        <div className="metric">
          <span>Open</span>
          <strong>{stats.open || 0}</strong>
        </div>
        <div className="metric">
          <span>In flight</span>
          <strong>{stats.accepted || 0}</strong>
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

      <section className={`workspace-grid ${canPost ? 'requester-workspace' : 'worker-workspace'}`}>
        {canPost && (
        <div className="form-stack">
          <form className="panel agent-panel featured-agent-panel" onSubmit={extractAgentTasks}>
            <div className="panel-header">
              <h2>Paste messy work. Review clean tasks.</h2>
              <p className="helper-text">
                This mirrors the Agentverse flow: the same extractor turns a freeform request into priced human tasks before anything hits the marketplace.
              </p>
            </div>
            <label>
              Agent prompt
              <textarea
                value={agentPrompt}
                onChange={event => setAgentPrompt(event.target.value)}
                placeholder={'Example:\nAsk someone near the sponsor tables to count empty chairs $6\nCheck whether the demo booth sign is visible in photos usd 8'}
                rows="7"
              />
            </label>
            <button className="primary-button" type="submit" disabled={agentLoading}>
              {agentLoading ? 'Extracting...' : 'Preview agent tasks'}
            </button>

            {agentTasks.length > 0 && (
              <div className="agent-drafts">
                <div className="agent-draft-summary">
                  <span>{agentTasks.length} draft{agentTasks.length === 1 ? '' : 's'}</span>
                  <strong>${agentTasks.reduce((sum, task) => sum + Number(task.compensation || 0), 0).toFixed(2)}</strong>
                </div>
                {agentTasks.map((task, index) => (
                  <div className="agent-draft-row" key={`${task.description}-${index}`}>
                    <label>
                      Description
                      <textarea
                        value={task.description}
                        onChange={event => updateAgentTask(index, 'description', event.target.value)}
                        rows="2"
                      />
                    </label>
                    <label>
                      Price
                      <div className="money-input">
                        <span>$</span>
                        <input
                          value={task.compensation}
                          onChange={event => updateAgentTask(index, 'compensation', event.target.value)}
                          min="0"
                          step="0.01"
                          type="number"
                        />
                      </div>
                    </label>
                    <button className="secondary-button" type="button" onClick={() => removeAgentTask(index)}>
                      Remove
                    </button>
                  </div>
                ))}
                <button className="primary-button" type="button" onClick={postAgentTasks} disabled={agentPosting}>
                  {agentPosting ? 'Posting...' : `Post ${agentTasks.length} reviewed task${agentTasks.length === 1 ? '' : 's'}`}
                </button>
              </div>
            )}
            {agentMessage && <p className="notice success">{agentMessage}</p>}
            {agentError && <p className="notice error">{agentError}</p>}
          </form>

          <form className="panel task-form compact-task-form" onSubmit={createTask}>
            <div className="panel-header split">
              <div>
                <h2>Post one task</h2>
              </div>
            </div>
            <label>
              Task brief
              <textarea
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder="Review five product photos and mark which one has the clearest label."
                rows="5"
              />
            </label>
            <label>
              Compensation
              <div className="money-input">
                <span>$</span>
                <input
                  value={compensation}
                  onChange={event => setCompensation(event.target.value)}
                  min="0"
                  step="0.01"
                  type="number"
                />
              </div>
            </label>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Posting...' : 'Post task'}
            </button>
            {message && <p className="notice success">{message}</p>}
            {error && <p className="notice error">{error}</p>}
          </form>
        </div>
        )}

        <section className="panel queue-panel" id="task-queue">
          <div className="panel-header split">
            <div>
              <p className="eyebrow">Live queue</p>
              <h2>{canPost ? 'Marketplace queue' : 'Available work'}</h2>
            </div>
            <button className="secondary-button" type="button" onClick={loadTasks}>Refresh</button>
          </div>

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
                    <span className={`status-pill ${task.status}`}>{statusLabels[task.status]}</span>
                    <h3>{task.description}</h3>
                    <p>
                      {task.assigned_user ? `Assigned to ${task.assigned_user}` : 'Unassigned'}
                      {task.created_by ? ` · Posted by ${task.created_by}` : ''}
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
