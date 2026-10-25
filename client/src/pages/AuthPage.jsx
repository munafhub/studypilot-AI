import { useState } from 'react';
import { api, setToken } from '../api.js';
import { Alert, Field } from '../components/ui.jsx';

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const body = mode === 'login' ? { email: form.email, password: form.password } : form;
      const res = await api.post(`/api/auth/${mode}`, body);
      setToken(res.token);
      onAuth(res.user);
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <form className="card auth" onSubmit={submit} noValidate>
        <h1>✈ StudyPilot AI</h1>
        <p className="muted">Plan your study time, import your syllabus, and learn with AI.</p>
        <Alert>{error}</Alert>
        {mode === 'register' && (
          <Field label="Name" error={fields.name}>
            <input value={form.name} onChange={set('name')} autoComplete="name" required />
          </Field>
        )}
        <Field label="Email" error={fields.email}>
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </Field>
        <Field label="Password" error={fields.password}>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </Field>
        {mode === 'register' && <small className="muted">At least 8 characters.</small>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        <p className="muted center-text">
          {mode === 'login' ? 'New here?' : 'Already registered?'}{' '}
          <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setFields({}); }}>
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </button>
        </p>
      </form>
    </main>
  );
}
