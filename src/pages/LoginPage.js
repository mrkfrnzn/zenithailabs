import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requestMagicLink } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [devLink, setDevLink] = useState(null);
  const [error,   setError]   = useState('');

  // Already logged in
  if (user) {
    navigate(user.role === 'admin' ? '/admin' : '/dashboard');
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await requestMagicLink(email.trim());
      setSent(true);
      if (res.devLink) setDevLink(res.devLink);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-blue-400 text-sm hover:underline">← Back to home</Link>
          <h1 className="text-3xl font-bold mt-4 mb-2">Log In / Join</h1>
          <p className="text-slate-400 text-sm">Enter your email and we'll send you a magic link.</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
          {sent ? (
            <div className="text-center">
              <div className="text-4xl mb-4">📬</div>
              <h2 className="text-xl font-bold mb-2">Check your email</h2>
              <p className="text-slate-400 text-sm mb-4">
                A login link was sent to <strong>{email}</strong>. It expires in 30 minutes.
              </p>
              {devLink && (
                <div className="bg-slate-700 rounded-lg p-4 text-left mt-4">
                  <p className="text-yellow-400 text-xs font-semibold mb-2">
                    DEV MODE — Magic link (no email configured):
                  </p>
                  <a href={devLink} className="text-blue-400 text-xs break-all hover:underline">
                    {devLink}
                  </a>
                </div>
              )}
              <button
                onClick={() => { setSent(false); setDevLink(null); setEmail(''); }}
                className="mt-4 text-sm text-slate-400 hover:text-white underline"
              >
                Send to a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-900/50 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition"
              >
                {loading ? 'Sending…' : 'Send Magic Link'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          No password needed. We use secure email magic links.
        </p>
      </div>
    </div>
  );
}
