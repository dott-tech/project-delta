import React, { useState } from 'react';
import { type Project } from '../types/project';
import { PhaseTracker } from './PhaseTracker';

interface Props {
  project: Project;
  onSelectProject: (projectId: string) => void;
}

export const ProjectTreeCard: React.FC<Props> = ({ project, onSelectProject }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const hasSubProjects = project.subProjects && project.subProjects.length > 0;

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition duration-150 overflow-hidden mb-4">
      {/* Parent Project Card Body */}
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {hasSubProjects && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 rounded text-gray-500 hover:bg-gray-100 focus:outline-none"
                aria-label="Toggle sub-projects"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            <div>
              <h3
                onClick={() => onSelectProject(project.id)}
                className="text-lg font-semibold text-gray-900 cursor-pointer hover:text-blue-600"
              >
                {project.title}
              </h3>
              <p className="text-xs text-gray-500">
                {project.projectType} • {project.location}
              </p>
            </div>
          </div>

          {/* Member Stack */}
          {project.members && project.members.length > 0 && (
            <div className="flex -space-x-2 overflow-hidden">
              {project.members.slice(0, 4).map((member) => (
                <div
                  key={member.id}
                  title={`${member.user.name} (${member.role})`}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-600 text-white font-medium text-xs ring-2 ring-white"
                >
                  {member.user.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {project.members.length > 4 && (
                <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gray-200 text-gray-700 font-medium text-xs ring-2 ring-white">
                  +{project.members.length - 4}
                </div>
              )}
            </div>
          )}
        </div>

        {project.description && (
          <p className="mt-2 text-sm text-gray-600 line-clamp-2">{project.description}</p>
        )}

        {/* Phase Tracker */}
        <div className="mt-4">
          <PhaseTracker phases={project.phases || []} />
        </div>
      </div>

      {/* Sub-Projects Accordion Section */}
      {hasSubProjects && isExpanded && (
        <div className="bg-gray-50 border-t border-gray-200 p-4 space-y-3 pl-8">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Sub-Projects ({project.subProjects!.length})
          </span>
          {project.subProjects!.map((sub) => (
            <div
              key={sub.id}
              onClick={() => onSelectProject(sub.id)}
              className="bg-white p-3 rounded border border-gray-200 shadow-xs hover:border-blue-400 cursor-pointer transition"
            >
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-sm text-gray-800">{sub.title}</h4>
                <span className="text-xs text-gray-400">{sub.location}</span>
              </div>
              <PhaseTracker phases={sub.phases || []} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};