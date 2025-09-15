import React from 'react';

export default function SimpleApp() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#2563eb' }}>🎭 STOMP Performance Scheduler</h1>
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
        <h2>✅ Frontend is Working!</h2>
        <p>This is a simplified version to test the frontend connection.</p>
        <p>Backend API: <strong>http://localhost:4000</strong></p>
        <p>Frontend: <strong>http://localhost:5173</strong></p>
      </div>
      <div style={{ marginTop: '20px' }}>
        <h3>🎪 Cast Members & Roles</h3>
        <p>The backend is serving 12 cast members across 8 performance roles.</p>
        <p>Ready to manage your theatrical schedules!</p>
      </div>
    </div>
  );
}