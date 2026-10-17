import { useState } from 'react';
import { apiFetch } from '../api';

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isRegistration = mode === 'register';

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await apiFetch(`/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((issue) => issue.msg).filter(Boolean).join(' ')
          : data.detail;
        throw new Error(detail || `Authentication failed (HTTP ${response.status}).`);
      }

      if (!data.access_token) {
        throw new Error('The authentication service did not return an access token.');
      }
      onAuthenticated(data.access_token);
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? 'Unable to connect to the authentication service. Check that the backend is running.'
          : requestError instanceof Error
            ? requestError.message
            : 'Authentication failed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3efe8] p-5">
      <section className="w-full max-w-md rounded-xl border border-stone-200 bg-[#fffdf9] p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-teal-700">
            NextGenERP · Ops Center
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">
            {isRegistration ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {isRegistration
              ? 'Register to access the ERP workspace.'
              : 'Sign in to access your ERP workspace.'}
          </p>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            Username
            <input
              autoComplete="username"
              required
              minLength={isRegistration ? 3 : 1}
              maxLength={80}
              pattern="[A-Za-z0-9_.\-]+"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            Password
            <input
              autoComplete={isRegistration ? 'new-password' : 'current-password'}
              required
              minLength={isRegistration ? 12 : 1}
              maxLength={128}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            {isRegistration && (
              <span className="text-xs font-normal text-stone-500">
                Use at least 12 characters.
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-teal-700 px-4 py-2.5 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? 'Please wait…'
              : isRegistration
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-stone-600">
          {isRegistration ? 'Already registered?' : 'New to NextGenERP?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isRegistration ? 'login' : 'register');
              setError('');
            }}
            className="font-medium text-teal-800 underline underline-offset-2"
          >
            {isRegistration ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </section>
    </main>
  );
}
