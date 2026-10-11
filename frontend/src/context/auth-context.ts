import { createContext } from 'react';

export type Role = 'ADMIN' | 'TEAM_MEMBER' | 'CLIENT';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
