import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/useAuth';
import type { Project, ProjectFile, PhaseStatus, ProjectRole } from '../types/project';
import { getApiErrorMessage } from '../utils/apiError';
import { beginActionLoading } from '../utils/actionLoading';
import { PhaseTracker } from './PhaseTracker';
import { ProjectActivityLog } from './ProjectActivityLog';
import { ModalPortal } from './ModalPortal';
import { LoadingCard } from './LoadingCard';
import { 
  ArrowLeft, FileText, Upload, Trash2, Download, Eye, X,
  Users, Plus, Edit3, AlertCircle, Shield, Settings, Save, ArrowRight, Building2
} from 'lucide-react';

const PdfDocumentViewer = React.lazy(() =>
  import('./PdfDocumentViewer').then((module) => ({ default: module.PdfDocumentViewer }))
);

const ENGINEERING_PHASES = ['Concept Design', 'Design Calculation', 'Modeling', 'Sheeting'] as const;

interface Props {
  projectId: string;
  onBack: () => void;
  onSelectSubProject?: (subProjectId: string) => void;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface PreviewPayload {
  contentType: string;
  data: string;
}

const decodePreviewBase64 = (base64: string): Uint8Array<ArrayBuffer> => {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((base64.length * 3) / 4 - padding);
  const chunkSize = 64 * 1024; // divisible by four, so each chunk decodes independently
  let offset = 0;
  for (let index = 0; index < base64.length; index += chunkSize) {
    const decoded = atob(base64.slice(index, index + chunkSize));
    for (let byteIndex = 0; byteIndex < decoded.length; byteIndex += 1) {
      bytes[offset] = decoded.charCodeAt(byteIndex);
      offset += 1;
    }
  }
  return bytes;
};

export const ProjectDetailView: React.FC<Props> = ({
  projectId,
  onBack,
  onSelectSubProject
}) => {
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit Project Modal / State
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editProjectType, setEditProjectType] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [updatingProject, setUpdatingProject] = useState(false);

  // Building / Facility Package Creation Modal State
  const [showBuildingModal, setShowBuildingModal] = useState(false);
  const [buildingCode, setBuildingCode] = useState('');
  const [buildingTitle, setBuildingTitle] = useState('');
  const [facilityType, setFacilityType] = useState('Warehouse Structure');
  const [buildingLocation, setBuildingLocation] = useState('');
  const [buildingDesc, setBuildingDesc] = useState('');
  const [creatingBuilding, setCreatingBuilding] = useState(false);

  // Phase Creation State
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');
  const availablePhaseNames = ENGINEERING_PHASES.filter(
    (phaseName) => !project?.phases?.some((phase) => phase.name === phaseName)
  );

