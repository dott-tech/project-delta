// frontend/src/components/AdminUserDirectory.tsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'TEAM_MEMBER' | 'CLIENT';
  createdAt: string;
}

export const AdminUserDirectory: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('http://localhost:5000/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load user directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `http://localhost:5000/api/users/${userId}/role`,
        { role: newRole },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Update local state smoothly
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole as any } : u))
      );
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update user role');
    }
  };

  if (loading) return <div className="p-4 text-gray-400">Loading user records...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  return (
    <div className="bg-slate-900 text-slate-100 p-6 rounded-xl border border-slate-800 shadow-xl">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <span>🛡️</span> Admin Directory & Privilege Escalation
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-3 px-4">User</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Joined</th>
              <th className="py-3 px-4">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="py-3 px-4 font-medium">{user.name}</td>
                <td className="py-3 px-4 text-slate-400">{user.email}</td>
                <td className="py-3 px-4 text-slate-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="py-3 px-4">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="CLIENT">CLIENT</option>
                    <option value="TEAM_MEMBER">TEAM_MEMBER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};