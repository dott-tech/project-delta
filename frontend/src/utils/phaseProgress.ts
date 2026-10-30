import type { Project, ProjectPhase } from '../types/project';

export const PHASE_WEIGHTS: Record<string, number> = {
  'Concept Design': 10,
  'Design Calculation': 40,
  Modeling: 10,
  Sheeting: 30,
  Done: 10,
};

export const calculatePhaseProgress = (phases: ProjectPhase[] = []): number =>
  Math.min(100, phases.reduce((total, phase) => (
    phase.status === 'COMPLETED' ? total + (PHASE_WEIGHTS[phase.name] || 0) : total
  ), 0));

export type ProgressSource = {
  phases?: ProjectPhase[];
  subProjects?: ProgressSource[];
};

export const calculateProgressFromTree = (project: ProgressSource): number => {
  const children = project.subProjects || [];
  if (children.length === 0) return calculatePhaseProgress(project.phases || []);
  return Math.round(children.reduce((total, child) => total + calculateProgressFromTree(child), 0) / children.length);
};

export const calculateProjectProgress = (project: Project): number =>
  calculateProgressFromTree(project.progressTree || project);
