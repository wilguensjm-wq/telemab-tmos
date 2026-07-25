import { v4 as uuidv4 } from 'uuid';

export type ReporterStatus = 'available' | 'live' | 'busy' | 'offline';

export interface Reporter {
  id: string;
  userId: string;
  name: string;
  location?: string;
  status: ReporterStatus;
  lastHeartbeatAt: Date;
  connectedAt?: Date;
  disconnectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReporterSession {
  id: string;
  reporterId: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  startedAt: Date;
  endedAt?: Date;
  heartbeatCount: number;
  createdAt: Date;
}

export interface ReporterStatusChange {
  id: string;
  reporterId: string;
  sessionId?: string;
  oldStatus?: ReporterStatus;
  newStatus: ReporterStatus;
  reason?: string;
  createdAt: Date;
}

export interface ReporterActivity {
  id: string;
  reporterId: string;
  sessionId?: string;
  activityType: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface RegisterReporterRequest {
  name: string;
  location?: string;
}

export interface UpdateStatusRequest {
  status: ReporterStatus;
  reason?: string;
}

export interface HeartbeatRequest {
  location?: string;
}

export interface ReporterResponse {
  id: string;
  userId: string;
  name: string;
  location?: string;
  status: ReporterStatus;
  lastHeartbeatAt: string;
  connectedAt?: string;
  sessionId?: string;
}

export interface ReporterListResponse {
  reporters: ReporterResponse[];
  count: number;
  timestamp: string;
}

export interface WebSocketMessage {
  type: 'ping' | 'pong' | 'status_change' | 'heartbeat' | 'error';
  payload?: Record<string, any>;
  timestamp: string;
}

export function generateSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
