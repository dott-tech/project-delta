import React, { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/useAuth';
import { Building2 } from 'lucide-react';
import { getApiErrorMessage } from '../utils/apiError';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const inviteToken = new URLSearchParams(window.location.hash.slice(1)).get('invite') || '';
  const [isRegistering, setIsRegistering] = useState(Boolean(inviteToken));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (isRegistering) {
        const response = await api.post('/auth/register', {
          email, 
          password, 
          name,
          inviteToken,
        });
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        login(response.data.token, response.data.user);
        return;
      }

      const response = await api.post('/auth/login', { email, password });
      login(response.data.token, response.data.user);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Authentication failed. Please check your credentials.'));
    }
  };

  return (
    <div className="auth-page min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="auth-card max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <div className="auth-copy">
          <div className="auth-mark p-3 bg-blue-600/10 border border-blue-500/20 rounded-xl text-blue-400">
            <Building2 className="w-8 h-8" />
          </div>

          <span className="auth-eyebrow">StructuralHub · Project studio</span>
          <h2 className="text-2xl font-bold text-white mb-2">
            {isRegistering ? 'A better way to build.' : 'Good to have you back.'}
          </h2>
          <p className="text-slate-400 text-sm">
            {isRegistering ? 'Create your account to join the workspace.' : 'Your projects and people are right where you left them.'}
          </p>
        </div>

        <div className="auth-form-area">
          {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg text-center">
            {error}
          </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
          {isRegistering && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="John Doe"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="engineer@structuralhub.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={12}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="At least 12 characters"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg text-sm transition-colors shadow-lg shadow-blue-600/20"
          >
            {isRegistering ? 'Sign Up' : 'Sign In'}
          </button>
          </form>

          <div className="mt-6 text-center">
          {inviteToken ? (
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-xs text-blue-400 hover:underline"
            >
              {isRegistering ? 'Already have an account? Sign in' : 'Use this invitation to register'}
            </button>
          ) : (
            <p className="text-xs text-slate-500">Need an account? Ask your workspace administrator for an invitation link.</p>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};
