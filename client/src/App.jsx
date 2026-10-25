import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { Spinner } from './components/ui.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TasksPage from './pages/TasksPage.jsx';
import SyllabusPage from './pages/SyllabusPage.jsx';
import PlannerPage from './pages/PlannerPage.jsx';
import LearnPage from './pages/LearnPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const ROUTES = [
  ['dashboard', 'Dashboard', Dashboard],
  ['tasks', 'Tasks', TasksPage],
  ['syllabus', 'Syllabus', SyllabusPage],
  ['planner', 'Planner', PlannerPage],
  ['learn', 'Learn', LearnPage],
  ['settings', 'Settings', SettingsPage],
];

const routeFromHash = () => {
  const name = window.location.hash.replace('#/', '');
  return ROUTES.some(([k]) => k === name) ? name : 'dashboard';
};

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!getToken());
  const [route, setRoute] = useState(routeFromHash());
  const [aiMode, setAiMode] = useState(null);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api
      .get('/api/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    window.addEventListener('studypilot:logout', logout);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('studypilot:logout', logout);
    };
  }, [logout]);

  useEffect(() => {
    if (user) api.get('/api/ai/status').then((s) => setAiMode(s.mode)).catch(() => {});
  }, [user]);

  if (booting) return <main className="center"><Spinner /></main>;
  if (!user) return <AuthPage onAuth={(u) => setUser(u)} />;

  const Page = ROUTES.find(([k]) => k === route)[2];
  const signOut = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* ignore */
    }
    logout();
  };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/dashboard">✈ StudyPilot AI</a>
        <nav aria-label="Main">
          {ROUTES.map(([key, label]) => (
            <a key={key} href={`#/${key}`} className={route === key ? 'active' : ''} aria-current={route === key ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <div className="who">
          <span>{user.name}</span>
          <button className="btn btn-ghost" onClick={signOut}>Log out</button>
        </div>
      </header>
      {aiMode === 'mock' && (
        <div className="banner">
          Demo AI mode: no <code>ANTHROPIC_API_KEY</code> is set on the server. Planning works fully; explanations and quizzes are generic demo content.
        </div>
      )}
      <main className="content">
        <Page user={user} setUser={setUser} aiMode={aiMode} />
      </main>
    </div>
  );
}
