import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, Folder, MapPin, FileText, ExternalLink, Shield, Archive } from 'lucide-react';
import { AdminUserDirectory } from './AdminUserDirectory';

export interface Project {
  id: string;
  title: string;
  description?: string;
  projectType: string;
  location: string;
  isArchived: boolean;
  createdAt: string;
  files?: Array<{ id: string; fileName: string; fileType: string }>;
}

export const ProjectsDashboard: React.FC<{ onSelectProject: (id: string) => void }> = ({ onSelectProject }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'projects' | 'admin'>('projects');
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Form State for New Project
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState('Commercial');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'ADMIN';
  const canCreate = isAdmin || user?.role === 'TEAM_MEMBER';

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await api.get('/projects');
      setProjects(response.data);
    } catch (err: any) {
      console.error('Failed to load projects', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await api.post('/projects', {
        title,
        description,
        projectType,
        location,
      });

      setShowModal(false);
      setTitle('');
      setDescription('');
      setLocation('');
      fetchProjects();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create project');
    }
  };

  const handleArchiveProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation(); // Prevents opening project detail view
    if (!confirm('Are you sure you want to archive this project?')) return;

    try {
      await api.patch(`/projects/${projectId}/archive`, { isArchived: true });
      fetchProjects();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to archive project');
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.location.toLowerCase().includes(search.toLowerCase()) ||
    p.projectType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition flex items-center gap-2 ${
              activeTab === 'projects'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Folder className="w-4 h-4" /> Projects Workspace
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-4 py-2 text-sm font-medium rounded-xl transition flex items-center gap-2 ${
                activeTab === 'admin'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-4 h-4 text-amber-400" /> Admin Directory
            </button>
          )}
        </div>

        {activeTab === 'projects' && canCreate && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-xl transition shadow-lg shadow-blue-600/20 font-medium"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>
        )}
      </div>

      {/* ADMIN TAB VIEW */}
      {activeTab === 'admin' && isAdmin && (
        <div className="mt-4">
          <AdminUserDirectory />
        </div>
      )}

      {/* PROJECTS TAB VIEW */}
      {activeTab === 'projects' && (
        <>
          {/* Search Bar */}
          <div className="relative max-w-md w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search projects by title, type, or location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Projects Grid */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm">Loading projects...</div>
          ) : filteredProjects.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <Folder className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-white font-medium mb-1">No Projects Found</h3>
              <p className="text-slate-400 text-xs mb-4">Create your first project to start organizing CAD drawings and PDFs.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 transition cursor-pointer flex flex-col justify-between group relative"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-semibold px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
                        {project.projectType}
                      </span>
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <button
                            title="Archive Project"
                            onClick={(e) => handleArchiveProject(e, project.id)}
                            className="p-1 hover:bg-slate-800 text-slate-600 hover:text-red-400 rounded-md transition"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                        <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition" />
                      </div>
                    </div>
                    <h3 className="text-white font-semibold text-lg group-hover:text-blue-400 transition mb-1">
                      {project.title}
                    </h3>
                    <p className="text-slate-400 text-xs line-clamp-2 mb-4">
                      {project.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{project.location}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>{project.files?.length || 0} assets</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Project Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Create Engineering Project</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Project Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Metro Station Line 3 Extension"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Project Type</label>
                  <select
                    value={projectType}
                    onChange={(e) => setProjectType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="Commercial">Commercial</option>
                    <option value="Residential">Residential</option>
                    <option value="Infrastructure">Infrastructure</option>
                    <option value="Bridge">Bridge</option>
                    <option value="Industrial">Industrial</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Location</label>
                  <input
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Dubai, UAE"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Structural engineering scope details..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition font-medium shadow-lg shadow-blue-600/20"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};