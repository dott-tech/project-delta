import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Plus, Folder, MapPin, FileText, Shield, Archive, Edit3, Clock, ExternalLink } from 'lucide-react';
import { AdminUserDirectory } from './AdminUserDirectory';
import { ProjectFilters } from './ProjectFilters';
import { EditProjectModal } from './EditProjectModal';

export interface Project {
  id: string;
  title: string;
  description?: string | null;
  projectType: string;
  location: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: { id: string; name: string; email: string };
  updatedBy?: { id: string; name: string; email: string } | null;
  files?: Array<{ id: string; fileName: string; fileType: string }>;
}

export const ProjectsDashboard: React.FC<{ onSelectProject: (id: string) => void }> = ({ onSelectProject }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'projects' | 'admin'>('projects');
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter States
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modal States
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

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

  // Extract unique locations & project types for dropdown filters
  const locationsList = useMemo(() => {
    return Array.from(new Set(projects.map((p) => p.location).filter(Boolean)));
  }, [projects]);

  const typesList = useMemo(() => {
    return Array.from(new Set(projects.map((p) => p.projectType).filter(Boolean)));
  }, [projects]);

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
    e.stopPropagation();
    if (!confirm('Are you sure you want to archive this project?')) return;

    try {
      await api.patch(`/projects/${projectId}/archive`, { isArchived: true });
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to archive project');
    }
  };

  // Advanced client-side filtering (Search + Location + Type)
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        search === '' ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.location.toLowerCase().includes(search.toLowerCase()) ||
        p.projectType.toLowerCase().includes(search.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(search.toLowerCase()));

      const matchesLocation =
        locationFilter === '' || p.location.toLowerCase() === locationFilter.toLowerCase();

      const matchesType =
        typeFilter === '' || p.projectType.toLowerCase() === typeFilter.toLowerCase();

      return matchesSearch && matchesLocation && matchesType;
    });
  }, [projects, search, locationFilter, typeFilter]);

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
          {/* Enhanced Filter Toolbar */}
          <ProjectFilters
            search={search}
            onSearchChange={setSearch}
            locationFilter={locationFilter}
            onLocationChange={setLocationFilter}
            typeFilter={typeFilter}
            onTypeChange={setTypeFilter}
            locationsList={locationsList}
            typesList={typesList}
            onReset={() => {
              setSearch('');
              setLocationFilter('');
              setTypeFilter('');
            }}
          />

          {/* Projects Grid */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm">Loading projects...</div>
          ) : filteredProjects.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <Folder className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-white font-medium mb-1">No Projects Found</h3>
              <p className="text-slate-400 text-xs mb-4">
                Try adjusting your search filters or create a new project.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl hover:shadow-2xl transition duration-200 cursor-pointer flex flex-col justify-between group relative"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-semibold px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
                        {project.projectType}
                      </span>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                        {canCreate && (
                          <button
                            title="Edit Project"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProject(project);
                            }}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            title="Archive Project"
                            onClick={(e) => handleArchiveProject(e, project.id)}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded-lg transition"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div className="p-1.5 text-slate-500 group-hover:text-slate-300">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-white font-semibold text-base group-hover:text-blue-400 transition">
                        {project.title}
                      </h3>
                      <p className="text-slate-400 text-xs line-clamp-2 mt-1">
                        {project.description || 'No description provided.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <span>{project.location}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        <span>{project.files?.length || 0} assets</span>
                      </div>
                    </div>
                  </div>

                  {/* Audit Footer */}
                  <div className="border-t border-slate-800/80 pt-3 mt-4 space-y-1 text-[11px] text-slate-500">
                    <div className="flex items-center justify-between">
                      <span>Created by: {project.createdBy?.name || 'System'}</span>
                      <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                    </div>

                    {project.updatedBy && project.updatedAt && (
                      <div className="flex items-center justify-between text-slate-400 font-medium">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-blue-400" />
                          Edited by {project.updatedBy.name}
                        </span>
                        <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                      </div>
                    )}
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

      {/* Edit Project Modal */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          isOpen={!!editingProject}
          onClose={() => setEditingProject(null)}
          onSuccess={() => {
            fetchProjects();
          }}
        />
      )}
    </div>
  );
};