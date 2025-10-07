import React from 'react';
import { Link, useLocation } from 'react-router-dom';


export const Navigation: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="glass-dark border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-forest-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
              </svg>
            </div>
            <span className="text-xl font-display font-bold text-slate-100">
              BarnHand
            </span>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center space-x-6">
            <Link
              to="/dashboard"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                isActive('/dashboard')
                  ? 'text-cyan-400 bg-slate-800'
                  : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              Dashboard
            </Link>
            <Link
              to="/settings"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                isActive('/settings')
                  ? 'text-cyan-400 bg-slate-800'
                  : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              Settings
            </Link>
          </div>

        </div>
      </div>
    </nav>
  );
};
