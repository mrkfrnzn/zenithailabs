import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage     from './pages/LandingPage';
import LoginPage       from './pages/LoginPage';
import MagicLinkPage   from './pages/MagicLinkPage';
import PlayerDashboard from './pages/PlayerDashboard';
import AdminDashboard  from './pages/AdminDashboard';
import './App.css';

function PrivateRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  if (!user)   return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user)   return <Navigate to="/" replace />;
  return user.role === 'admin'
    ? <Navigate to="/admin"     replace />
    : <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"             element={<LandingPage />} />
      <Route path="/login"        element={<LoginPage />} />
      <Route path="/auth/verify"  element={<MagicLinkPage />} />
      <Route path="/dashboard"    element={<PrivateRoute><PlayerDashboard /></PrivateRoute>} />
      <Route path="/admin/*"      element={<PrivateRoute adminOnly><AdminDashboard /></PrivateRoute>} />
      <Route path="/home"         element={<RootRedirect />} />
      <Route path="*"             element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
