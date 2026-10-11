import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Archive, RotateCcw, RefreshCw, FolderGit2, AlertTriangle, Eye } from 'lucide-react';
import { getApiErrorMessage } from '../utils/apiError';

export interface ArchivedProject {
  id: string;
  title: string;
  projectType: string;
  location: string;
  updatedAt: string;
}

interface Props {
  onSelectProject?: (projectId: string) => void;
}

export const ArchivedProjectsList: React.FC<Props> = ({ onSelectProject }) => {
  const [projects, setProjects] = useState<ArchivedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadArchivedProjects = async () => {
    try {
      // Pass ?archived=true to match backend query parsing
      const response = await api.get('/projects?archived=true');
      setProjects(response.data);
      setError('');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to load archived projects.'));
    } finally {
      setLoading(false);
    }
  };

  const fetchArchivedProjects = async () => {
    setLoading(true);
    await loadArchivedProjects();
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadArchivedProjects(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const handleRestoreProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    try {
      setRestoringId(projectId);
      await api.patch(`/projects/${projectId}/archive`, { isArchived: false });

      // Remove restored project from the list
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to restore project.'));
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
        Loading archived projects...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-red-400 text-sm flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
        <div>{error}</div>
      </div>
    );
  }

  return (
    <div className="archive-panel bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Archive className="w-5 h-5 text-amber-400" /> Archived Projects
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Review inactive project files, view their read-only workbench, or restore them to the active workspace.
          </p>
        </div>

        <button
          onClick={fetchArchivedProjects}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-xl transition w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Archive
        </button>
      </div>

      {/* Empty State */}
      {projects.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
          <FolderGit2 className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm font-medium">No archived projects found</p>
          <p className="text-slate-500 text-xs mt-1">Archived projects will appear here when deactivated.</p>
        </div>
      ) : (
        /* Archive Table */
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                <th className="py-3 px-4">Project Title</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {projects.map((project) => (
                <tr
                  key={project.id}
                  onClick={() => onSelectProject?.(project.id)}
                  className="hover:bg-slate-800/30 transition cursor-pointer"
                >
                  <td className="py-3.5 px-4 font-medium text-white">{project.title}</td>
                  <td className="py-3.5 px-4 text-xs text-slate-400">{project.projectType}</td>
                  <td className="py-3.5 px-4 text-slate-300 text-xs">{project.location}</td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {onSelectProject && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectProject(project.id);
                          }}
                          className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs px-3 py-1.5 rounded-xl transition"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                      )}
                      <button
                        disabled={restoringId === project.id}
                        onClick={(e) => handleRestoreProject(e, project.id)}
                        className="inline-flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs px-3 py-1.5 rounded-xl transition disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {restoringId === project.id ? 'Restoring...' : 'Restore'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
