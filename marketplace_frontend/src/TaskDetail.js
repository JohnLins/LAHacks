import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './App.css';

function TaskDetail() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`/api/tasks/`)
      .then(res => res.json())
      .then(tasks => {
        const t = tasks.find(task => String(task.id) === id);
        setTask(t);
      });
  }, [id]);

  const acceptTask = () => {
    fetch(`/api/tasks/${id}/accept`, { method: 'POST', credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error);
        else navigate('/dashboard');
      });
  };

  const completeTask = () => {
    fetch(`/api/tasks/${id}/complete`, { method: 'POST', credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error);
        else navigate('/dashboard');
      });
  };

  if (!task) return <div className="app-container center">Loading...</div>;

  return (
    <div className="app-container center">
      <h2>Task Detail</h2>
      <div className="card">
        <p style={{fontSize: '1.2rem'}}>{task.description}</p>
        <p>Status: <span style={{color: '#00ffe7'}}>{task.status}</span></p>
        <p>Compensation: <span style={{color: '#ffe066'}}>${task.compensation}</span></p>
      </div>
      {error && <p style={{color: '#ff61a6'}}>{error}</p>}
      {task.status === 'open' && <button onClick={acceptTask}>Accept Task</button>}
      {task.status === 'accepted' && <button onClick={completeTask}>Complete Task</button>}
      <button onClick={() => navigate(-1)}>Back</button>
    </div>
  );
}

export default TaskDetail;
