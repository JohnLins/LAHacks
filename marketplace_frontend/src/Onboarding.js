import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WorldIDButton } from './world-id';
import { apiFetch } from './api';
import { CONTRACTOR_MODES, mergeUserResponse, setLocalProfile } from './userProfile';
import './App.css';

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
        const merged = mergeUserResponse(data);
        setUser(merged);
        setTopics(merged.task_topics || []);
      });
  }, [navigate]);

  const progress = useMemo(() => ((step + 1) / 2) * 100, [step]);

  const toggleTopic = topic => {
    setTopics(current => (
      current.includes(topic)
        ? current.filter(item => item !== topic)
        : [...current, topic]
    ));
  };

  const saveProfile = async completed => {
    setError('');
    setMessage('');
    if (!user?.username) {
      setError('Not signed in.');
      return false;
    }
    const profile = {
      account_modes: CONTRACTOR_MODES,
      task_topics: topics,
      onboarding_completed: completed,
    };
    const response = await apiFetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      setError(data.error || 'Could not save profile.');
      return false;
    }
    const savedUser = data.user || { ...user, ...profile };
    setLocalProfile(user.username, profile);
    setUser(mergeUserResponse(savedUser));
    return true;
  };

  const next = async () => {
    if (step === 0 && topics.length === 0) {
      setError('Select at least one task topic.');
      return;
    }
    setError('');
    const saved = await saveProfile(false);
    if (!saved) return;
    setStep(current => Math.min(current + 1, 1));
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
      </header>

      <section className="panel onboarding-panel">
        <div className="progress-track" aria-label="Onboarding progress">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="step-list">
          {['Work focus', 'World ID'].map((label, index) => (
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
            <section className="onboarding-step active-step" key="topics">
              <p className="eyebrow">Step 1</p>
              <h2>Pick the work you want to handle.</h2>
              <p className="helper-text">Human Agent only serves workers here. Choose the task lanes that match your skills.</p>
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

          {step === 1 && (
            <section className="onboarding-step active-step" key="world">
              <p className="eyebrow">Step 2</p>
              <h2>World ID unlocks human agent actions.</h2>
              <p className="helper-text">
                Verify now so you can claim open work. You can also finish setup and verify from the dashboard later.
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
          {step < 1 ? (
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