  // Team Access State
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState<ProjectRole>('VIEWER');
  const [usersList, setUsersList] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingMember, setEditingMember] = useState<{ userId: string; name: string; accountRole: string } | null>(null);

  // File Uploading & Role Permissions State
  const [uploading, setUploading] = useState(false);
  const [selectedFileRoles, setSelectedFileRoles] = useState<ProjectRole[]>(['VIEWER']);

  // File Permission Edit Modal State
  const [editingFile, setEditingFile] = useState<{ id: string; name: string; roles: ProjectRole[] } | null>(null);
  const [savingFilePermissions, setSavingFilePermissions] = useState(false);
  const [reviewingFile, setReviewingFile] = useState<ProjectFile | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [filePreview, setFilePreview] = useState<{
    id: string;
    name: string;
    contentType: string;
    url: string | null;
    data: Uint8Array | null;
    text: string | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    const previewUrl = filePreview?.url;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [filePreview?.url]);

  const fetchProject = useCallback(async () => {
    try {
      const response = await api.get(`/projects/${projectId}`);
      setProject(response.data);
      setError(null);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to load project details'));
    } finally {
      setLoadedProjectId(projectId);
      setLoading(false);
    }
  }, [projectId]);

  const refreshProject = () => {
    setLoading(true);
    setError(null);
    void fetchProject();
  };

  useEffect(() => {
    void fetchProject();
  }, [fetchProject]);

  // Safely extract active logged-in User ID across all potential JWT keys
  const currentUserId = user?.id;
  const isAdmin = user?.role === 'ADMIN';

  // Find user assignment record on THIS project
  const currentUserAssignment = project?.members?.find(
    (m) => m.user.id === currentUserId || m.userId === currentUserId
  );
  const userProjectRole = user?.role === 'CLIENT'
    ? 'VIEWER'
    : project?.effectiveProjectRole || currentUserAssignment?.role;

  // Has write access if system ADMIN OR assigned as EDITOR/MANAGER
  const canEdit = isAdmin || userProjectRole === 'EDITOR' || userProjectRole === 'MANAGER';
  // Has manager access if system ADMIN OR assigned as MANAGER
  const canManage = isAdmin || userProjectRole === 'MANAGER';
  const canDownloadFiles = isAdmin || (user?.role === 'TEAM_MEMBER' && userProjectRole === 'EDITOR');
  const selectedAccountRole = editingMember?.accountRole || usersList.find((availableUser) => availableUser.id === memberUserId)?.role;
  const selectedUserIsClient = selectedAccountRole === 'CLIENT';

  // Open Edit Project Modal with populated inputs
  const handleOpenEditProject = () => {
    if (!project) return;
    setEditTitle(project.title);
    setEditProjectType(project.projectType);
    setEditLocation(project.location);
    setEditDescription(project.description || '');
    setShowEditProjectModal(true);
  };

  // Submit Updated Project Details
  const handleSaveProjectDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim() || !editProjectType.trim() || !editLocation.trim()) return;

    try {
      setUpdatingProject(true);
      await api.patch(`/projects/${projectId}`, {
        title: editTitle,
        projectType: editProjectType,
        location: editLocation,
        description: editDescription,
      });
      setShowEditProjectModal(false);
      refreshProject();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to update project details'));
    } finally {
      setUpdatingProject(false);
    }
  };

  // Open Building Package Creation Modal with default pre-filled location
  const handleOpenBuildingModal = () => {
    if (!project) return;
    setBuildingCode('');
    setBuildingTitle('');
    setFacilityType('Warehouse Structure');
    setBuildingLocation(project.location || '');
    setBuildingDesc('');
    setShowBuildingModal(true);
  };

  // Create Building Package (Sub-Project)
  const handleCreateBuildingPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingTitle.trim() || !buildingCode.trim()) return;

    try {
      setCreatingBuilding(true);
      const fullTitle = `[${buildingCode.toUpperCase()}] ${buildingTitle}`;

      await api.post('/projects', {
        title: fullTitle,
        projectType: facilityType,
        location: buildingLocation || project?.location || 'On-Site',
        description: buildingDesc,
        buildingCode: buildingCode.toUpperCase(),
        facilityType: facilityType,
        parentProjectId: projectId,
      });

      setShowBuildingModal(false);
      refreshProject();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to create building package'));
    } finally {
      setCreatingBuilding(false);
    }
  };

  // Delete Entire Project
  const handleDeleteProject = async () => {
    if (!project) return;
    const confirmDelete = confirm(
      `Are you sure you want to PERMANENTLY delete project "${project.title}"? This cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      await api.delete(`/projects/${projectId}`);
      onBack();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to delete project'));
    }
  };

  // Toggle role in upload checklist
  const handleToggleUploadRole = (role: ProjectRole) => {
    setSelectedFileRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  // Toggle role in file edit permissions modal
  const handleToggleEditRole = (role: ProjectRole) => {
    if (!editingFile) return;
    const currentRoles = editingFile.roles;
    const updatedRoles = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];

    setEditingFile({ ...editingFile, roles: updatedRoles });
  };

  // Fetch users for dropdown when modal opens for adding new members
  const handleOpenMemberModal = async () => {
    setEditingMember(null);
    try {
      setLoadingUsers(true);
      const { data } = await api.get(`/projects/${projectId}/available-users`);
      setUsersList(data);
      if (data.length > 0) {
        setMemberUserId(data[0].id);
        if (data[0].role === 'CLIENT') setMemberRole('VIEWER');
      }
      setShowMemberModal(true);
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to load user directory for role assignment'));
    } finally {
      setLoadingUsers(false);
    }
  };

  // Open Edit Role modal for an existing assigned member
  const handleEditMemberRole = (userId: string, userName: string, currentRole: ProjectRole, accountRole: string) => {
    setEditingMember({ userId, name: userName, accountRole });
    setMemberUserId(userId);
    setMemberRole(accountRole === 'CLIENT' ? 'VIEWER' : currentRole);
    setShowMemberModal(true);
  };

  // Remove Team Member from Project
  const handleRemoveMember = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to remove ${userName} from this project?`)) return;

    try {
      await api.delete(`/projects/${projectId}/members/${userId}`);
      refreshProject();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to remove team member'));
    }
  };

  // Update Phase Status
  const handleUpdatePhaseStatus = async (phaseId: string, newStatus: PhaseStatus) => {
    if (!canEdit) {
      alert('You have read-only access to this project.');
      return;
    }
    try {
      await api.patch(`/projects/${projectId}/phases/${phaseId}`, { status: newStatus });
      refreshProject();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to update phase status'));
    }
  };

  // Create New Phase
  const handleCreatePhase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhaseName.trim()) return;

    try {
      await api.post(`/projects/${projectId}/phases`, {
        name: newPhaseName,
        status: 'NOT_STARTED',
        progressPercent: 0,
      });
      setNewPhaseName('');
      setShowPhaseModal(false);
      refreshProject();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to create phase'));
    }
  };

  // Assign or Edit Team Member Role
  const handleAssignMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberUserId.trim()) return;

    try {
      await api.post(`/projects/${projectId}/members`, {
        userId: memberUserId,
        role: memberRole,
      });
      setMemberUserId('');
      setEditingMember(null);
      setShowMemberModal(false);
      refreshProject();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to assign or update team member role'));
    }
  };

  // S3 Presigned URL File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const finishLoading = beginActionLoading('Uploading project file');
    try {
      setUploading(true);
      const { data } = await api.post(`/projects/${projectId}/upload-url`, {
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      });

      await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': data.contentType },
        body: file,
      });

      await api.post(`/projects/${projectId}/files`, {
        fileName: file.name,
        fileType: file.type,
        fileUrl: data.fileUrl,
        fileSize: file.size,
        allowedRoles: selectedFileRoles.length > 0 ? selectedFileRoles : ['VIEWER'],
      });

      refreshProject();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'File upload failed'));
    } finally {
      setUploading(false);
      finishLoading();
    }
  };

  const handleSubmitFileForReview = async (file: ProjectFile) => {
    try {
      await api.post(`/projects/${projectId}/files/${file.id}/submit-review`);
      refreshProject();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to submit file for review'));
    }
  };

  const handleReviewDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!reviewingFile) return;
    if (decision === 'REJECTED' && !reviewComment.trim()) {
      alert('Add a reason so the uploader knows what to fix.');
      return;
    }

    try {
      setSavingReview(true);
      await api.post(`/projects/${projectId}/files/${reviewingFile.id}/review`, {
        decision,
        comment: reviewComment,
      });
      setReviewingFile(null);
      setReviewComment('');
      refreshProject();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, `Failed to ${decision.toLowerCase()} file`));
    } finally {
      setSavingReview(false);
    }
  };

  // Update existing file permission roles
  const handleSaveFilePermissions = async () => {
    if (!editingFile) return;
    if (editingFile.roles.length === 0) {
      alert('At least one role must be selected.');
      return;
    }

    try {
      setSavingFilePermissions(true);
      await api.patch(`/projects/${projectId}/files/${editingFile.id}/permissions`, {
        allowedRoles: editingFile.roles,
      });
      setEditingFile(null);
      refreshProject();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to update file permissions.'));
    } finally {
      setSavingFilePermissions(false);
    }
  };

  // Delete File
  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    try {
      await api.delete(`/projects/${projectId}/files/${fileId}`);
      refreshProject();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to delete file'));
    }
  };

  const handleDownloadFile = async (file: ProjectFile) => {
    if (!file) return;
    if (file.fileUrl?.startsWith('/uploads/')) {
      try {
        const response = await api.get(`/files/${file.id}/download`, { responseType: 'blob' });
        const objectUrl = URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = file.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (err: unknown) {
        alert(getApiErrorMessage(err, 'File download failed'));
      }
      return;
    }
    const downloadUrl = file.downloadUrl;
    if (downloadUrl) window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  };

  const handlePreviewFile = async (file: ProjectFile) => {
    const extension = file.fileName.split('.').pop()?.toLowerCase() || '';
    const contentType = extension === 'pdf'
      ? 'application/pdf'
      : ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif', txt: 'text/plain', csv: 'text/csv' } as Record<string, string>)[extension];
    if (!contentType) return;

    setFilePreview({ id: file.id, name: file.fileName, contentType, url: null, data: null, text: null, error: null });
    try {
      const response = await api.get<PreviewPayload>(`/projects/${projectId}/files/${file.id}/preview`, { responseType: 'json' });
      const previewBytes = decodePreviewBase64(response.data.data);
      if (contentType === 'application/pdf') {
        setFilePreview((current) => current?.id === file.id ? { ...current, data: previewBytes } : current);
      } else if (contentType === 'text/plain' || contentType === 'text/csv') {
        const text = new TextDecoder().decode(previewBytes);
        setFilePreview((current) => current?.id === file.id ? { ...current, text } : current);
      } else {
        const objectUrl = URL.createObjectURL(new Blob([previewBytes], { type: contentType }));
        setFilePreview((current) => {
          if (!current || current.id !== file.id) {
            URL.revokeObjectURL(objectUrl);
            return current;
          }
          return { ...current, url: objectUrl };
        });
      }
    } catch (err: unknown) {
      setFilePreview((current) => current?.id === file.id
        ? { ...current, error: getApiErrorMessage(err, 'Could not preview this file.') }
        : current);
    }
  };

  if (loading || loadedProjectId !== projectId) {
    return (
      <div className="project-loading-screen">
        <LoadingCard
          label="Opening project workbench"
          caption="Loading project details, files, and team access"
        />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-4 bg-red-950/50 border border-red-800 text-red-200 text-sm rounded-lg flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-red-400" />
        <span>{error || 'Project not found'}</span>
      </div>
    );
  }

  return (
    <div className="project-detail-page space-y-6">
      {/* Header & Navigation */}
      <div className="project-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-xl transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              {project.parentProject && (
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                  <Building2 className="h-3 w-3 text-blue-400" /> {project.parentProject.title}
                </span>
              )}
              <span className="text-xs px-2.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full font-semibold">
                {project.projectType}
              </span>
              <span className="text-xs text-slate-500">{project.location}</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{project.title}</h1>
          </div>
        </div>

        {/* Action Buttons */}
        {canManage && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleOpenBuildingModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition shadow-lg shadow-blue-600/20"
            >
              <Building2 className="w-3.5 h-3.5" />
              Add Building / Structure
            </button>
            <button
              onClick={handleOpenEditProject}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-medium rounded-lg transition"
            >
              <Edit3 className="w-3.5 h-3.5 text-blue-400" />
              Edit Site
            </button>
            <button
              onClick={handleDeleteProject}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 hover:text-red-100 border border-red-800/80 text-xs font-medium rounded-lg transition"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              Delete Site
            </button>
          </div>
        )}
      </div>

      <section className="project-snapshot grid grid-cols-2 gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:grid-cols-4 sm:p-5">
        <div className="col-span-2 sm:col-span-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Project scope</span>
          <p className="mt-1 text-sm leading-6 text-slate-300">{project.description || 'No master site scope or description provided.'}</p>
        </div>
        <DetailMetric label="Structures" value={project.subProjects?.length || 0} />
        <DetailMetric label="Tracked phases" value={project.phases?.length || 0} />
        <DetailMetric label="Files & assets" value={project.files?.length || 0} />
        <DetailMetric label="Project type" value={project.facilityType || project.projectType} />
      </section>

      {/* Workbench Grid Layout */}
      <div className="workbench-grid grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column (Building Packages, Site Phases, Files) */}
        <div className="workbench-primary lg:col-span-2 space-y-6">

          {/* Facility Buildings & Structures Grid */}
          <div className="workbench-panel bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-white text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-400" /> Building & Structure Deliverables
                </h3>
                <p className="text-xs text-slate-400">Warehouses, processing units, and site sub-structures with dedicated CAD/blueprints</p>
              </div>
              {canManage && (
                <button
                  onClick={handleOpenBuildingModal}
                  className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Structure
                </button>
              )}
            </div>

            {!project.subProjects || project.subProjects.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                No individual building packages or structures added to this site program yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {project.subProjects.map((bld) => (
                  <div
                    key={bld.id}
                    className="p-4 bg-slate-950 border border-slate-800/80 rounded-xl space-y-3 hover:border-blue-500/40 transition flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded font-bold">
                          {bld.buildingCode || 'FACILITY'}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {bld.projectType}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-white pt-1">{bld.title}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2">
                        {bld.description || 'No package scope specified.'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-900 space-y-3">
                      <PhaseTracker phases={bld.phases || []} />

                      {onSelectSubProject && (
                        <button
                          onClick={() => onSelectSubProject(bld.id)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 bg-slate-900 hover:bg-blue-600 text-slate-200 hover:text-white text-xs font-medium rounded-lg border border-slate-800 hover:border-blue-500 transition"
                        >
                          Open Building Blueprint Workbench <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Engineering Phase Management */}
          <div className="workbench-panel bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-white text-base">Engineering Phases</h3>
                <p className="text-xs text-slate-400">Track concept design, calculations, modeling, and sheeting.</p>
              </div>
              {canEdit && availablePhaseNames.length > 0 && (
                <button
                  onClick={() => setShowPhaseModal(true)}
                  className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Phase
                </button>
              )}
            </div>

            {/* Interactive Progress Bar Component */}
            <PhaseTracker
              phases={project.phases || []}
              projectId={project.id}
              userProjectRole={userProjectRole}
              onPhaseUpdated={fetchProject}
            />

            {!project.phases || project.phases.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                No site phases configured yet.
              </div>
            ) : (
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Phase Status Controls
                </span>
                {project.phases.map((phase) => (
                  <div
                    key={phase.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-950 border border-slate-800/80 rounded-xl gap-3"
                  >
                    <div>
                      <span className="text-sm font-medium text-white">{phase.name}</span>
                      {phase.notes && <p className="text-xs text-slate-400 mt-0.5">{phase.notes}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as PhaseStatus[]).map((status) => (
                          <button
                            key={status}
                            disabled={!canEdit}
                            onClick={() => handleUpdatePhaseStatus(phase.id, status)}
                            className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium transition ${
                              phase.status === status
                                ? status === 'COMPLETED'
                                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                  : status === 'IN_PROGRESS'
                                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                  : status === 'BLOCKED'
                                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                  : 'bg-slate-800 text-slate-200 border-slate-700'
                                : 'bg-slate-900/50 text-slate-500 border-slate-800 hover:text-slate-300'
                            } ${!canEdit ? 'cursor-not-allowed opacity-75' : ''}`}
                          >
                            {status.replace('_', ' ')}
                          </button>
                        ))}
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* S3 File Uploads & Per-File Role Visibility */}
          <div className="workbench-panel file-library-panel bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-white text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" /> Site Assets & CAD Documents
                </h3>
                <p className="text-xs text-slate-400">Master site plans, environmental assessments, and permits</p>
              </div>

              {canEdit && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                    <span className="font-semibold text-slate-300">Visible to:</span>
                    {(['MANAGER', 'EDITOR', 'VIEWER'] as ProjectRole[]).map((r) => (
                      <label key={r} className="flex items-center gap-1 cursor-pointer hover:text-white">
                        <input
                          type="checkbox"
                          checked={selectedFileRoles.includes(r)}
                          onChange={() => handleToggleUploadRole(r)}
                          className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                        />
                        <span>{r}</span>
                      </label>
                    ))}
                  </div>

                  <label className="cursor-pointer flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg border border-slate-700 transition font-medium">
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? 'Uploading...' : 'Upload Asset'}
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.dwg,.dxf,.dgn,.rvt,.rfa,.ifc,.ifczip,.nwc,.nwd,.nwf,.skp,.obj,.stl,.step,.stp,.iges,.igs,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf" onChange={handleFileUpload} disabled={uploading} className="hidden" />
                  </label>
                </div>
              )}
            </div>

            {!project.files || project.files.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                No master site assets uploaded to this project yet.
              </div>
            ) : (
              <div className="space-y-2">
                {project.files.map((file) => {
                  const allowedRolesList: ProjectRole[] = file.allowedRoles || ['MANAGER'];
                  const fileExtension = file.fileName.split('.').pop()?.toLowerCase() || '';
                  const canPreview = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'txt', 'csv'].includes(fileExtension);

                  return (
                    <div
                      key={file.id}
                      className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800/80 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <div>
                          <p className="text-sm font-medium text-white">{file.fileName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-slate-500 uppercase font-semibold">{file.fileType}</span>
                            <span className="text-[10px] text-slate-600">•</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${
                              file.reviewStatus === 'APPROVED'
                                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                                : file.reviewStatus === 'REJECTED'
                                  ? 'border-rose-400/20 bg-rose-400/10 text-rose-200'
                                  : file.reviewStatus === 'PENDING_REVIEW'
                                    ? 'border-violet-400/20 bg-violet-400/10 text-violet-200'
                                    : 'border-slate-500/20 bg-slate-500/10 text-slate-300'
                            }`}>
                              {(file.reviewStatus || 'APPROVED').replace('_', ' ')}
                            </span>
                            <div className="flex items-center gap-1">
                              {allowedRolesList.map((role) => (
                                <span
                                  key={role}
                                  className="text-[9px] px-1.5 py-0.2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-mono font-bold"
                                >
                                  {role}
                                </span>
                              ))}
                            </div>
                          </div>
                          {file.reviewStatus === 'REJECTED' && file.reviewComment && (
                            <p className="mt-1 max-w-xl text-[11px] text-rose-200/90">Changes requested: {file.reviewComment}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {canEdit && file.uploadedByUserId === currentUserId &&
                          (file.reviewStatus === 'DRAFT' || file.reviewStatus === 'REJECTED') && (
                            <button
                              type="button"
                              onClick={() => handleSubmitFileForReview(file)}
                              className="rounded-lg border border-violet-400/25 bg-violet-400/10 px-2.5 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-400/20"
                            >
                              Submit for review
                            </button>
                          )}
                        {canManage && file.reviewStatus === 'PENDING_REVIEW' && (
                          <button
                            type="button"
                            onClick={() => { setReviewingFile(file); setReviewComment(''); }}
                            className="rounded-lg border border-violet-400/25 bg-violet-400/10 px-2.5 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-400/20"
                          >
                            Review
                          </button>
                        )}
                        {canPreview && (
                          <button
                            type="button"
                            onClick={() => handlePreviewFile(file)}
                            aria-label={`Preview ${file.fileName}`}
                            title="Preview file"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-xs font-semibold text-blue-200 transition hover:border-blue-400/60 hover:bg-blue-500/20"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Preview</span>
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => setEditingFile({ id: file.id, name: file.fileName, roles: allowedRolesList })}
                            title="Edit Allowed Roles"
                            className="p-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-lg transition"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDownloadFiles && (
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(file)}
                            aria-label={`Download ${file.fileName}`}
                            title="Download file"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-600 hover:text-white"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Download</span>
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => handleDeleteFile(file.id)}
                            className="p-1.5 bg-slate-900 border border-slate-800 hover:border-red-900/50 text-slate-400 hover:text-red-400 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {user?.role !== 'CLIENT' && <ProjectActivityLog projectId={projectId} />}
        </div>

        {/* Right Sidebar Column (Team Access & RBAC) */}
        <div className="workbench-sidebar space-y-6">
          <div className="workbench-panel bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-white text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" /> Site Team Access
              </h3>
              {canManage && (
                <button
                  onClick={handleOpenMemberModal}
                  disabled={loadingUsers}
                  className="text-xs text-blue-400 hover:underline font-medium disabled:opacity-50"
                >
                  {loadingUsers ? 'Loading...' : '+ Assign Role'}
                </button>
              )}
            </div>

            {!project.members || project.members.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No assigned team members.</p>
            ) : (
              <div className="space-y-3">
                {project.members.map((m) => (
                  <div key={m.id} className="flex justify-between items-center text-xs p-2.5 bg-slate-950 border border-slate-800/80 rounded-xl">
                    <div>
                      <p className="text-white font-medium">{m.user?.name || 'Assigned User'}</p>
                      <p className="text-slate-500 text-[10px]">{m.user?.email || ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 rounded font-mono uppercase text-[10px]">
                        {m.role}
                      </span>
                      {canManage && (
                        <>
                          <button
                            onClick={() => handleEditMemberRole(m.user?.id || m.userId || '', m.user?.name || 'User', m.role, m.user?.role || 'TEAM_MEMBER')}
                            title="Edit Member Role"
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemoveMember(m.user?.id || m.userId || '', m.user?.name || 'User')}
                            title="Remove Member from Project"
                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Building Package Modal */}
      {showBuildingModal && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" /> Add Building / Structure Package
            </h3>

            <form onSubmit={handleCreateBuildingPackage} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Code</label>
                  <input
                    type="text"
                    required
                    placeholder="WH-01"
                    value={buildingCode}
                    onChange={(e) => setBuildingCode(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm uppercase focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Building Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Primary Warehouse"
                    value={buildingTitle}
                    onChange={(e) => setBuildingTitle(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Facility Type</label>
                  <select
                    value={facilityType}
                    onChange={(e) => setFacilityType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="Warehouse Structure">Warehouse Structure</option>
                    <option value="Manufacturing Plant">Manufacturing Plant</option>
                    <option value="Substation & Utilities">Substation & Utilities</option>
                    <option value="Admin & Office Block">Admin & Office Block</option>
                    <option value="Cold Storage & Silo">Cold Storage & Silo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Location / Zone</label>
                  <input
                    type="text"
                    value={buildingLocation}
                    onChange={(e) => setBuildingLocation(e.target.value)}
                    placeholder="Zone A"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Package Scope / Description</label>
                <textarea
                  rows={3}
                  placeholder="Structural steel erection, HVAC, electrical distribution layout..."
                  value={buildingDesc}
                  onChange={(e) => setBuildingDesc(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBuildingModal(false)}
                  className="px-3.5 py-1.5 text-xs bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingBuilding}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {creatingBuilding ? 'Adding...' : 'Add Structure Package'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Edit Project Modal */}
      {showEditProjectModal && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-blue-400" /> Edit Site Details
            </h3>

            <form onSubmit={handleSaveProjectDetails} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Project Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Project Type</label>
                  <input
                    type="text"
                    required
                    value={editProjectType}
                    onChange={(e) => setEditProjectType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                  <input
                    type="text"
                    required
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditProjectModal(false)}
                  className="px-3.5 py-1.5 text-xs bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingProject}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {updatingProject ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Edit File Permission Roles Modal */}
      {editingFile && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              Asset Visibility: {editingFile.name}
            </h3>
            <p className="text-xs text-slate-400">
              Choose which project roles can see this file entry. Downloads are restricted to admins and assigned editor team members.
            </p>

            <div className="space-y-2 py-2 border-y border-slate-800">
              {(['MANAGER', 'EDITOR', 'VIEWER'] as ProjectRole[]).map((role) => (
                <label key={role} className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700">
                  <span className="text-xs font-semibold text-white">{role}</span>
                  <input
                    type="checkbox"
                    checked={editingFile.roles.includes(role)}
                    onChange={() => handleToggleEditRole(role)}
                    className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                  />
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingFile(null)}
                className="px-3 py-1.5 text-xs bg-slate-800 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingFilePermissions}
                onClick={handleSaveFilePermissions}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {savingFilePermissions ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {reviewingFile && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div>
              <h3 className="text-base font-bold text-white">Review document</h3>
              <p className="mt-1 break-all text-xs text-slate-400">{reviewingFile.fileName}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Reason for changes <span className="text-slate-500">(required when requesting changes)</span>
              </label>
              <textarea
                rows={3}
                maxLength={2000}
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                placeholder="Tell the uploader what needs to be revised."
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => { setReviewingFile(null); setReviewComment(''); }}
                disabled={savingReview}
                className="rounded-lg bg-slate-800 px-3.5 py-2 text-xs text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleReviewDecision('REJECTED')}
                disabled={savingReview}
                className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3.5 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-50"
              >
                {savingReview ? 'Saving…' : 'Request changes'}
              </button>
              <button
                type="button"
                onClick={() => handleReviewDecision('APPROVED')}
                disabled={savingReview}
                className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-50"
              >
                {savingReview ? 'Saving…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Add Phase Modal */}
      {showPhaseModal && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-white">Add Phase</h3>
            <form onSubmit={handleCreatePhase} className="space-y-3">
              <select
                required
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="" disabled>Select an engineering phase</option>
                {availablePhaseNames.map((phaseName) => <option key={phaseName} value={phaseName}>{phaseName}</option>)}
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPhaseModal(false)}
                  className="px-3 py-1.5 text-xs bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium"
                >
                  Create Phase
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Assign / Edit Role Modal */}
      {showMemberModal && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-white">
              {editingMember ? `Edit Role for ${editingMember.name}` : 'Assign Project Role'}
            </h3>
            <form onSubmit={handleAssignMember} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Target User</label>
                {editingMember ? (
                  <div className="p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs font-medium">
                    {editingMember.name}
                  </div>
                ) : usersList.length === 0 ? (
                  <p className="text-xs text-amber-400">No available users found.</p>
                ) : (
                  <select
                    value={memberUserId}
                    onChange={(e) => {
                      const selectedUser = usersList.find((availableUser) => availableUser.id === e.target.value);
                      setMemberUserId(e.target.value);
                      if (selectedUser?.role === 'CLIENT') setMemberRole('VIEWER');
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email}) · {u.role === 'CLIENT' ? 'Client' : 'Team member'}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Role Permission</label>
                <select
                  value={selectedUserIsClient ? 'VIEWER' : memberRole}
                  onChange={(e) => setMemberRole(e.target.value as ProjectRole)}
                  disabled={selectedUserIsClient}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="VIEWER">VIEWER (Read-Only)</option>
                  <option value="EDITOR">EDITOR (Upload & Phase Control)</option>
                  <option value="MANAGER">MANAGER (Full Project Control)</option>
                </select>
                {selectedUserIsClient && <p className="mt-1 text-[11px] text-slate-500">Client accounts are always read-only.</p>}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMemberModal(false);
                    setEditingMember(null);
                  }}
                  className="px-3 py-1.5 text-xs bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editingMember && usersList.length === 0}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {editingMember ? 'Update Role' : 'Save Permission'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {filePreview && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${filePreview.name}`}
          onMouseDown={(event) => { if (event.target === event.currentTarget) setFilePreview(null); }}
        >
          <section className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <Eye className="h-4 w-4 shrink-0 text-blue-400" />
                <h2 className="truncate text-sm font-semibold text-white">{filePreview.name}</h2>
                <span className="hidden rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-400 sm:inline">Preview</span>
              </div>
              <button
                type="button"
                onClick={() => setFilePreview(null)}
                aria-label="Close preview"
                className="rounded-lg border border-slate-700 p-2 text-slate-400 transition hover:border-slate-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className={`min-h-0 flex-1 bg-slate-900/70 ${filePreview.contentType === 'application/pdf' || filePreview.contentType === 'text/plain' || filePreview.contentType === 'text/csv' ? 'overflow-auto' : 'flex items-center justify-center p-2 sm:p-4'}`}>
              {filePreview.error ? (
                <p role="alert" className="text-sm text-rose-300">{filePreview.error}</p>
              ) : filePreview.contentType === 'application/pdf' ? (
                filePreview.data ? (
                  <React.Suspense fallback={<p className="p-6 text-sm text-slate-400">Preparing PDF viewer…</p>}>
                    <PdfDocumentViewer data={filePreview.data} />
                  </React.Suspense>
                ) : <p className="p-6 text-sm text-slate-400">Loading preview…</p>
              ) : filePreview.contentType === 'text/plain' || filePreview.contentType === 'text/csv' ? (
                filePreview.text !== null
                  ? <pre className="whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed text-slate-200">{filePreview.text}</pre>
                  : <p className="p-6 text-sm text-slate-400">Loading preview…</p>
              ) : !filePreview.url ? (
                <div className="flex items-center gap-2 text-sm text-slate-400"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />Loading preview…</div>
              ) : (
                <img
                  src={filePreview.url}
                  alt={`Preview of ${filePreview.name}`}
                  className="max-h-full max-w-full rounded-lg object-contain"
                />
              )}
            </div>
          </section>
        </div>
        </ModalPortal>
      )}
    </div>
  );
};

const DetailMetric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="min-w-0 border-t border-slate-800 pt-3 sm:border-t-0 sm:pt-0">
    <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
    <span className="mt-1 block truncate text-sm font-semibold text-slate-200">{value}</span>
  </div>
);
