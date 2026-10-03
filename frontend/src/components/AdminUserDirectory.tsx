import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Shield, ShieldAlert, Users, UserCheck, RefreshCw } from 'lucide-react';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'TEAM_MEMBER' | 'CLIENT';
  createdAt: string;
}

export const AdminUserDirectory: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load team directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    try {
      setUpdatingId(targetUserId);
      await api.patch(`/users/${targetUserId}/role`, { role: newRole });

      // Smoothly update local state
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUserId ? { ...u, role: newRole as any } : u))
      );
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update user privilege level.');
    } finally {
      setUpdatingId(null);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'TEAM_MEMBER':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
        Loading organization directory...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-red-400 text-sm flex items-center gap-3">
        <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0" />
        <div>{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Table Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" /> Team & Member Management
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Promote or demote members to grant or restrict platform permissions.
          </p>
        </div>

        <button
          onClick={fetchUsers}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-xl transition w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh List
        </button>
      </div>

      {/* Directory Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
              <th className="py-3 px-4">Member Name</th>
              <th className="py-3 px-4">Email Address</th>
              <th className="py-3 px-4">Date Joined</th>
              <th className="py-3 px-4">Role Badge</th>
              <th className="py-3 px-4 text-right">Access Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {users.map((member) => {
              const isSelf = member.id === currentUser?.id;

              return (
                <tr key={member.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-slate-500" />
                    <span>{member.name}</span>
                    {isSelf && (
                      <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 text-xs">{member.email}</td>
                  <td className="py-3.5 px-4 text-slate-500 text-xs">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${getRoleBadge(member.role)}`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {isSelf ? (
                      <span className="text-xs text-slate-600 italic">Self (Locked)</span>
                    ) : (
                      <select
                        disabled={updatingId === member.id}
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:opacity-50"
                      >
                        <option value="CLIENT">Demote to CLIENT</option>
                        <option value="TEAM_MEMBER">Set as TEAM_MEMBER</option>
                        <option value="ADMIN">Promote to ADMIN</option>
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};