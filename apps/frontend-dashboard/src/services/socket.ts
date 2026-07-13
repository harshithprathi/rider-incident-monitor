import { io, Socket } from 'socket.io-client';
import { IncidentUpdate } from '../types';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(token: string): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupEventHandlers();

    return this.socket;
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect manually
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
      }
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  joinIncident(
    incidentId: string,
    onReplay: (data: { incidentId: string; updates: IncidentUpdate[]; count: number }) => void,
    onUpdate: (data: { incidentId: string; update: IncidentUpdate }) => void
  ): void {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }

    // Setup listeners before joining
    this.socket.on('incident_replay', onReplay);
    this.socket.on('incident_update', onUpdate);

    // Join the incident room
    this.socket.emit('join_incident', { incidentId });

    // Handle join confirmation
    this.socket.once('joined_incident', (data) => {
      console.log('Joined incident room:', data);
    });
  }

  leaveIncident(incidentId: string): void {
    if (!this.socket) return;

    this.socket.emit('leave_incident', { incidentId });

    // Remove listeners
    this.socket.off('incident_replay');
    this.socket.off('incident_update');
    this.socket.off('joined_incident');
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();
