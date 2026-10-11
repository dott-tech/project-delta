export type PhaseStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
export type ProjectRole = 'ADMIN' | 'MANAGER' | 'EDITOR' | 'VIEWER';

export interface ProjectPhase {
  id: string;
  name: string;
  status: PhaseStatus;
  progressPercent?: number;
  projectId?: string;
  order?: number;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

export interface ProjectMember {
  id: string;
  userId?: string;
  role: ProjectRole;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface ProjectFile {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl?: string;
  downloadUrl?: string;
  fileSize?: number | null;
  allowedRoles?: ProjectRole[];
  createdAt?: string;
}

export interface ProjectActivity {
  id: string;
  action: string;
  details: string;
  createdAt: string;
  userId?: string | null;
  user?: { id: string; name: string; email: string } | null;
}

export interface Project {
  id: string;
  title: string;
  description?: string | null;
  projectType: string;
  location: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt?: string;
  parentProjectId?: string | null;
  parentProject?: { id: string; title: string; location: string } | null;
  buildingCode?: string | null;
  facilityType?: string | null;
  effectiveProjectRole?: ProjectRole | null;
  createdBy?: { id: string; name: string; email: string };
  updatedBy?: { id: string; name: string; email: string } | null;
  files?: ProjectFile[];
  phases?: ProjectPhase[];
  subProjects?: Project[];
  members?: ProjectMember[];
}
