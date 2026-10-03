import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Building2, 
  FolderKanban, 
  Users, 
  LogOut, 
  ShieldCheck, 
  User as UserIcon 
} from 'lucide-react';

interface NavbarProps {
  currentView: 'projects' | 'admin' | 'project-detail';
  onNavigate: (view: 'projects' | 'admin') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const getRoleBadgeStyle = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'TEAM_MEMBER':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand Logo & Title */}
        <div 
          onClick={() => onNavigate('projects')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="p-2 bg-blue-600/20 border border-blue-500/30 rounded-xl group-hover:border-blue-500/60 transition">
            <Building2 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide group-hover:text-blue-400 transition">
              Structural Hub
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Engineering Workspace
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => onNavigate('projects')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              currentView === 'projects' || currentView === 'project-detail'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            Projects
          </button>

          {isAdmin && (
            <button
              onClick={() => onNavigate('admin')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                currentView === 'admin'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-amber-400" />
              Admin Panel
            </button>
          )}
        </nav>

        {/* User Profile Pill & Logout */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-medium text-white line-clamp-1">{user?.name || 'Engineer'}</div>
              <div className="text-[10px] text-slate-500 line-clamp-1">{user?.email}</div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getRoleBadgeStyle(user?.role)}`}>
              {user?.role || 'GUEST'}
            </span>
          </div>

          <button
            onClick={logout}
            title="Sign Out"
            className="p-2 bg-slate-950 hover:bg-red-500/10 border border-slate-800 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-xl transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </div>
    </header>
  );
};