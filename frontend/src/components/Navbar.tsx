import React from 'react';
import { useAuth } from '../context/useAuth';
import {
  Building2,
  FolderKanban,
  Users,
  Archive,
  LogOut,
  User as UserIcon,
} from 'lucide-react';

export type NavView = 'projects' | 'admin' | 'archive' | 'project-detail';

interface NavbarProps {
  currentView: NavView;
  onNavigate: (view: 'projects' | 'admin' | 'archive') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <header className="studio-header">
      <div className="studio-header-inner">
        <button type="button" onClick={() => onNavigate('projects')} className="studio-brand" aria-label="Structural Hub home">
          <span className="studio-brand-mark"><Building2 aria-hidden="true" /></span>
          <span className="studio-brand-copy">
            <span className="studio-brand-name">Structural<span>Hub</span></span>
            <span className="studio-brand-caption">Engineering workspace</span>
          </span>
        </button>

        <nav aria-label="Main navigation" className="studio-nav">
          <button onClick={() => onNavigate('projects')} aria-current={currentView === 'projects' || currentView === 'project-detail' ? 'page' : undefined} className={`studio-nav-link ${currentView === 'projects' || currentView === 'project-detail' ? 'is-active' : ''}`}>
            <FolderKanban aria-hidden="true" /><span>Projects</span>
          </button>
          {isAdmin && <>
            <button onClick={() => onNavigate('admin')} aria-current={currentView === 'admin' ? 'page' : undefined} className={`studio-nav-link ${currentView === 'admin' ? 'is-active' : ''}`}>
              <Users aria-hidden="true" /><span>Team</span>
            </button>
            <button onClick={() => onNavigate('archive')} aria-current={currentView === 'archive' ? 'page' : undefined} className={`studio-nav-link ${currentView === 'archive' ? 'is-active' : ''}`}>
              <Archive aria-hidden="true" /><span>Archive</span>
            </button>
          </>}
        </nav>

        <div className="studio-account">
          <span className="studio-avatar"><UserIcon aria-hidden="true" /></span>
          <span className="studio-account-copy">
            <span className="studio-account-name">{user?.name || 'Engineer'}</span>
            <span className="studio-account-role">{user?.role === 'TEAM_MEMBER' ? 'TEAM MEMBER' : user?.role || 'GUEST'}</span>
          </span>
          <button onClick={logout} aria-label="Sign out" title="Sign out" className="studio-signout"><LogOut aria-hidden="true" /></button>
        </div>
      </div>
    </header>
  );
};
