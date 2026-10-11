import React, { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/useAuth';
import { getApiErrorMessage } from '../utils/apiError';
import { type ProjectPhase, type PhaseStatus } from '../types/project';
import { Check, Edit2 } from 'lucide-react';

interface Props {
  phases: ProjectPhase[];
  projectId?: string;
  userProjectRole?: string; // Passed down from project details ('EDITOR' | 'MANAGER' | 'VIEWER')
  onPhaseUpdated?: () => void;
}

const statusColors: Record<PhaseStatus, string> = {
  NOT_STARTED: 'bg-slate-800 text-slate-400 border-slate-700',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  BLOCKED: 'bg-red-500/10 text-red-400 border-red-500/20',
  COMPLETED: 'bg-green-500/10 text-green-400 border-green-500/20',
};

export const PhaseTracker: React.FC<Props> = ({ 
  phases, 
  projectId, 
  userProjectRole, 
  onPhaseUpdated 
}) => {
  const { user } = useAuth();
  
  // Inline editing state for active phase progress percentage
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [progressInput, setProgressInput] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // Authorization check: ONLY system ADMIN or assigned EDITOR / MANAGER can edit
  const isAdmin = user?.role === 'ADMIN';
  const canModifyProgress = isAdmin || userProjectRole === 'EDITOR' || userProjectRole === 'MANAGER';

  if (!phases || phases.length === 0) {
    return <span className="text-xs text-slate-500 italic">No phases configured</span>;
  }

  // Calculated overall weighted progress based on completed phases & custom in-progress percentages
  const totalPercentage = phases.reduce((acc, phase) => {
    if (phase.status === 'COMPLETED') return acc + 100;
    if (phase.status === 'IN_PROGRESS') return acc + (phase.progressPercent ?? 50);
    return acc;
  }, 0);

  const overallPercent = Math.round(totalPercentage / phases.length);

  const handleStartEditing = (phase: ProjectPhase) => {
    if (!canModifyProgress || !projectId) return;
    setEditingPhaseId(phase.id);
    setProgressInput(phase.progressPercent ?? 50);
  };

  const handleSaveProgress = async (phaseId: string) => {
    if (!projectId) return;
    try {
      setSaving(true);
      const clampedPercent = Math.min(100, Math.max(0, Number(progressInput)));

      await api.patch(`/projects/${projectId}/phases/${phaseId}`, {
        progressPercent: clampedPercent,
      });

      setEditingPhaseId(null);
      if (onPhaseUpdated) onPhaseUpdated();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to update phase progress percentage.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2.5 w-full">
      {/* Progress Bar Header */}
      <div className="flex justify-between items-center text-xs text-slate-400 font-medium">
        <span>Overall Progress</span>
        <span className="text-white font-semibold">{overallPercent}%</span>
      </div>

      {/* Segmented Progress Bar */}
      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
        <div
          className="bg-blue-500 h-full transition-all duration-300"
          style={{ width: `${overallPercent}%` }}
        />
      </div>

      {/* Phase Status Badges */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {phases.map((phase) => {
          const isEditing = editingPhaseId === phase.id;
          const isInProgress = phase.status === 'IN_PROGRESS';

          return (
            <div
              key={phase.id}
              className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1.5 transition ${
                statusColors[phase.status]
              }`}
            >
              <span>{phase.name}</span>

              {/* In-Progress Percentage Input / Display */}
              {isInProgress && (
                <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-blue-500/30">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={progressInput}
                        onChange={(e) => setProgressInput(Number(e.target.value))}
                        className="w-11 bg-slate-950 border border-blue-500 rounded px-1 text-center text-white text-[10px] focus:outline-none"
                        autoFocus
                      />
                      <button
                        disabled={saving}
                        onClick={() => handleSaveProgress(phase.id)}
                        className="p-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-blue-300 font-bold">
                        {phase.progressPercent ?? 50}%
                      </span>
                      {canModifyProgress && projectId && (
                        <button
                          onClick={() => handleStartEditing(phase)}
                          title="Set progress %"
                          className="p-0.5 hover:text-white transition"
                        >
                          <Edit2 className="w-2.5 h-2.5 text-blue-400" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
