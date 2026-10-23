import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/useAuth';
import {
  Plus, Folder, MapPin, FileText, Archive,
  Edit3, Clock, ExternalLink, ChevronDown, ChevronRight,
  Layers3, CircleAlert, TrendingUp
} from 'lucide-react';
import { ProjectFilters } from './ProjectFilters';
import { EditProjectModal } from './EditProjectModal';
import { ModalPortal } from './ModalPortal';
import { PhaseTracker } from './PhaseTracker';
import type { Project } from '../types/project';
import { getApiErrorMessage } from '../utils/apiError';

export const ProjectsDashboard: React.FC<{ onSelectProject: (id: string) => void }> = ({ onSelectProject }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  
  // Accordion toggle state for sub-projects inside cards
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

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
  const [parentProjectId, setParentProjectId] = useState<string>('');
  const [error, setError] = useState('');

  // Strictly enforce Admin privileges for creation & system management
  const isAdmin = user?.role === 'ADMIN';
  const canCreate = isAdmin; // Standard TEAM_MEMBER has read-only access on global level

  const loadProjects = useCallback(async () => {
    try {
      const response = await api.get('/projects');
      setProjects(response.data);
      setLoadError('');
    } catch (err: unknown) {
      console.error('Failed to load projects', err);
      setLoadError(getApiErrorMessage(err, 'Could not load projects. Check your connection and try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setLoadError('');
    await loadProjects();
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadProjects(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadProjects]);

  const toggleExpand = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  // Extract unique locations & project types for dropdown filters
  const locationsList = useMemo(() => {
    return Array.from(new Set(projects.map((p) => p.location).filter(Boolean)));
  }, [projects]);

  const typesList = useMemo(() => {
    return Array.from(new Set(projects.map((p) => p.projectType).filter(Boolean)));
  }, [projects]);

  const portfolio = useMemo(() => {
    const packages = projects.flatMap((project) => project.subProjects || []);
    const phases = [...projects, ...packages].flatMap((project) => project.phases || []);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const blocked = phases.filter((phase) => phase.status === 'BLOCKED').length;
    const overdue = phases.filter((phase) => phase.status !== 'COMPLETED' && phase.endDate && new Date(phase.endDate) < today).length;
    const needsAttention = phases.filter((phase) => phase.status === 'BLOCKED' || (phase.status !== 'COMPLETED' && phase.endDate && new Date(phase.endDate) < today)).length;
    const progress = phases.length ? Math.round(phases.reduce((sum, phase) => {
      if (phase.status === 'COMPLETED') return sum + 100;
      if (phase.status === 'IN_PROGRESS') return sum + (phase.progressPercent ?? 50);
      return sum;
    }, 0) / phases.length) : 0;
    return { packageCount: packages.length, phaseCount: phases.length, blocked, overdue, needsAttention, progress };
  }, [projects]);

  const statusFor = (project: Project) => {
    const phases = [project, ...(project.subProjects || [])].flatMap((item) => item.phases || []);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (phases.some((phase) => phase.status === 'BLOCKED')) return { label: 'Needs attention', style: 'bg-rose-500/10 text-rose-300 border-rose-500/20' };
    if (phases.some((phase) => phase.status !== 'COMPLETED' && phase.endDate && new Date(phase.endDate) < today)) return { label: 'Overdue', style: 'bg-amber-500/10 text-amber-300 border-amber-500/20' };
    if (phases.length > 0 && phases.every((phase) => phase.status === 'COMPLETED')) return { label: 'Complete', style: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' };
    if (phases.some((phase) => phase.status === 'IN_PROGRESS' || phase.status === 'COMPLETED')) return { label: 'In progress', style: 'bg-blue-500/10 text-blue-300 border-blue-500/20' };
    return { label: 'Planning', style: 'bg-slate-700/60 text-slate-300 border-slate-600/60' };
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await api.post('/projects', {
        title,
        description,
        projectType,
        location,
        parentProjectId: parentProjectId || null,
      });

      setShowModal(false);
      setTitle('');
      setDescription('');
      setLocation('');
      setParentProjectId('');
      fetchProjects();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to create project'));
    }
  };

  const handleArchiveProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to archive this project?')) return;

    try {
      await api.patch(`/projects/${projectId}/archive`, { isArchived: true });
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to archive project'));
    }
  };

  // Client-side filtering
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
    <div className="dashboard-page space-y-7">
      <section className="portfolio-hero relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/50 p-5 shadow-2xl shadow-black/20 sm:p-7">
        <div className="dashboard-hero-layout">
          <div className="dashboard-hero-copy">
            <div className="hero-kicker inline-flex items-center gap-2 border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">
              <Folder className="h-3.5 w-3.5" /> Project portfolio <span className="hero-kicker-index">/ 01</span>
            </div>
            <h2 className="hero-title">Engineering,<br /><span>in motion.</span></h2>
            <p className="hero-description">A considered view of active sites, structures, and the work moving them forward.</p>
            {canCreate && (
              <button onClick={() => setShowModal(true)} className="hero-action inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                <Plus className="h-4 w-4" /> Create a project
              </button>
            )}
          </div>
          <div className="dashboard-hero-art" aria-hidden="true">
            <div className="dashboard-drawing-label"><span>STRUCTURAL STUDY</span><span>SH / 01</span></div>
            <svg viewBox="0 0 340 240" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M57 202V105L170 42L283 105V202H57Z" />
              <path d="M83 202V116L170 68L257 116V202M111 202V130L170 98L229 130V202M57 105H283M83 116H257M111 130H229" />
              <path d="M57 145H283M57 174H283M170 42V202M27 202H313M41 214H299" />
              <path className="drawing-accent" d="M170 42L283 105M170 68L257 116M111 130L229 202" />
              <circle cx="170" cy="42" r="4" />
              <circle cx="57" cy="105" r="3" />
              <circle cx="283" cy="105" r="3" />
              <path className="drawing-measure" d="M35 105V202M31 105H39M31 202H39M305 105V202M301 105H309M301 202H309" />
            </svg>
            <div className="dashboard-drawing-caption">FRAME / ELEVATION</div>
          </div>
          <section className="dashboard-summary" aria-label="Portfolio status and metrics">
            <div className="dashboard-section-heading">
              <div><span className="dashboard-section-index">01</span><h3>Portfolio overview</h3></div>
              <span>Current workload</span>
            </div>
            <div className="dashboard-metrics">
              <PortfolioMetric icon={<Folder className="h-4 w-4" />} label="Active projects" value={projects.length} detail="Top-level sites" tone="blue" />
              <PortfolioMetric icon={<Layers3 className="h-4 w-4" />} label="Building packages" value={portfolio.packageCount} detail="Across your portfolio" tone="violet" />
              <PortfolioMetric icon={<CircleAlert className="h-4 w-4" />} label="Needs attention" value={portfolio.needsAttention} detail={`${portfolio.blocked} blocked · ${portfolio.overdue} overdue`} tone={portfolio.needsAttention ? 'rose' : 'emerald'} />
              <PortfolioMetric icon={<TrendingUp className="h-4 w-4" />} label="Phase progress" value={`${portfolio.progress}%`} detail={`${portfolio.phaseCount} tracked phases`} tone="emerald" progress={portfolio.progress} />
            </div>
          </section>
        </div>
      </section>

      <>
          {loadError && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between"><span>{loadError}</span><button onClick={fetchProjects} className="rounded-lg border border-rose-400/20 px-3 py-1.5 text-xs font-semibold hover:bg-rose-500/10">Try again</button></div>}
          <section className="project-register">
          <div className="dashboard-section-heading project-register-heading">
            <div><span className="dashboard-section-index">02</span><h3>Project register</h3></div>
            <span>Browse and open a project workspace</span>
          </div>
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

          {loading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading projects">
              {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" />)}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-slate-400"><Folder className="h-5 w-5" /></div>
              <h3 className="font-semibold text-white">{projects.length ? 'No matching projects' : 'Your portfolio is ready'}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                {projects.length ? 'Try a different search or clear your filters.' : 'Create a site project to start organizing structures, phases, and engineering files.'}
              </p>
              {!projects.length && canCreate && <button onClick={() => setShowModal(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400"><Plus className="h-4 w-4" /> Create your first project</button>}
            </div>
          ) : (
            <>
            <div className="portfolio-results-heading mb-3 flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-300">Showing <span className="ml-1 font-normal text-slate-500">{filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}</span></span>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project, projectIndex) => {
                const hasSubProjects = project.subProjects && project.subProjects.length > 0;
                const isExpanded = !!expandedProjects[project.id];

                // Calculate cumulative total assets (parent + sub-projects)
                const directFilesCount = project.files?.length || 0;
                const subProjectsFilesCount = project.subProjects?.reduce(
                  (acc, sub) => acc + (sub.files?.length || 0),
                  0
                ) || 0;
                const totalAssets = directFilesCount + subProjectsFilesCount;

                const projectStatus = statusFor(project);
                return (
                  <div
                    key={project.id}
                    onClick={() => onSelectProject(project.id)}
                    onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelectProject(project.id); } }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${project.title}`}
                    className="portfolio-card group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-blue-500/40 hover:shadow-xl hover:shadow-blue-950/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    <span aria-hidden="true" className="project-card-index">{String(projectIndex + 1).padStart(2, '0')}</span>
                    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent opacity-0 transition group-hover:opacity-100" />
                    <div className="space-y-3">
                      {/* Top Badges & Action Buttons */}
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
                            {project.projectType}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${projectStatus.style}`}>{projectStatus.label}</span>
                          {hasSubProjects && (
                            <button
                              onClick={(e) => toggleExpand(e, project.id)}
                              className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white transition flex items-center gap-1 text-[10px]"
                            >
                              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              <span>{project.subProjects!.length} packages</span>
                            </button>
                          )}
                        </div>

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
                          <div aria-hidden="true" className="p-1.5 text-slate-500 group-hover:text-slate-300">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <div>
                        <h3 className="text-white font-semibold text-base group-hover:text-blue-400 transition">
                          {project.title}
                        </h3>
                        <p className="text-slate-400 text-xs line-clamp-2 mt-1">
                          {project.description || 'No description provided.'}
                        </p>
                      </div>

                      {/* Phase Tracker Bar */}
                      <div className="pt-1">
                        <PhaseTracker phases={project.phases || []} />
                      </div>

                      {/* Location & Files */}
                      <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-500" />
                          <span>{project.location}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-slate-500" />
                          <span>{totalAssets} assets</span>
                        </div>
                      </div>

                      {/* Accordion List for Sub-Projects inside Card */}
                      {hasSubProjects && isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 pl-2">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase">Sub-Projects</span>
                          {project.subProjects!.map((sub) => (
                            <div
                              key={sub.id}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); onSelectProject(sub.id); } }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectProject(sub.id);
                              }}
                              className="space-y-1 rounded-lg border border-slate-800 bg-slate-950 p-2.5 transition hover:border-blue-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                            >
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-medium text-slate-200">{sub.title}</span>
                                <span className="text-[10px] text-slate-500">{sub.location}</span>
                              </div>
                              <PhaseTracker phases={sub.phases || []} />
                            </div>
                          ))}
                        </div>
                      )}
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
                );
              })}
            </div>
            </>
          )}
          </section>
      </>

      {/* Create Project Modal */}
      {showModal && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:p-6">
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

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Parent Project (Optional)
                </label>
                <select
                  value={parentProjectId}
                  onChange={(e) => setParentProjectId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">None (Top-Level Parent Project)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.location})
                    </option>
                  ))}
                </select>
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
        </ModalPortal>
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

type PortfolioMetricProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
  tone: 'blue' | 'violet' | 'rose' | 'emerald';
  progress?: number;
};

const PortfolioMetric: React.FC<PortfolioMetricProps> = ({ icon, label, value, detail, tone, progress }) => {
  const tones = {
    blue: 'border-lime-400/20 bg-lime-400/10 text-lime-300',
    violet: 'border-lime-400/20 bg-lime-400/10 text-lime-300',
    rose: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
    emerald: 'border-lime-400/20 bg-lime-400/10 text-lime-300',
  };
  return (
    <article className="min-w-0 rounded-2xl border border-slate-700/70 bg-slate-950/55 p-3.5 backdrop-blur-sm sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium text-slate-400 sm:text-xs">{label}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}>{icon}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <strong className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{value}</strong>
        {progress !== undefined && <span className="pb-1 text-[10px] font-semibold text-lime-300">portfolio</span>}
      </div>
      <p className="mt-1 truncate text-[10px] text-slate-500 sm:text-[11px]">{detail}</p>
      {progress !== undefined && <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-lime-400 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>}
    </article>
  );
};
