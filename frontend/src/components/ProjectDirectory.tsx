import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderTree } from 'lucide-react';
import type { ProjectNavigationNode } from '../types/project';

interface Props {
  activeProjectId: string | null;
  onNavigate: (projectId: string, ancestorIds: string[]) => void;
  embeddedInSidebar?: boolean;
}

interface TreeItemProps {
  item: ProjectNavigationNode;
  activeProjectId: string;
  ancestors: string[];
  onNavigate: Props['onNavigate'];
  defaultExpanded?: boolean;
}

const nodeContains = (node: ProjectNavigationNode, projectId: string): boolean =>
  node.id === projectId || (node.subProjects || []).some((child) => nodeContains(child, projectId));

const findAncestorIds = (
  nodes: ProjectNavigationNode[],
  projectId: string,
  ancestors: string[] = []
): string[] | null => {
  for (const node of nodes) {
    if (node.id === projectId) return ancestors;
    const match = findAncestorIds(node.subProjects || [], projectId, [...ancestors, node.id]);
    if (match) return match;
  }
  return null;
};

const TreeItem: React.FC<TreeItemProps> = ({
  item,
  activeProjectId,
  ancestors,
  onNavigate,
  defaultExpanded = false,
}) => {
  const children = item.subProjects || [];
  const hasChildren = children.length > 0;
  const isActive = item.id === activeProjectId;
  const [expanded, setExpanded] = useState(defaultExpanded || isActive);

  return (
    <li>
      <div className={`project-directory-row ${isActive ? 'is-active' : ''}`}>
        <button
          type="button"
          className="project-directory-toggle"
          onClick={() => hasChildren && setExpanded((value) => !value)}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.title}`}
          aria-expanded={hasChildren ? expanded : undefined}
          disabled={!hasChildren}
        >
          {hasChildren
            ? (expanded ? <ChevronDown /> : <ChevronRight />)
            : <span className="project-directory-toggle-spacer" />}
        </button>
        <button
          type="button"
          className="project-directory-link"
          onClick={() => onNavigate(item.id, ancestors)}
          aria-current={isActive ? 'page' : undefined}
          title={item.title}
        >
          {hasChildren && expanded ? <FolderOpen /> : <Folder />}
          <span className="project-directory-name">{item.title}</span>
          {item.buildingCode && <span className="project-directory-code">{item.buildingCode}</span>}
        </button>
      </div>
      {hasChildren && expanded && (
        <ul className="project-directory-children">
          {children.map((child) => (
            <TreeItem
              key={child.id}
              item={child}
              activeProjectId={activeProjectId}
              ancestors={[...ancestors, item.id]}
              onNavigate={onNavigate}
              defaultExpanded={nodeContains(child, activeProjectId)}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export const ProjectDirectory: React.FC<Props> = ({ activeProjectId, onNavigate, embeddedInSidebar = false }) => {
  const [projects, setProjects] = useState<ProjectNavigationNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadProjects = () => {
      setLoading(true);
      api.get<ProjectNavigationNode[]>('/projects/navigation')
        .then((response) => {
          if (!cancelled) {
            setProjects(response.data);
            setLoadError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    const handleDirectoryChange = () => loadProjects();
    loadProjects();
    window.addEventListener('project-directory-refresh', handleDirectoryChange);
    return () => {
      cancelled = true;
      window.removeEventListener('project-directory-refresh', handleDirectoryChange);
    };
  }, [activeProjectId]);

  const handleNavigate = (projectId: string, ancestorIds: string[]) => {
    setMobileOpen(false);
    onNavigate(projectId, ancestorIds);
  };

  return (
    <div className={`studio-project-directory ${embeddedInSidebar ? 'is-projects-root' : ''}`}>
      {!embeddedInSidebar && (
        <button
          type="button"
          className="project-directory-mobile-toggle"
          onClick={() => setMobileOpen((value) => !value)}
          aria-expanded={mobileOpen}
        >
          <FolderTree aria-hidden="true" />
          <span>Directory</span>
          <ChevronDown aria-hidden="true" />
        </button>
      )}
      <div className={`project-directory-content ${embeddedInSidebar ? 'is-projects-root-content' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
        {!embeddedInSidebar && (
          <div className="project-directory-heading">
            <FolderTree aria-hidden="true" />
            <span>PROJECT DIRECTORY</span>
          </div>
        )}
        <nav className="project-directory-nav" aria-label="Project directory">
          {loading && projects.length === 0 ? (
            <p className="project-directory-status">Loading project list…</p>
          ) : loadError && projects.length === 0 ? (
            <p className="project-directory-status">Project list is unavailable right now.</p>
          ) : (
            <ul>
              {projects.map((item) => (
                <TreeItem
                  key={item.id}
                  item={item}
                  activeProjectId={activeProjectId || ''}
                  ancestors={[]}
                  onNavigate={handleNavigate}
                  defaultExpanded={activeProjectId ? nodeContains(item, activeProjectId) : false}
                />
              ))}
              {activeProjectId && findAncestorIds(projects, activeProjectId) === null && !loading && (
                <li className="project-directory-status">This archived project is outside the active directory.</li>
              )}
            </ul>
          )}
        </nav>
      </div>
    </div>
  );
};
