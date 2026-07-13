import { Schema, model } from 'mongoose';
import { ISafeReturnSession, SafeReturnStatus } from '../../core/types';

const locationSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String },
    timestamp: { type: Date, required: true },
  },
  { _id: false }
);

const safeReturnSessionSchema = new Schema<ISafeReturnSession>(
  {
    riderId: {
      type: Schema.Types.ObjectId,
      ref: 'Rider',
      required: true,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
    },
    destinationCoords: {
      type: locationSchema,
      required: false,
    },
    deadline: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SafeReturnStatus),
      required: true,
      default: SafeReturnStatus.ACTIVE,
    },
    warningJobId: {
      type: String,
      sparse: true,
    },
    deadlineJobId: {
      type: String,
      sparse: true,
    },
    completedAt: {
      type: Date,
      sparse: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    region: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'safe_return_sessions',
  }
);

// Compound index for active sessions by rider
// Serves: Check if rider has active session
safeReturnSessionSchema.index({ riderId: 1, status: 1 });

// CRITICAL: Compound index for restart reconciliation (R4 requirement)
// Serves: Find all ACTIVE sessions on startup to re-arm jobs
safeReturnSessionSchema.index({ status: 1, deadline: 1 });

// Index for deadline queries - find sessions expiring soon
// Serves: Proactive monitoring, deadline job scheduling
safeReturnSessionSchema.index({ deadline: 1, status: 1 });

// Compound index for organization/region filtering
safeReturnSessionSchema.index({ organizationId: 1, region: 1 });

export const SafeReturnSession = model<ISafeReturnSession>('SafeReturnSession', safeReturnSessionSchema);
