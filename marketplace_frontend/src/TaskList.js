import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './App.css';

function TaskList() {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    fetch('/api/tasks/')
      .then(res => res.json())
      .then(setTasks);
  }, []);

  return (
    <div className="app-container center">
      <h1>Open Tasks</h1>
      <ul>
        {tasks.map(task => (
          <li key={task.id} className="card">
            <Link to={`/task/${task.id}`}>{task.description}</Link>
            <div style={{marginTop: 8}}><span style={{color: '#00ffe7'}}>{task.status}</span></div>
          </li>
        ))}
      </ul>
      <Link to="/dashboard"><button>Go to Dashboard</button></Link>
    </div>
  );
}

export default TaskList;
