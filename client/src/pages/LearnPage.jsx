import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Field } from '../components/ui.jsx';

export default function LearnPage() {
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('intermediate');
  const [count, setCount] = useState(5);
  const [explanation, setExplanation] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = async (label, fn) => {
    if (topic.trim().length < 2) return setError('Enter a topic (at least 2 characters).');
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const explain = () => run('explain', async () => setExplanation(await api.post('/api/ai/explain', { topic, level })));
  const makeQuiz = () =>
    run('quiz', async () => {
      setQuiz(await api.post('/api/ai/quiz', { topic, count: Number(count), difficulty: level }));
      setAnswers({});
    });

  const answered = quiz ? Object.keys(answers).length : 0;
  const score = quiz ? quiz.questions.filter((q, i) => answers[i] === q.answerIndex).length : 0;
  const finished = quiz && answered === quiz.questions.length;

  return (
    <>
      <h1>Learn a topic</h1>
      <section className="card form-grid">
        <Field label="Topic">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Photosynthesis, Binary search, The French Revolution" maxLength={200} />
        </Field>
        <Field label="Level">
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
          </select>
        </Field>
        <Field label="Quiz questions">
          <input type="number" min="1" max="10" value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        <div className="row">
          <button className="btn btn-primary" onClick={explain} disabled={!!busy}>{busy === 'explain' ? 'Thinking…' : 'Explain this topic'}</button>
          <button className="btn btn-secondary" onClick={makeQuiz} disabled={!!busy}>{busy === 'quiz' ? 'Writing quiz…' : 'Quiz me'}</button>
        </div>
      </section>
      <Alert onClose={() => setError('')}>{error}</Alert>

      {explanation && (
        <section className="card">
          <h2>{explanation.topic}</h2>
          {explanation.explanation.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          {explanation.keyPoints.length > 0 && (
            <>
              <h3>Key points</h3>
              <ul>{explanation.keyPoints.map((k) => <li key={k}>{k}</li>)}</ul>
            </>
          )}
          <p className="muted"><small>AI-generated — double-check important facts against your course materials.</small></p>
        </section>
      )}

      {quiz && (
        <section className="card">
          <h2>Quiz: {quiz.topic}</h2>
          {quiz.questions.map((q, i) => (
            <fieldset key={i} className="question">
              <legend>{i + 1}. {q.question}</legend>
              {q.options.map((o, j) => {
                const picked = answers[i] !== undefined;
                const cls = picked ? (j === q.answerIndex ? 'correct' : answers[i] === j ? 'wrong' : '') : '';
                return (
                  <label key={j} className={`option ${cls}`}>
                    <input type="radio" name={`q${i}`} disabled={picked} checked={answers[i] === j} onChange={() => setAnswers({ ...answers, [i]: j })} />
                    {o}
                  </label>
                );
              })}
              {answers[i] !== undefined && (
                <small className={answers[i] === q.answerIndex ? 'success-text' : 'danger'}>
                  {answers[i] === q.answerIndex ? 'Correct. ' : 'Not quite. '}{q.explanation}
                </small>
              )}
            </fieldset>
          ))}
          {finished && (
            <Alert kind="success">
              You scored {score} / {quiz.questions.length}. {score === quiz.questions.length ? 'Perfect!' : 'Review the explanations above and try again.'}
            </Alert>
          )}
        </section>
      )}
    </>
  );
}
