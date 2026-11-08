import React from 'react';
import type { PhaseStatus, ProjectPhase } from '../types/project';
import { calculatePhaseProgress, PHASE_WEIGHTS } from '../utils/phaseProgress';

interface Props {
  phases: ProjectPhase[];
  progressOverride?: number;
  canEdit?: boolean;
  onPhaseStatusChange?: (phaseId: string, status: PhaseStatus) => void;
}

export const PhaseTracker: React.FC<Props> = ({ phases, progressOverride, canEdit = false, onPhaseStatusChange }) => {
  if ((!phases || phases.length === 0) && progressOverride === undefined) {
    return <span className="text-xs text-slate-500 italic">No phases configured</span>;
  }

  const overallPercent = progressOverride ?? calculatePhaseProgress(phases);

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
          className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 transition-all duration-300"
          style={{ width: `${overallPercent}%` }}
        />
      </div>

      {/* Phase Status Badges */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {[...phases]
          .filter((phase) => PHASE_WEIGHTS[phase.name] !== undefined)
          .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
          .map((phase) => {
            const isDone = phase.status === 'COMPLETED';
            const workPhases = phases.filter((candidate) => (
              ['Concept Design', 'Design Calculation', 'Modeling', 'Sheeting'].includes(candidate.name)
            ));
            const canCompleteDone = phase.name !== 'Done' || isDone || (
              workPhases.length === 4 && workPhases.every((candidate) => candidate.status === 'COMPLETED')
            );
            const isInteractive = Boolean(onPhaseStatusChange);
            const isDisabled = !canEdit || (phase.name === 'Done' && !canCompleteDone);
            const className = `phase-tracker-chip text-[11px] px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1.5 transition ${isDone
              ? 'is-complete bg-cyan-500/10 text-cyan-200 border-cyan-400/25'
              : 'bg-slate-800 text-slate-400 border-slate-700'} ${isInteractive ? 'is-interactive' : ''} ${isDisabled && isInteractive ? 'is-disabled' : ''}`;

            const content = <>
              <span>{phase.name}</span>
              <span className="text-[10px] opacity-70">{PHASE_WEIGHTS[phase.name]}%</span>
            </>;

            return isInteractive ? (
              <button
                key={phase.id}
                type="button"
                className={className}
                disabled={isDisabled}
                aria-pressed={isDone}
                title={phase.name === 'Done' && !canCompleteDone
                  ? 'Complete the four engineering phases first'
                  : isDone
                    ? `Reset ${phase.name} and all later phases`
                    : `Complete ${phase.name} and all previous phases`}
                onClick={() => onPhaseStatusChange?.(phase.id, isDone ? 'NOT_STARTED' : 'COMPLETED')}
              >
                {content}
              </button>
            ) : (
              <span key={phase.id} className={className}>{content}</span>
            );
          })}
      </div>
    </div>
  );
};
