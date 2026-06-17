import React from 'react';
import type { UseAuthReturn } from '../hooks/useAuth';

interface AuthPanelProps {
  auth: UseAuthReturn;
}

const AuthPanel: React.FC<AuthPanelProps> = ({ auth }) => {
  const { isLoggedIn, profile, balance, isLoading, login, logout } = auth;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 bg-gray-800/60 rounded-2xl border border-gray-700/50 shadow-sm p-3">
        <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-400">Connecting...</span>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="bg-gray-800/60 rounded-2xl border border-gray-700/50 shadow-sm p-3">
        <button
          onClick={login}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
          </svg>
          Connect with Pollinations
        </button>
      </div>
    );
  }

  const avatarUrl = profile?.githubUsername
    ? `https://github.com/${profile.githubUsername}.png?size=64`
    : null;

  return (
    <div className="flex items-center gap-3 flex-wrap bg-gray-800/60 rounded-2xl border border-gray-700/50 shadow-sm p-3">
      {/* Avatar + Name */}
      <div className="flex items-center gap-2">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={profile?.githubUsername || ''}
            className="w-7 h-7 rounded-full border border-gray-600"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-brand-primary flex items-center justify-center text-white text-xs font-bold">
            {(profile?.name || '?')[0].toUpperCase()}
          </div>
        )}
        <span className="text-sm text-gray-200 font-medium">
          {profile?.githubUsername || profile?.name || 'User'}
        </span>
      </div>

      {/* Balance */}
      {balance !== null && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-purple/20 text-brand-pink font-medium">
          {balance.toFixed(1)} pollen
        </span>
      )}

      {/* Disconnect */}
      <button
        onClick={logout}
        className="p-2 rounded-xl transition-all duration-300 text-gray-400 hover:text-red-400 hover:bg-red-900/30"
        title="Disconnect"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
      </button>
    </div>
  );
};

export default AuthPanel;
