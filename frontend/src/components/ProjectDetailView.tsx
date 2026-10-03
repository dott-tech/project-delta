import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { EditProjectModal } from './EditProjectModal';
import { 
  ArrowLeft, Upload, FileText, Trash2, MapPin, 
  Calendar, Download, Building, Edit3, History, User 
} from 'lucide-react';

interface ProjectFile {
  id: string;
  fileName: string;
  fileType: 'PDF' | 'CAD' | 'IMAGE';
  fileUrl: string;
  fileSize: number;
  createdAt: string;
}

interface UserSummary {
  id: string;
  name: string;
  email: string;
}

interface ProjectDetails {
  id: string;
  title: string;
  description?: string;
  projectType: string;
  location: string;
  isArchived?: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: UserSummary;
  updatedBy?: UserSummary;
  files: ProjectFile[];
}

export const ProjectDetailView: React.FC<{ projectId: string; onBack: () => void }> = ({ projectId, onBack }) => {
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const isAdmin = user?.role === 'ADMIN';
  const canEdit = isAdmin || user?.role === 'TEAM_MEMBER';

  const fetchProjectDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/projects/${projectId}`);
      setProject(res.data);
    } catch (err) {
      console.error('Failed to load project details', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectDetails();
  }, [projectId]);

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      setUploading(true);
      await api.post(`/projects/${projectId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSelectedFile(null);
      fetchProjectDetails();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to upload asset');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    try {
      await api.delete(`/files/${fileId}`);
      fetchProjectDetails();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete file');
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>;
  if (!project) return <div className="p-8 text-center text-red-400 text-sm">Project not found.</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
              {project.projectType}
            </span>
            <h2 className="text-xl font-bold text-white mt-1">{project.title}</h2>
          </div>
        </div>

        {canEdit && (
          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2.5 rounded-xl font-medium transition"
          >
            <Edit3 className="w-3.5 h-3.5" /> Edit Project
          </button>
        )}
      </div>

      {/* Info Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-blue-400" />
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Location</p>
            <p className="text-sm font-medium text-slate-200">{project.location}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Building className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Description</p>
            <p className="text-sm font-medium text-slate-200 line-clamp-1">{project.description || 'N/A'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Created</p>
            <p className="text-sm font-medium text-slate-200">{new Date(project.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* File Upload */}
          {canEdit && (
            <form onSubmit={handleFileUpload} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
              <input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 flex-1"
              />
              <button
                type="submit"
                disabled={!selectedFile || uploading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-4 py-2 rounded-xl transition font-medium"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Uploading...' : 'Upload Asset'}
              </button>
            </form>
          )}

          {/* Files List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" /> Project Files
            </h3>

            {project.files.length === 0 ? (
              <p className="text-slate-500 text-xs py-4 text-center">No files attached yet.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {project.files.map((file) => (
                  <div key={file.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold px-2 py-1 bg-slate-800 text-slate-300 border border-slate-700 rounded-md">
                        {file.fileType}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-white">{file.fileName}</p>
                        <p className="text-[10px] text-slate-500">{(file.fileSize / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`http://localhost:5000${file.fileUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="p-1.5 bg-slate-800 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Audit Log Sidebar */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 h-fit">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" /> Audit Log
          </h3>

          <div className="space-y-4 border-l-2 border-slate-800 ml-2 pl-4 text-xs">
            <div className="relative">
              <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-slate-900" />
              <p className="text-slate-200 font-medium">Project Created</p>
              <p className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                <User className="w-3 h-3 text-slate-500" /> {project.createdBy?.name || 'System'}
              </p>
              <p className="text-slate-500 text-[10px]">{new Date(project.createdAt).toLocaleString()}</p>
            </div>

            {project.updatedBy && project.updatedAt && (
              <div className="relative">
                <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-4 ring-slate-900" />
                <p className="text-slate-200 font-medium">Last Updated</p>
                <p className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3 text-slate-500" /> {project.updatedBy.name}
                </p>
                <p className="text-slate-500 text-[10px]">{new Date(project.updatedAt).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <EditProjectModal
          project={{ ...project, isArchived: project.isArchived ?? false }}
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={fetchProjectDetails}
        />
      )}
    </div>
  );
};