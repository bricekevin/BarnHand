export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  farm_id?: string;
  created_at: Date;
  updated_at: Date;
}

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  FARM_ADMIN = 'farm_admin',
  FARM_USER = 'farm_user',
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  farmId: string | undefined;
  iat?: number;
  exp?: number;
}

export interface UserPayload {
  id: string;
  userId: string;
  email: string;
  role: UserRole;
  farmId: string | undefined;
}

export interface AuthRequest extends Request {
  user?: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: Omit<User, 'password'>;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  farm_id?: string;
}
