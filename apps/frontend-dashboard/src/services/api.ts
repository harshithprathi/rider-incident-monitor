import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiResponse, Incident, IncidentUpdate, AuthResponse } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiResponse>) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth
  async login(email: string, password: string, userType: 'rider' | 'responder') {
    const response = await this.client.post<ApiResponse<AuthResponse>>('/api/auth/login', {
      email,
      password,
      userType,
    });
    return response.data;
  }

  async registerResponder(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    organizationId: string;
    region: string;
  }) {
    const response = await this.client.post<ApiResponse<AuthResponse>>(
      '/api/auth/register/responder',
      data
    );
    return response.data;
  }

  // Incidents
  async listIncidents(params?: {
    type?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    cursor?: string;
    limit?: number;
  }) {
    const response = await this.client.get<ApiResponse<{ incidents: Incident[] }>>(
      '/api/incidents',
      { params }
    );
    return response.data;
  }

  async getIncident(id: string) {
    const response = await this.client.get<ApiResponse<{ incident: Incident }>>(
      `/api/incidents/${id}`
    );
    return response.data;
  }

  async resolveIncident(id: string) {
    const response = await this.client.patch<ApiResponse<{ incident: Incident }>>(
      `/api/incidents/${id}/resolve`
    );
    return response.data;
  }

  async getIncidentUpdates(id: string) {
    const response = await this.client.get<ApiResponse<{ updates: IncidentUpdate[] }>>(
      `/api/incidents/${id}/updates`
    );
    return response.data;
  }

  // Safe Return
  async getActiveSession() {
    const response = await this.client.get<ApiResponse<{ session: any }>>(
      '/api/safe-return/active'
    );
    return response.data;
  }

  async createSession(data: {
    destination: string;
    destinationCoords?: { latitude: number; longitude: number; address: string; timestamp: string };
    deadline: string;
    organizationId: string;
    region: string;
  }) {
    const response = await this.client.post<ApiResponse<{ session: any }>>(
      '/api/safe-return',
      data
    );
    return response.data;
  }

  async completeSession(id: string) {
    const response = await this.client.patch<ApiResponse<{ session: any }>>(
      `/api/safe-return/${id}/complete`
    );
    return response.data;
  }

  async extendSession(id: string, additionalMinutes: number) {
    const response = await this.client.patch<ApiResponse<{ session: any }>>(
      `/api/safe-return/${id}/extend`,
      { additionalMinutes }
    );
    return response.data;
  }

  async listOrganizations() {
    const response = await this.client.get<ApiResponse<{ organizations: any[] }>>(
      '/api/auth/organizations'
    );
    return response.data;
  }

  // Health check
  async healthCheck() {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiService = new ApiService();
