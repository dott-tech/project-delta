import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import type { ProjectActivity } from '../types/project';
import { getApiErrorMessage } from '../utils/apiError';

export const ProjectActivityLog: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadActivities = useCallback(async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/activity`);
      setActivities(data);
      setError('');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Could not load project activity.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const refreshActivities = async () => {
    setLoading(true);
    await loadActivities();
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadActivities(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadActivities]);

  return (
    <section className="activity-panel rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-white"><Activity className="h-4 w-4 text-amber-400" /> Project Activity</h3>
          <p className="mt-1 text-xs text-slate-400">Edits, uploads, access changes, and project events</p>
        </div>
        <button onClick={refreshActivities} aria-label="Refresh project activity" className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-white">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error ? <p role="alert" className="text-xs text-rose-300">{error}</p> : loading ? (
        <p className="text-xs text-slate-500">Loading activity…</p>
      ) : activities.length === 0 ? (
        <p className="text-xs text-slate-500">No activity recorded yet. New project changes and uploads will appear here.</p>
      ) : (
        <ol className="max-h-96 space-y-4 overflow-y-auto pr-1">
          {activities.map((item) => (
            <li key={item.id} className="relative border-l border-slate-700 pl-4">
              <span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-blue-400 ring-4 ring-slate-900" />
              <p className="text-xs leading-5 text-slate-200">{item.details}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                <span className="text-slate-400">{item.user?.name || (item.userId ? 'Former user' : 'Historical record')}</span>
                {' · '}{new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
