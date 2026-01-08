import { User } from '../domain/user';

export interface IdentityProvider {
  validateToken(token: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  setRole(userId: string, role: string): Promise<void>;
}
