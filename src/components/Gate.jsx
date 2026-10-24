import { useState } from 'react';
import { getSettings, saveSettings } from '../storage';

const DEFAULT_PASSWORD = 'admin123';
const SESSION_KEY = 'tl_auth';

export default function Gate({ children }) {
  const settings = getSettings();
  const savedPw = settings.password || DEFAULT_PASSWORD;

  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === 'yes');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  function handleLogin(e) {
    e.preventDefault();
    if (pw === savedPw) {
      sessionStorage.setItem(SESSION_KEY, 'yes');
      setAuthed(true);
    } else {
      setError('Password salah.');
      setPw('');
    }
  }

  if (authed) return children;

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-logo">
          <div className="gate-logo-mark">🎯</div>
          <span className="gate-logo-name">TrackLink</span>
        </div>
        <h1 className="gate-title">Masuk ke Dashboard</h1>
        <p className="gate-subtitle">Masukkan password untuk mengakses panel.</p>
        <form onSubmit={handleLogin}>
          <input
            className={`gate-input ${error ? 'error' : ''}`}
            type="password"
            placeholder="Password"
            value={pw}
            onChange={e => { setPw(e.target.value); setError(''); }}
            autoFocus
            autoComplete="current-password"
          />
          {error && <div className="gate-error">{error}</div>}
          <button className="gate-btn" type="submit">Masuk</button>
        </form>
        <p className="gate-hint">Default: admin123 — bisa diganti di Pengaturan</p>
      </div>
    </div>
  );
}
