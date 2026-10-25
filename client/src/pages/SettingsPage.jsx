import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Spinner, useLoad } from '../components/ui.jsx';

const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];

export default function SettingsPage({ setUser }) {
  const { data, loading, error: loadError } = useLoad(() => api.get('/api/settings'), []);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  if (loading) return <Spinner />;
  const state = form ?? { name: data.name, availability: data.availability };

  async function save(e) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const availability = Object.fromEntries(DAYS.map(([k]) => [k, Math.round(Number(state.availability[k]) || 0)]));
      const res = await api.put('/api/settings', { name: state.name, availability });
      setUser((u) => ({ ...u, name: res.name, availability: res.availability }));
      setForm(null);
      setMsg('Settings saved.');
    } catch (err) {
      setError(err.fields ? Object.values(err.fields).join(' ') : err.message);
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <Alert>{error || loadError}</Alert>
      <Alert kind="success" onClose={() => setMsg('')}>{msg}</Alert>
      <form className="card form-grid" onSubmit={save}>
        <label className="field"><span>Your name</span><input value={state.name} onChange={(e) => setForm({ ...state, name: e.target.value })} /></label>
        <h2 className="span-all">Available study time (minutes per day)</h2>
        {DAYS.map(([k, label]) => (
          <label key={k} className="field">
            <span>{label}</span>
            <input
              type="number" min="0" max="960" step="15"
              value={state.availability[k]}
              onChange={(e) => setForm({ ...state, availability: { ...state.availability, [k]: e.target.value } })}
            />
          </label>
        ))}
        <div className="row span-all"><button className="btn btn-primary">Save settings</button></div>
      </form>
    </>
  );
}
