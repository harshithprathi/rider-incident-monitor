import { Schema, model } from 'mongoose';
import { IIncident, IncidentType, IncidentStatus } from '../types';

const locationSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String },
    timestamp: { type: Date, required: true },
  },
  { _id: false }
);

const crashDataSchema = new Schema(
  {
    i_max: { type: Number, required: true },
    irms_max: { type: Number, required: true },
    impact: [
      {
        tx: { type: Number, required: true },
        iX: { type: Number, required: true },
        iY: { type: Number, required: true },
        iZ: { type: Number, required: true },
        _id: false,
      },
    ],
    rms: [
      {
        tx: { type: Number, required: true },
        accel: { type: Number, required: true },
        gyro: { type: Number, required: true },
        impact: { type: Number, required: true },
        impulse: { type: Number, required: true },
        _id: false,
      },
    ],
  },
  { _id: false }
);

const unfilteredDataSchema = new Schema(
  {
    impact: [
      {
        tx: { type: Number, required: true },
        iX: { type: Number, required: true },
        iY: { type: Number, required: true },
        iZ: { type: Number, required: true },
        _id: false,
      },
    ],
  },
  { _id: false }
);

const incidentSchema = new Schema<IIncident>(
  {
    type: {
      type: String,
      enum: Object.values(IncidentType),
      required: true,
      index: true, // For filtering by type
    },
    status: {
      type: String,
      enum: Object.values(IncidentStatus),
      required: true,
      default: IncidentStatus.LIVE,
      index: true, // For filtering by status
    },
    riderId: {
      type: Schema.Types.ObjectId,
      ref: 'Rider',
      required: true,
      index: true, // For rider-specific queries
    },
    responderId: {
      type: Schema.Types.ObjectId,
      ref: 'Responder',
      sparse: true,
      index: true, // For responder-specific queries
    },
    location: {
      type: locationSchema,
      required: true,
    },
    processedData: {
      type: crashDataSchema,
      required: false,
    },
    unfilteredData: {
      type: unfilteredDataSchema,
      required: false,
    },
    description: {
      type: String,
      trim: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true, // For org-based authorization
    },
    region: {
      type: String,
      required: true,
      index: true, // For region-based authorization
    },
  },
  {
    timestamps: true,
    collection: 'incidents',
  }
);

// Compound index for filtered incident list with pagination
// Serves: GET /incidents?type=ACTIVE_CRASH&status=LIVE&cursor=...
incidentSchema.index({ organizationId: 1, region: 1, status: 1, createdAt: -1 });

// Compound index for type-filtered lists
// Serves: GET /incidents?type=SOS&dateFrom=...&dateTo=...
incidentSchema.index({ organizationId: 1, region: 1, type: 1, createdAt: -1 });

// Compound index for responder authorization and quick lookups
// Serves: Authorization checks + incident details page
incidentSchema.index({ _id: 1, organizationId: 1, region: 1 });

// Index for rider's incident history
// Serves: GET /riders/:id/incidents
incidentSchema.index({ riderId: 1, createdAt: -1 });

// Index for date range queries with org/region
// Serves: Analytics and filtering by date range
incidentSchema.index({ organizationId: 1, region: 1, createdAt: -1 });

export const Incident = model<IIncident>('Incident', incidentSchema);
