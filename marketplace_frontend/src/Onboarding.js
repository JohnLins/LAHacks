import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WorldIDButton } from './world-id';
import { apiFetch } from './api';
import './App.css';

const modeOptions = [
  { id: 'worker', label: 'Looking for work', detail: 'Accept tasks after identity verification.' },
  { id: 'contractor', label: 'Posting work', detail: 'Create tasks and dispatch them to verified workers.' },
];

const topicOptions = [
  'research',
  'data entry',
  'design review',
  'local errands',
  'phone calls',
  'writing',
  'testing',
  'event support',
];

function Onboarding() {
  const [step, setStep] = useState(0);
  const [user, setUser] = useState(null);
  const [modes, setModes] = useState([]);
  const [topics, setTopics] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
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
      .then(data => {
        if (!data) return;
        setUser(data);
        setModes(data.account_modes || []);
        setTopics(data.task_topics || []);
      });
  }, [navigate]);

  const progress = useMemo(() => ((step + 1) / 3) * 100, [step]);

  const toggleMode = mode => {
    setModes(current => (
      current.includes(mode)
        ? current.filter(item => item !== mode)
        : [...current, mode]
    ));
  };

  const toggleTopic = topic => {
    setTopics(current => (
      current.includes(topic)
        ? current.filter(item => item !== topic)
        : [...current, topic]
    ));
  };

  const saveProfile = completed => {
    setError('');
    setMessage('');
    return apiFetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_modes: modes,
        task_topics: topics,
        onboarding_completed: completed,
      }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || 'Could not save onboarding');
          return false;
        }
        setUser(data.user);
        return true;
      })
      .catch(() => {
        setError('Could not save onboarding');
        return false;
      });
  };

  const next = async () => {
    if (step === 0 && modes.length === 0) {
      setError('Select at least one way you will use the marketplace.');
      return;
    }
    if (step === 1 && topics.length === 0) {
      setError('Select at least one task topic.');
      return;
    }
    setError('');
    if (step === 1) {
      const saved = await saveProfile(false);
      if (!saved) return;
    }
    setStep(current => Math.min(current + 1, 2));
  };

  const finish = async () => {
    const saved = await saveProfile(true);
    if (saved) navigate('/dashboard');
  };

  const handleVerify = data => {
    if (data && data.message) {
      setUser(current => current ? { ...current, world_id_verified: true } : current);
      setMessage('World ID connected.');
    }
  };

  if (!user) {
    return <main className="shell narrow-shell"><p className="empty-state">Loading setup...</p></main>;
  }

  return (
    <main className="shell narrow-shell onboarding-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Account setup</p>
          <h1>Onboarding</h1>
        </div>
        <Link className="ghost-link" to="/dashboard">Skip to app</Link>
      </header>

      <section className="panel onboarding-panel">
        <div className="progress-track" aria-label="Onboarding progress">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="step-list">
          {['Role', 'Topics', 'World ID'].map((label, index) => (
            <button
              key={label}
              type="button"
              className={index === step ? 'active' : ''}
              onClick={() => setStep(index)}
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>

        <div className="onboarding-viewport">
          {step === 0 && (
            <section className="onboarding-step active-step" key="role">
              <p className="eyebrow">Step 1</p>
              <h2>How will you use the marketplace?</h2>
              <div className="option-grid">
                {modeOptions.map(option => (
                  <button
                    className={`choice-card ${modes.includes(option.id) ? 'selected' : ''}`}
                    key={option.id}
                    type="button"
                    onClick={() => toggleMode(option.id)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.detail}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="onboarding-step active-step" key="topics">
              <p className="eyebrow">Step 2</p>
              <h2>Pick task topics you care about.</h2>
              <div className="topic-cloud">
                {topicOptions.map(topic => (
                  <button
                    className={topics.includes(topic) ? 'selected' : ''}
                    key={topic}
                    type="button"
                    onClick={() => toggleTopic(topic)}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="onboarding-step active-step" key="world">
              <p className="eyebrow">Step 3</p>
              <h2>World ID unlocks worker actions.</h2>
              <p className="helper-text">
                Verify now if you want to accept tasks. Contractors can skip and post work immediately.
              </p>
              {user.world_id_verified ? (
                <p className="notice success">World ID connected for {user.username}.</p>
              ) : (
                <div className="action-row">
                  <WorldIDButton onVerify={handleVerify} onError={setError} />
                  <button className="secondary-button" type="button" onClick={finish}>Skip for now</button>
                </div>
              )}
            </section>
          )}
        </div>

        {message && <p className="notice success">{message}</p>}
        {error && <p className="notice error">{error}</p>}

        <div className="button-row onboarding-controls">
          <button className="secondary-button" type="button" onClick={() => setStep(current => Math.max(current - 1, 0))} disabled={step === 0}>
            Back
          </button>
          {step < 2 ? (
            <button className="primary-button" type="button" onClick={next}>Continue</button>
          ) : (
            <button className="primary-button" type="button" onClick={finish}>Finish setup</button>
          )}
        </div>
      </section>
    </main>
  );
}

export default Onboarding;
