import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './App.css';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
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
        return fetch('/api/tasks/')
          .then(res => res.json())
          .then(allTasks => setTasks(allTasks.filter(t => t.assigned_user === currentUser.username)));
      });
  }, [navigate]);

  if (!user) return <div className="app-container center">Loading...</div>;

  return (
    <div className="app-container center">
      <h1>Dashboard</h1>
      <div className="card">
        <p><b>Username:</b> {user.username}</p>
        <p><b>World ID Verified:</b> <span style={{color: user.world_id_verified ? '#00ffe7' : '#ff61a6'}}>{user.world_id_verified ? 'Yes' : 'No'}</span></p>
        <p><b>Fake Balance:</b> <span style={{color: '#ffe066'}}>${user.fake_balance}</span></p>
      </div>
      {!user.world_id_verified && <Link to="/verify"><button>Verify with World ID</button></Link>}
      <h2>Your Tasks</h2>
      <ul>
        {tasks.map(task => (
          <li key={task.id} className="card">{task.description} <span style={{color: '#00ffe7'}}>- {task.status}</span></li>
        ))}
      </ul>
      <Link to="/"><button>Back to Tasks</button></Link>
    </div>
  );
}

export default Dashboard;
