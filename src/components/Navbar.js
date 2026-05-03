import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <nav className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
      <Link to={isAdmin ? '/admin' : '/dashboard'} className="text-lg font-bold text-blue-400">
        NFL Survivor
      </Link>
      <div className="flex items-center gap-4">
        {isAdmin && (
          <Link to="/admin" className="text-sm text-slate-300 hover:text-white">
            Admin
          </Link>
        )}
        {!isAdmin && (
          <Link to="/dashboard" className="text-sm text-slate-300 hover:text-white">
            Dashboard
          </Link>
        )}
        <Link to="/" className="text-sm text-slate-300 hover:text-white">Rules</Link>
        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-slate-400">{user?.displayName || user?.email}</span>
          {isAdmin && (
            <span className="text-xs bg-blue-700 text-blue-100 px-2 py-0.5 rounded">Admin</span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-slate-400 hover:text-white border border-slate-600 px-3 py-1 rounded"
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}
