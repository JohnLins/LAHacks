import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from './api';
import './App.css';

const statusLabels = {
  open: 'Open',
  accepted: 'In flight',
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

const messageSourceLabel = message => {
  if (message.source === 'user') return 'User';
  if (message.source === 'world_agent') return 'World AgentKit';
  if (message.sender_agent_world_verified) return 'World verified Agentverse';
  return 'Agentverse';
};

const messageClassName = (message, mine) => {
  const classes = ['message-card'];
  if (mine) classes.push('mine');
  if (message.source !== 'user') classes.push('agent-message');
  if (message.sender_agent_world_verified || message.source === 'world_agent') classes.push('verified-agent-message');
  return classes.join(' ');
};

function TaskDetail() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [agents, setAgents] = useState([]);
  const [messageBody, setMessageBody] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentAddress, setAgentAddress] = useState('');
  const [agentInstructions, setAgentInstructions] = useState('');
  const [agentAutomated, setAgentAutomated] = useState(false);
  const [error, setError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [agentError, setAgentError] = useState('');
  const [threadMessage, setThreadMessage] = useState('');
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
        setUser(currentUser);
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

  const loadMessages = () => {
    setThreadError('');
    apiFetch(`/api/tasks/${id}/messages`)
      .then(async res => {
        const data = await parseJsonResponse(res);
        if (!res.ok) throw new Error(data.error || 'Could not load messages.');
        return data;
      })
      .then(data => setMessages(Array.isArray(data) ? data : []))
      .catch(err => setThreadError(err.message));
  };

  const loadAgents = () => {
    setAgentError('');
    apiFetch(`/api/tasks/${id}/agents`)
      .then(async res => {
        const data = await parseJsonResponse(res);
        if (!res.ok) throw new Error(data.error || 'Could not load task agents.');
        return data;
      })
      .then(data => setAgents(Array.isArray(data) ? data : []))
      .catch(err => setAgentError(err.message));
  };

  useEffect(() => {
    loadTask();
  }, [id]);

  useEffect(() => {
    if (!task || task === false || !user) return;

    const isRequester = task.created_by === user.username || user.is_admin;
    const isParticipant = isRequester || task.assigned_user === user.username;
    if (isParticipant && ['accepted', 'completed'].includes(task.status)) {
      loadMessages();
    } else {
      setMessages([]);
    }

    if (isParticipant) {
      loadAgents();
    } else {
      setAgents([]);
    }
  }, [task, user, id]);


  const runAction = action => {
    setError('');
    setBusy(action);
    apiFetch(`/api/tasks/${id}/${action}`, { method: 'POST' })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Could not ${action} task.`);
        return data;
      })
      .then(() => {
        if (action === 'accept') {
          loadTask();
        } else {
          navigate('/dashboard');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setBusy(''));
  };

  const sendMessage = event => {
    event.preventDefault();
    setThreadError('');
    setThreadMessage('');
    setBusy('message');

    apiFetch(`/api/tasks/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: messageBody }),
    })
      .then(async res => {
        const data = await parseJsonResponse(res);
        if (!res.ok) throw new Error(data.error || 'Could not send message.');
        return data;
      })
      .then(data => {
        setMessageBody('');
        setMessages(current => [...current, data.task_message]);
      })
      .catch(err => setThreadError(err.message))
      .finally(() => setBusy(''));
  };

  const saveAgent = event => {
    event.preventDefault();
    setAgentError('');
    setBusy('agent');

    apiFetch(`/api/tasks/${id}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: agentName,
        address: agentAddress,
        instructions: agentInstructions,
        automated_responses: agentAutomated,
      }),
    })
      .then(async res => {
        const data = await parseJsonResponse(res);
        if (!res.ok) throw new Error(data.error || 'Could not save task agent.');
        return data;
      })
      .then(data => {
        setAgentName('');
        setAgentAddress('');
        setAgentInstructions('');
        setAgentAutomated(false);
        setAgents(current => {
          const withoutExisting = current.filter(agent => agent.id !== data.agent.id);
          return [...withoutExisting, data.agent];
        });
      })
      .catch(err => setAgentError(err.message))
      .finally(() => setBusy(''));
  };

  const editAgent = agent => {
    setAgentName(agent.name);
    setAgentAddress(agent.address);
    setAgentInstructions(agent.instructions || '');
    setAgentAutomated(Boolean(agent.automated_responses));
  };

  const devVerifyAgent = agentId => {
    setAgentError('');
    setBusy(`dev-verify-${agentId}`);

    apiFetch(`/api/tasks/${id}/agents/${agentId}/dev-verify`, {
      method: 'POST',
    })
      .then(async res => {
        const data = await parseJsonResponse(res);
        if (!res.ok) throw new Error(data.error || 'Could not mark task agent as verified.');
        return data;
      })
      .then(data => {
        setAgents(current => current.map(agent => agent.id === data.agent.id ? data.agent : agent));
      })
      .catch(err => setAgentError(err.message))
      .finally(() => setBusy(''));
  };

  const removeAgent = agentId => {
    setAgentError('');
    setBusy(`agent-${agentId}`);

    apiFetch(`/api/tasks/${id}/agents/${agentId}`, {
      method: 'DELETE',
    })
      .then(async res => {
        const data = await parseJsonResponse(res);
        if (!res.ok) throw new Error(data.error || 'Could not remove task agent.');
        return data;
      })
      .then(() => setAgents(current => current.filter(agent => agent.id !== agentId)))
      .catch(err => setAgentError(err.message))
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

  const modes = user?.account_modes || [];
  const isWorker = modes.includes('worker');
  const isAssignedWorker = task.assigned_user === user?.username;
  const isRequester = task.created_by === user?.username || user?.is_admin;
  const canUseThread = ['accepted', 'completed'].includes(task.status) && (isRequester || isAssignedWorker || user?.is_admin);
  const canManageAgents = isRequester;

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
            <dt>Requester</dt>
            <dd>{task.created_by || 'Marketplace'}</dd>
          </div>
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
          {task.status === 'open' && isWorker && (
            <button
              className="primary-button"
              type="button"
              onClick={() => runAction('accept')}
              disabled={busy === 'accept'}
            >
              {busy === 'accept' ? 'Accepting...' : 'Accept task'}
            </button>
          )}
          {task.status === 'open' && !isWorker && (
            <p className="notice">Worker account required to accept tasks.</p>
          )}
          {task.status === 'accepted' && isAssignedWorker && (
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

      {canUseThread ? (
        <section className="panel thread-panel">
          <div className="panel-header split">
            <div>
              <h2>Conversation</h2>
              <p className="helper-text">Requester, worker, and configured task agents can coordinate here.</p>
            </div>
            <button className="secondary-button" type="button" onClick={loadMessages}>Refresh</button>
          </div>

          <div className="message-stack">
            {messages.length === 0 ? (
              <p className="empty-state">No messages yet.</p>
            ) : (
              messages.map(message => {
                const mine = message.sender_user === user?.username;
                return (
                  <article className={messageClassName(message, mine)} key={message.id}>
                    <div className="message-meta">
                      <strong>{message.sender}</strong>
                      <span>{messageSourceLabel(message)}</span>
                    </div>
                    <p>{message.body}</p>
                  </article>
                );
              })
            )}
          </div>

          <form className="message-form" onSubmit={sendMessage}>
            <label>
              Message
              <textarea
                value={messageBody}
                onChange={event => setMessageBody(event.target.value)}
                placeholder="Ask for timing, clarify the task, or share a status update."
                rows="3"
              />
            </label>
            <button className="primary-button" type="submit" disabled={busy === 'message'}>
              {busy === 'message' ? 'Sending...' : 'Send message'}
            </button>
          </form>
          {threadMessage && <p className="notice success">{threadMessage}</p>}
          {threadError && <p className="notice error">{threadError}</p>}
        </section>
      ) : (
        <section className="panel">
          <h2>Conversation unlocks after acceptance</h2>
          <p className="helper-text">Once a verified worker accepts the task, the requester, worker, and configured agents can message here.</p>
        </section>
      )}

      {canManageAgents && (
        <section className="panel agent-manager-panel">
          <div className="panel-header">
            <h2>Task agents</h2>
            <p className="helper-text">
              Use the same Agentverse agent for every task. Change only its requester prompt and whether it should auto-reply after World AgentKit verification.
            </p>
          </div>

          <form className="agent-config-form" onSubmit={saveAgent}>
            <label>
              Agent name
              <input
                value={agentName}
                onChange={event => setAgentName(event.target.value)}
                placeholder="Requester task agent"
              />
            </label>
            <label>
              Agent address
              <input
                value={agentAddress}
                onChange={event => setAgentAddress(event.target.value)}
                placeholder="agent1... or 0x..."
              />
            </label>
            <label className="agent-instructions-field">
              Requester prompt
              <textarea
                value={agentInstructions}
                onChange={event => setAgentInstructions(event.target.value)}
                placeholder="Reply as the requester. Clarify timing, ask for missing details, and keep payment changes for the requester to approve."
                rows="4"
              />
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={agentAutomated}
                onChange={event => setAgentAutomated(event.target.checked)}
              />
              <span>Automatically reply to contractor messages</span>
            </label>
            <button className="primary-button" type="submit" disabled={busy === 'agent'}>
              {busy === 'agent' ? 'Saving...' : 'Save task agent'}
            </button>
          </form>
          <p className="helper-text">
            Automation can only be enabled after this Agentverse address is verified through the World AgentKit gateway.
          </p>

          {agents.length === 0 ? (
            <p className="empty-state">No task agents configured.</p>
          ) : (
            <div className="agent-card-stack">
              {agents.map(agent => (
                <article className="agent-card" key={agent.id}>
                  <div>
                    <h3>{agent.name}</h3>
                    <p>{agent.address}</p>
                    {agent.instructions && <p className="agent-instructions">{agent.instructions}</p>}
                    <div className="profile-tags">
                      <span>{agent.world_verified ? 'World verified' : 'Not World verified'}</span>
                      <span>{agent.automated_responses ? 'Auto replies on' : 'Auto replies off'}</span>
                      {agent.verification_source === 'dev_agentkit_mock' && <span>Dev AgentKit mock</span>}
                      {agent.capabilities.map(capability => <span key={capability}>{capability.replace('_', ' ')}</span>)}
                    </div>
                  </div>
                  <div className="agent-card-actions">
                    {!agent.world_verified && agent.dev_verification_available && (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => devVerifyAgent(agent.id)}
                        disabled={busy === `dev-verify-${agent.id}`}
                      >
                        Mock World verify
                      </button>
                    )}
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => editAgent(agent)}
                    >
                      Edit
                    </button>
                    <button
                      className="secondary-button danger-button"
                      type="button"
                      onClick={() => removeAgent(agent.id)}
                      disabled={busy === `agent-${agent.id}`}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {agentError && <p className="notice error">{agentError}</p>}
        </section>
      )}
    </main>
  );
}

export default TaskDetail;
