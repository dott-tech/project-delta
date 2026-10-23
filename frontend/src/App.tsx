import React, { useEffect, useState } from 'react';
import { useAuth } from './context/useAuth';
import { Navbar } from './components/Navbar';
import { ProjectsDashboard } from './components/ProjectsDashboard';
import { ProjectDetailView } from './components/ProjectDetailView';
import { AdminUserDirectory } from './components/AdminUserDirectory';
import { ArchivedProjectsList } from './components/ArchivedProjectsList';
import { Login } from './components/login';

// Define the full set of view types supported by the application
type NavigationTarget = 'projects' | 'admin' | 'archive';
type ViewState = NavigationTarget | 'project-detail';

interface AppRoute {
  currentView: ViewState;
  selectedProjectId: string | null;
  projectHistory: string[];
}

const readRouteFromUrl = (): AppRoute => {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');

  if (view === 'admin' || view === 'archive') {
    return { currentView: view, selectedProjectId: null, projectHistory: [] };
  }

  if (view === 'project-detail' && params.get('projectId')) {
    return {
      currentView: 'project-detail',
      selectedProjectId: params.get('projectId'),
      projectHistory: params.getAll('parent'),
    };
  }

  return { currentView: 'projects', selectedProjectId: null, projectHistory: [] };
};

const writeRouteToUrl = (route: AppRoute) => {
  const url = new URL(window.location.href);
  url.searchParams.delete('view');
  url.searchParams.delete('projectId');
  url.searchParams.delete('parent');

  if (route.currentView !== 'projects') {
    url.searchParams.set('view', route.currentView);
  }
  if (route.currentView === 'project-detail' && route.selectedProjectId) {
    url.searchParams.set('projectId', route.selectedProjectId);
    route.projectHistory.forEach((parentId) => url.searchParams.append('parent', parentId));
  }

  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
};

export const App: React.FC = () => {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<AppRoute>(readRouteFromUrl);
  const { currentView, selectedProjectId, projectHistory } = route;

  useEffect(() => {
    const restoreRoute = () => setRoute(readRouteFromUrl());
    window.addEventListener('popstate', restoreRoute);
    return () => window.removeEventListener('popstate', restoreRoute);
  }, []);

  if (loading) {
    return (
      <div className="session-loading min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading session...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Handle selecting a top-level project from the dashboard
  const handleSelectProject = (id: string) => {
    const nextRoute: AppRoute = {
      currentView: 'project-detail',
      selectedProjectId: id,
      projectHistory: [],
    };
    writeRouteToUrl(nextRoute);
    setRoute(nextRoute);
  };

  // Handle drilling into a child building package (e.g., Warehouse 1, Substation)
  const handleSelectSubProject = (subProjectId: string) => {
    const nextRoute: AppRoute = {
      currentView: 'project-detail',
      selectedProjectId: subProjectId,
      projectHistory: selectedProjectId
        ? [...projectHistory, selectedProjectId]
        : projectHistory,
    };
    writeRouteToUrl(nextRoute);
    setRoute(nextRoute);
  };

  // Handle backing out through the project hierarchy stack
  const handleBackProject = () => {
    let nextRoute: AppRoute;
    if (projectHistory.length > 0) {
      // Pop the previous parent site ID off the stack
      const previousProjectId = projectHistory[projectHistory.length - 1];
      nextRoute = {
        currentView: 'project-detail',
        selectedProjectId: previousProjectId,
        projectHistory: projectHistory.slice(0, -1),
      };
    } else {
      // Stack is empty -> Return to global Projects Dashboard
      nextRoute = { currentView: 'projects', selectedProjectId: null, projectHistory: [] };
    }
    writeRouteToUrl(nextRoute);
    setRoute(nextRoute);
  };

  const handleNavigate = (view: NavigationTarget) => {
    const nextRoute: AppRoute = { currentView: view, selectedProjectId: null, projectHistory: [] };
    writeRouteToUrl(nextRoute);
    setRoute(nextRoute);
  };

  return (
    <div className={`app-shell ${currentView === 'projects' ? 'dashboard-shell' : 'workspace-shell'} min-h-screen bg-slate-950 text-slate-100 font-sans`}>
      <Navbar currentView={currentView} onNavigate={handleNavigate} />

      <main className="app-content mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        {(currentView === 'projects' || (currentView === 'project-detail' && !selectedProjectId)) && (
          <ProjectsDashboard onSelectProject={handleSelectProject} />
        )}

        {currentView === 'project-detail' && selectedProjectId && (
          <ProjectDetailView 
            key={selectedProjectId} // Forces clean re-render when switching between parent site & child buildings
            projectId={selectedProjectId} 
            onBack={handleBackProject}
            onSelectSubProject={handleSelectSubProject}
          />
        )}

        {currentView === 'admin' && user.role === 'ADMIN' && (
          <div className="content-page">
            <div className="content-heading">
              <span className="content-eyebrow">Workspace settings</span>
              <h1>People & access</h1>
              <p>Keep your project team organized and control who can work in the hub.</p>
            </div>

            {/* Users & Team Directory */}
            <AdminUserDirectory />
          </div>
        )}

        {currentView === 'archive' && (
          <div className="content-page">
            <div className="content-heading">
              <span className="content-eyebrow">Project library</span>
              <h1>The archive</h1>
              <p>Past projects are safe here until you are ready to bring them back.</p>
            </div>

            <ArchivedProjectsList />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
