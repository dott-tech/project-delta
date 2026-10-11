import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/useAuth';
import { ShieldAlert, Users, UserCheck, RefreshCw, Trash2, Link2, Copy, X } from 'lucide-react';
import { getApiErrorMessage } from '../utils/apiError';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'TEAM_MEMBER' | 'CLIENT';
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: 'CLIENT' | 'TEAM_MEMBER';
  createdAt: string;
  expiresAt: string;
}

export const AdminUserDirectory: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'CLIENT' | 'TEAM_MEMBER'>('CLIENT');
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const loadUsers = async () => {
    try {
      const [userResponse, invitationResponse] = await Promise.all([
        api.get('/users'),
        api.get('/auth/invitations'),
      ]);
      setUsers(userResponse.data);
      setInvitations(invitationResponse.data);
      setError('');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to load team directory.'));
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    await loadUsers();
  };

  const handleCreateInvitation = async (event: React.FormEvent) => {
    event.preventDefault();
    setInviteError('');
    setInviteUrl('');
    setCreatingInvite(true);
    try {
      const { data } = await api.post('/auth/invitations', { email: inviteEmail, role: inviteRole });
      const inviteParams = new URLSearchParams({ invite: data.token, email: data.invitation.email });
      const link = `${window.location.origin}/#${inviteParams.toString()}`;
      setInviteUrl(link);
      setInviteEmail('');
      setCopiedInvite(false);
      await fetchUsers();
    } catch (err: unknown) {
      setInviteError(getApiErrorMessage(err, 'Could not create the invitation.'));
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      setRevokingInviteId(invitationId);
      await api.delete(`/auth/invitations/${invitationId}`);
      setInvitations((previous) => previous.filter((invitation) => invitation.id !== invitationId));
    } catch (err: unknown) {
      setInviteError(getApiErrorMessage(err, 'Could not revoke the invitation.'));
    } finally {
      setRevokingInviteId(null);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadUsers(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const handleRoleChange = async (targetUserId: string, newRole: User['role']) => {
    try {
      setUpdatingId(targetUserId);
      await api.patch(`/users/${targetUserId}/role`, { role: newRole });

      // Smoothly update local state
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUserId ? { ...u, role: newRole } : u))
      );
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to update user privilege level.'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteUser = async (targetUserId: string, targetUserName: string) => {
    if (!confirm(`Are you sure you want to permanently delete user "${targetUserName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingId(targetUserId);
      await api.delete(`/users/${targetUserId}`);

      // Remove from local state
      setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Failed to delete user.'));
    } finally {
      setDeletingId(null);
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
    <div className="directory-panel bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Table Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" /> Team & Member Management
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Promote or demote members to grant or restrict platform permissions, or remove accounts.
          </p>
        </div>

        <button
          onClick={fetchUsers}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-xl transition w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh List
        </button>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-xl border border-blue-400/20 bg-blue-400/10 p-2 text-blue-300"><Link2 className="h-4 w-4" /></div>
          <div>
            <h4 className="text-sm font-semibold text-white">Invite someone</h4>
            <p className="mt-1 text-xs leading-5 text-slate-400">Create a one-time link for a specific email. It expires after 7 days. Share it with the invitee using a private channel.</p>
          </div>
        </div>
        <form onSubmit={handleCreateInvitation} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
          <input
            type="email"
            required
            maxLength={254}
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="person@example.com"
            aria-label="Invitee email"
            className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
          />
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as 'CLIENT' | 'TEAM_MEMBER')}
            aria-label="Account role for invitee"
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
          >
            <option value="CLIENT">Client account</option>
            <option value="TEAM_MEMBER">Team member account</option>
          </select>
          <button disabled={creatingInvite} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50">
            <Link2 className="h-4 w-4" /> {creatingInvite ? 'Creating…' : 'Create link'}
          </button>
        </form>
        {inviteError && <p role="alert" className="mt-3 text-xs text-rose-300">{inviteError}</p>}
        {inviteUrl && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 break-all font-mono text-[11px] text-emerald-200">{inviteUrl}</p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopiedInvite(true);
                } catch {
                  setInviteError('Clipboard access failed. Select and copy the invitation link above.');
                }
              }}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10"
            >
              <Copy className="h-3.5 w-3.5" /> {copiedInvite ? 'Copied' : 'Copy invite link'}
            </button>
          </div>
        )}
        {invitations.length > 0 && (
          <div className="mt-5 border-t border-slate-800 pt-4">
            <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Pending invitations</h5>
            <ul className="divide-y divide-slate-800">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">{invitation.email}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{invitation.role} · expires {new Date(invitation.expiresAt).toLocaleString()}</p>
                  </div>
                  <button
                    type="button"
                    disabled={revokingInviteId === invitation.id}
                    onClick={() => handleRevokeInvitation(invitation.id)}
                    aria-label={`Revoke invitation for ${invitation.email}`}
                    className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
                  ><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

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
                      <div className="flex items-center justify-end gap-2">
                        <select
                          disabled={updatingId === member.id || deletingId === member.id}
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as User['role'])}
                          className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:opacity-50"
                        >
                          <option value="CLIENT">Demote to CLIENT</option>
                          <option value="TEAM_MEMBER">Set as TEAM_MEMBER</option>
                          <option value="ADMIN">Promote to ADMIN</option>
                        </select>

                        <button
                          disabled={deletingId === member.id || updatingId === member.id}
                          onClick={() => handleDeleteUser(member.id, member.name)}
                          title="Delete User"
                          className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 rounded-xl transition disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
