import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { ProjectsDashboard } from './components/ProjectsDashboard';
import { ProjectDetailView } from './components/ProjectDetailView';
import { AdminUserDirectory } from './components/AdminUserDirectory';
import { ArchivedProjectsList } from './components/ArchivedProjectsList';
import { Login } from './components/login'; // Make sure the file name is 'login.tsx' or 'Login.tsx'

export const App: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<'projects' | 'admin' | 'project-detail'>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading session...
      </div>
    );
  }

  if (!user) {
    // FIX 1: Uppercase <Login /> so JSX recognizes it as a React component
    return <Login />;
  }

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    setCurrentView('project-detail');
  };

  const handleNavigate = (view: 'projects' | 'admin') => {
    setSelectedProjectId(null);
    setCurrentView(view);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Navbar currentView={currentView} onNavigate={handleNavigate} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'projects' && (
          <ProjectsDashboard onSelectProject={handleSelectProject} />
        )}

        {currentView === 'project-detail' && selectedProjectId && (
          <ProjectDetailView 
            projectId={selectedProjectId} 
            onBack={() => setCurrentView('projects')} 
          />
        )}

       {currentView === 'admin' && user.role === 'ADMIN' && (
  <div className="space-y-8">
    <div className="border-b border-slate-800 pb-4">
      <h2 className="text-xl font-bold text-white">System Administration</h2>
      <p className="text-xs text-slate-400">Manage user access privileges, roles, and archived platform projects.</p>
    </div>

    {/* Users & Team Directory */}
    <AdminUserDirectory />

    {/* Archived Projects List */}
    <ArchivedProjectsList />
  </div>
)}
      </main>
    </div>
  );
};

export default App;