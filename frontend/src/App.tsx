import React, { useState } from 'react';
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

export const App: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewState>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Navigation stack to handle drilling down into nested building packages
  const [projectHistory, setProjectHistory] = useState<string[]>([]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading session...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Handle selecting a top-level project from the dashboard
  const handleSelectProject = (id: string) => {
    setProjectHistory([]); // Clear stack when opening a fresh top-level site project
    setSelectedProjectId(id);
    setCurrentView('project-detail');
  };

  // Handle drilling into a child building package (e.g., Warehouse 1, Substation)
  const handleSelectSubProject = (subProjectId: string) => {
    if (selectedProjectId) {
      setProjectHistory((prev) => [...prev, selectedProjectId]);
    }
    setSelectedProjectId(subProjectId);
  };

  // Handle backing out through the project hierarchy stack
  const handleBackProject = () => {
    if (projectHistory.length > 0) {
      // Pop the previous parent site ID off the stack
      const previousProjectId = projectHistory[projectHistory.length - 1];
      setProjectHistory((prev) => prev.slice(0, -1));
      setSelectedProjectId(previousProjectId);
    } else {
      // Stack is empty -> Return to global Projects Dashboard
      setSelectedProjectId(null);
      setCurrentView('projects');
    }
  };

  const handleNavigate = (view: NavigationTarget) => {
    setSelectedProjectId(null);
    setProjectHistory([]);
    setCurrentView(view);
  };

  return (
    <div className="app-shell min-h-screen bg-slate-950 text-slate-100 font-sans">
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
