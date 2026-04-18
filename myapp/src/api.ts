import axios from 'axios';

const api = axios.create({
  baseURL: 'http://hack.marrb.net:3000',
  timeout: 10000,
});

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${authToken}`;
  }

  return config;
});

export interface AuthRequest {
  email: string;
  password: string;
}

export interface User {
  id: number;
  email: string;
  created_at?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterResponse {
  user: User;
}

export const register = async (payload: AuthRequest): Promise<RegisterResponse> => {
  const response = await api.post<RegisterResponse>('/auth/register', payload);
  return response.data;
};

export const login = async (payload: AuthRequest): Promise<LoginResponse> => {
  const response = await api.post<LoginResponse>('/auth/login', payload);
  return response.data;
};

export const protectedGet = async <T>(path: string): Promise<T> => {
  const response = await api.get<T>(path);
  return response.data;
};

export default api;
