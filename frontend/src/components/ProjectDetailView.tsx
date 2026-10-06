import React, { useEffect, useState, useRef } from 'react';
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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // --- DELETE PROJECT ---
  const handleDeleteProject = async () => {
    if (!project) return;
    if (!window.confirm(`Are you sure you want to permanently delete "${project.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/projects/${project.id}`);
      onBack();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete project');
    }
  };

  // --- S3 UPLOAD WITH PROGRESS TRACKING ---
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      setUploading(true);
      setUploadProgress(0);

      // Determine asset category
      let category: 'PDF' | 'CAD' | 'IMAGE' = 'PDF';
      if (selectedFile.type.startsWith('image/')) {
        category = 'IMAGE';
      } else if (
        selectedFile.name.toLowerCase().endsWith('.dwg') || 
        selectedFile.name.toLowerCase().endsWith('.dxf')
      ) {
        category = 'CAD';
      }

      // Request presigned URL from API
      const res = await api.post(`/projects/${projectId}/upload-url`, {
        fileName: selectedFile.name,
        contentType: selectedFile.type || 'application/octet-stream',
      });

      const { uploadUrl, fileUrl, fileKey } = res.data;

      // Upload directly to S3 via XHR
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', selectedFile.type || 'application/octet-stream');

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during file upload'));
        xhr.send(selectedFile);
      });

      // Register file record in database
      await api.post(`/projects/${projectId}/files`, {
        fileName: selectedFile.name,
        fileType: category,
        fileUrl,
        fileKey,
        fileSize: selectedFile.size,
      });

      // Reset state and input form
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchProjectDetails();
    } catch (err: any) {
      console.error('File upload error:', err);
      alert(err.response?.data?.error || err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
  try {
    await api.delete(`/projects/${projectId}/files/${fileId}`);
    // Refresh project details or update UI state
    fetchProjectDetails();
  } catch (err: any) {
    console.error('Failed to delete file:', err);
    alert(err.response?.data?.error || 'Failed to delete file');
  }
};

  if (loading) return <div className="p-8 text-center text-slate-500 text-sm">Loading project...</div>;
  if (!project) return <div className="p-8 text-center text-red-400 text-sm">Project not found.</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack} 
            className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
              {project.projectType}
            </span>
            <h2 className="text-xl font-bold text-white mt-1">{project.title}</h2>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2.5 rounded-xl font-medium transition"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit Project
            </button>
          )}

          {isAdmin && (
            <button
              onClick={handleDeleteProject}
              className="flex items-center gap-2 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/20 text-xs px-4 py-2.5 rounded-xl font-medium transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Project
            </button>
          )}
        </div>
      </div>

      {/* Info Cards */}
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

      {/* Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          
          {/* Direct File Upload */}
          {canEdit && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <form onSubmit={handleFileUpload} className="flex items-center gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  disabled={uploading}
                  className="text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 flex-1"
                />
                <button
                  type="submit"
                  disabled={!selectedFile || uploading}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-4 py-2 rounded-xl transition font-medium shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? 'Uploading...' : 'Upload Asset'}
                </button>
              </form>

              {/* Progress Bar */}
              {uploadProgress !== null && (
                <div className="w-full pt-1">
                  <div className="flex justify-between text-[11px] font-medium text-slate-400 mb-1">
                    <span>Uploading directly to S3...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Project Files List */}
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
                        href={file.fileUrl.startsWith('http') ? file.fileUrl : `http://localhost:5000${file.fileUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                        title="Download / View File"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="p-1.5 bg-slate-800 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-lg"
                          title="Delete File"
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

        {/* Audit Log */}
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