import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { verifyMagicLink } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function MagicLinkPage() {
  const [searchParams] = useSearchParams();
  const { login }      = useAuth();
  const navigate       = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setError('No token found in the URL.'); return; }

    verifyMagicLink(token)
      .then(({ token: jwt, user }) => {
        login(jwt, user);
        navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
      })
      .catch(err => setError(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold mb-2">Login Failed</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <Link to="/login" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm transition">
            Try Again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin text-4xl mb-4">⚙️</div>
        <p className="text-slate-400">Verifying your login link…</p>
      </div>
    </div>
  );
}
