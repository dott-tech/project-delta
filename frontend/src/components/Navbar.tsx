import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { ProjectDirectory } from './ProjectDirectory';
import {
  Building2,
  FolderKanban,
  ChevronDown,
  ChevronRight,
  Users,
  Archive,
  LogOut,
  User as UserIcon,
} from 'lucide-react';

export type NavView = 'projects' | 'admin' | 'archive' | 'project-detail';

// Matches the CSS breakpoint where the project tree becomes a dropdown panel.
const PHONE_NAV_QUERY = '(max-width: 680px)';
const isPhoneNav = () => window.matchMedia(PHONE_NAV_QUERY).matches;

interface NavbarProps {
  currentView: NavView;
  onNavigate: (view: 'projects' | 'admin' | 'archive') => void;
  projectId: string | null;
  onNavigateProject: (projectId: string, ancestorIds: string[]) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, projectId, onNavigateProject }) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [projectsExpanded, setProjectsExpanded] = useState(false);

  // Escape closes the project tree.
  useEffect(() => {
    if (!projectsExpanded) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProjectsExpanded(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [projectsExpanded]);

  // On phones the tree is a dropdown, so close it once a project is picked.
  // The desktop sidebar keeps it open.
  const handleNavigateProject = (id: string, ancestorIds: string[]) => {
    if (isPhoneNav()) setProjectsExpanded(false);
    onNavigateProject(id, ancestorIds);
  };

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
          <div className="studio-projects-group">
            <button
              type="button"
              onClick={() => setProjectsExpanded((expanded) => !expanded)}
              aria-current={currentView === 'projects' || currentView === 'project-detail' ? 'page' : undefined}
              aria-expanded={projectsExpanded}
              aria-controls="project-directory-tree"
              className={`studio-nav-link project-directory-root-toggle ${currentView === 'projects' || currentView === 'project-detail' ? 'is-active' : ''}`}
            >
              <FolderKanban aria-hidden="true" /><span>Projects</span>
              {projectsExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
            </button>
            {projectsExpanded && (
              <>
                {/* Phone only (hidden by CSS on larger screens): tap outside to close. */}
                <button
                  type="button"
                  className="project-tree-backdrop"
                  aria-label="Close project list"
                  tabIndex={-1}
                  onClick={() => setProjectsExpanded(false)}
                />
                <div id="project-directory-tree" className="project-tree-panel">
                  <ProjectDirectory activeProjectId={projectId} onNavigate={handleNavigateProject} />
                </div>
              </>
            )}
          </div>
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
