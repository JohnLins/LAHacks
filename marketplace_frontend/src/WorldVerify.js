import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WorldIDButton } from './world-id';

function WorldVerify() {
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleVerify = (data) => {
    if (data && data.message) {
      setMessage(data.message);
      setTimeout(() => navigate('/dashboard'), 1000);
    }
  };

  return (
    <div>
      <h2>World ID Verification</h2>
      <WorldIDButton onVerify={handleVerify} />
      {message && <p>{message}</p>}
    </div>
  );
}

export default WorldVerify;
