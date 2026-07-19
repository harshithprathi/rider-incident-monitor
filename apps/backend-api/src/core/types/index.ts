import { Document, Types } from 'mongoose';
import { Request } from 'express';

// Enums
export enum IncidentType {
  ACTIVE_CRASH = 'ACTIVE_CRASH',
  SOS = 'SOS',
  SAFE_RETURN_MISSED = 'SAFE_RETURN_MISSED',
}

export enum IncidentStatus {
  LIVE = 'LIVE',
  RESOLVED = 'RESOLVED',
}

export enum SafeReturnStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

export enum IncidentUpdateType {
  CREATED = 'CREATED',
  LOCATION_UPDATE = 'LOCATION_UPDATE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  RESPONDER_ASSIGNED = 'RESPONDER_ASSIGNED',
  SENSOR_DATA = 'SENSOR_DATA',
  COMMENT = 'COMMENT',
}

export enum UserRole {
  RIDER = 'RIDER',
  RESPONDER = 'RESPONDER',
  ADMIN = 'ADMIN',
}

// Interfaces
export interface ILocation {
  latitude: number;
  longitude: number;
  address?: string;
  timestamp: Date;
}

export interface ICrashData {
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

export interface IUnfilteredData {
  impact: Array<{
    tx: number;
    iX: number;
    iY: number;
    iZ: number;
  }>;
}

// Document Interfaces
export interface IRider extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  password: string;
  deviceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IResponder extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  password: string;
  organizationId: Types.ObjectId;
  region: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrganization extends Document {
  _id: Types.ObjectId;
  name: string;
  regions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IIncident extends Document {
  _id: Types.ObjectId;
  type: IncidentType;
  status: IncidentStatus;
  riderId: Types.ObjectId;
  responderId?: Types.ObjectId;
  location: ILocation;
  processedData?: ICrashData;
  unfilteredData?: IUnfilteredData;
  description?: string;
  organizationId: Types.ObjectId;
  region: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IIncidentUpdate extends Document {
  _id: Types.ObjectId;
  incidentId: Types.ObjectId;
  sequenceNumber: number;
  type: IncidentUpdateType;
  data: Record<string, any>;
  createdBy?: Types.ObjectId;
  createdByModel?: 'Rider' | 'Responder';
  createdAt: Date;
}

export interface ISafeReturnSession extends Document {
  _id: Types.ObjectId;
  riderId: Types.ObjectId;
  destination: string;
  destinationCoords?: ILocation;
  deadline: Date;
  status: SafeReturnStatus;
  warningJobId?: string;
  deadlineJobId?: string;
  organizationId: Types.ObjectId;
  region: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface IIdempotencyRecord extends Document {
  _id: Types.ObjectId;
  key: string;
  incidentId: Types.ObjectId;
  status: 'PROCESSING' | 'COMPLETED';
  response: Record<string, any>;
  expiresAt: Date;
  createdAt: Date;
}

// API Response Types
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
    warning?: string;
  };
}

// JWT Payload
export interface JwtPayload {
  userId: string;
  role: UserRole;
  organizationId?: string;
  region?: string;
  iat?: number;
  exp?: number;
}

// Request Extensions
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// Queue Job Data
export interface SafeReturnWarningJobData {
  sessionId: string;
  riderId: string;
  destination: string;
  deadline: Date;
}

// Socket Events
export interface SocketAuthData {
  token: string;
}

export interface JoinIncidentData {
  incidentId: string;
}

/** Typed user response for auth endpoints — replaces 'any' */
export interface UserResponse {
  id: Types.ObjectId;
  name: string;
  email: string;
  role: UserRole;
  organizationId?: string;
  organizationName?: string;
  region?: string;
}

/** Typed auth response data */
export interface AuthResponseData {
  token: string;
  user: UserResponse;
}

export interface SafeReturnDeadlineJobData {
  sessionId: string;
  riderId: string;
  destination: string;
  organizationId: string;
  region: string;
}
