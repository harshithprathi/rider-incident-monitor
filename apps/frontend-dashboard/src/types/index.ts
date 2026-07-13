// Frontend types matching backend

export enum IncidentType {
  ACTIVE_CRASH = 'ACTIVE_CRASH',
  SOS = 'SOS',
  SAFE_RETURN_MISSED = 'SAFE_RETURN_MISSED',
}

export enum IncidentStatus {
  LIVE = 'LIVE',
  RESOLVED = 'RESOLVED',
}

export enum IncidentUpdateType {
  CREATED = 'CREATED',
  LOCATION_UPDATE = 'LOCATION_UPDATE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  RESPONDER_ASSIGNED = 'RESPONDER_ASSIGNED',
  SENSOR_DATA = 'SENSOR_DATA',
  COMMENT = 'COMMENT',
}

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
  timestamp: Date | string;
}

export interface CrashData {
  i_max: number;
  irms_max: number;
  impact: Array<{
    tx: number;
    iX: number;
    iY: number;
    iZ: number;
  }>;
  rms: Array<{
    tx: number;
    accel: number;
    gyro: number;
    impact: number;
    impulse: number;
  }>;
}

export interface UnfilteredData {
  impact: Array<{
    tx: number;
    iX: number;
    iY: number;
    iZ: number;
  }>;
}

export interface Incident {
  _id: string;
  type: IncidentType;
  status: IncidentStatus;
  riderId: {
    _id: string;
    name: string;
    email: string;
    phone: string;
  };
  responderId?: {
    _id: string;
    name: string;
    email: string;
  };
  location: Location;
  processedData?: CrashData;
  unfilteredData?: UnfilteredData;
  description?: string;
  organizationId: string;
  region: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentUpdate {
  _id: string;
  incidentId: string;
  sequenceNumber: number;
  type: IncidentUpdateType;
  data: Record<string, any>;
  createdBy?: string;
  createdAt: string;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    cursor?: string;
    nextCursor?: string;
    hasMore?: boolean;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationId?: string;
  organizationName?: string;
  region?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
