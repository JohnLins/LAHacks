import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WorldIDButton } from './world-id';
import './App.css';

function WorldVerify() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleVerify = (data) => {
    if (data && data.message) {
      setMessage(data.message);
      setTimeout(() => navigate('/dashboard'), 1000);
    }
  };

  return (
    <div className="app-container center">
      <h2>World ID Verification</h2>
      <div className="card">
        <p>Verify with World ID before accepting marketplace tasks.</p>
        <WorldIDButton onVerify={handleVerify} onError={setError} />
      </div>
      {message && <p style={{color: '#00ffe7'}}>{message}</p>}
      {error && <p style={{color: '#ff61a6'}}>{error}</p>}
      <Link to="/dashboard"><button>Back to Dashboard</button></Link>
    </div>
  );
}

export default WorldVerify;
