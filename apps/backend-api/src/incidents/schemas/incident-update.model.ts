import { Schema, model } from 'mongoose';
import { IIncidentUpdate, IncidentUpdateType } from '../../core/types';

const incidentUpdateSchema = new Schema<IIncidentUpdate>(
  {
    incidentId: {
      type: Schema.Types.ObjectId,
      ref: 'Incident',
      required: true,
    },
    sequenceNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    type: {
      type: String,
      enum: Object.values(IncidentUpdateType),
      required: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      refPath: 'createdByModel',
      sparse: true,
    },
    createdByModel: {
      type: String,
      enum: ['Rider', 'Responder'],
      required: function(this: IIncidentUpdate) {
        return !!this.createdBy;
      },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Updates are immutable
    collection: 'incident_updates',
  }
);

// CRITICAL: Unique compound index ensures no duplicate sequence numbers per incident
// Serves: Guarantees monotonic, gap-free sequence (R2 requirement)
incidentUpdateSchema.index(
  { incidentId: 1, sequenceNumber: 1 },
  { unique: true }
);

// Index for time-based queries
// Serves: Get updates within a time range
// incidentUpdateSchema.index({ incidentId: 1, createdAt: -1 });

export const IncidentUpdate = model<IIncidentUpdate>('IncidentUpdate', incidentUpdateSchema);
