import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/login';
import { ProjectsDashboard } from './components/ProjectsDashboard';
import { Building2, LogOut } from 'lucide-react';

const MainApp: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top Navigation */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedProjectId(null)}>
            <div className="p-2 bg-blue-600/10 border border-blue-500/20 rounded-lg text-blue-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-wide">STRUCTURAL HUB</h1>
              <p className="text-[11px] text-slate-400">Engineering Asset Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-medium text-white">{user?.name}</p>
              <span className="text-[10px] text-blue-400 font-semibold">{user?.role}</span>
            </div>
            <button
              onClick={logout}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition border border-slate-700"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-6">
        {selectedProjectId ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <button
              onClick={() => setSelectedProjectId(null)}
              className="text-xs text-blue-400 hover:underline mb-4 inline-block"
            >
              &larr; Back to all projects
            </button>
            <h2 className="text-xl font-bold text-white">Project ID: {selectedProjectId}</h2>
            <p className="text-slate-400 text-sm mt-1">Project Asset Detail & Upload View coming right up!</p>
          </div>
        ) : (
          <ProjectsDashboard onSelectProject={(id) => setSelectedProjectId(id)} />
        )}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}