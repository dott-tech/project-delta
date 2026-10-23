import React, { useState } from 'react';
import { api } from '../api/client';
import { X, Edit3, Loader2 } from 'lucide-react';
import type { Project } from '../types/project';
import { getApiErrorMessage } from '../utils/apiError';
import { ModalPortal } from './ModalPortal';

interface EditProjectModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  availableProjects?: Project[];
}

export const EditProjectModal: React.FC<EditProjectModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <EditProjectModalForm key={`${props.project.id}:${props.project.updatedAt || ''}`} {...props} />;
};

const EditProjectModalForm: React.FC<EditProjectModalProps> = ({
  project,
  onClose,
  onSuccess,
  availableProjects = [],
}) => {
  const [title, setTitle] = useState(project.title);
  const [projectType, setProjectType] = useState(project.projectType);
  const [location, setLocation] = useState(project.location);
  const [description, setDescription] = useState(project.description || '');
  const [parentProjectId, setParentProjectId] = useState<string>(project.parentProjectId || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const payload = {
      title,
      projectType,
      location,
      description,
      parentProjectId: parentProjectId || null,
      buildingCode: project.buildingCode || null,
      facilityType: project.facilityType || null,
    };

    try {
      // Try PUT update endpoint
      await api.put(`/projects/${project.id}`, payload);
      onSuccess();
      onClose();
    } catch (putErr: unknown) {
      // Fallback to PATCH if PUT route is not implemented on backend
      try {
        await api.patch(`/projects/${project.id}`, payload);
        onSuccess();
        onClose();
      } catch (patchErr: unknown) {
        setError(getApiErrorMessage(patchErr, getApiErrorMessage(putErr, 'Failed to update project details.')));
      }
    } finally {
      setLoading(false);
    }
  };

  // Exclude current project and its sub-projects from parent select options to prevent cycles
  const parentCandidates = availableProjects.filter(
    (p) => p.id !== project.id
  );

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="relative max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <Edit3 className="w-5 h-5 text-blue-400" />
            <span>Edit Project Details</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg">
            {error}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Project Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {parentCandidates.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Parent Project (Optional)
              </label>
              <select
                value={parentProjectId}
                onChange={(e) => setParentProjectId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">None (Standalone Project)</option>
                {parentCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.location})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Project Type
              </label>
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
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Location
              </label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide engineering scope details..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Action Controls */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition font-medium shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  );
};
