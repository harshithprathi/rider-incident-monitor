import { Schema, model } from 'mongoose';
import { IIdempotencyRecord } from '../../core/types';

const idempotencyRecordSchema = new Schema<IIdempotencyRecord>(
  {
    key: {
      type: String,
      required: true,
      unique: true, // CRITICAL: Prevents duplicate incidents (Feature C)
      index: true,
    },
    incidentId: {
      type: Schema.Types.ObjectId,
      ref: 'Incident',
      required: true,
    },
    status: {
      type: String,
      enum: ['PROCESSING', 'COMPLETED'],
      default: 'PROCESSING',
      required: true,
    },
    response: {
      type: Schema.Types.Mixed,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'idempotency_records',
  }
);

// TTL index - automatically delete expired records
// Serves: Cleanup old idempotency records (24 hour retention)
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for incident lookup
// Serves: Find idempotency record by incident ID
idempotencyRecordSchema.index({ incidentId: 1 });

export const IdempotencyRecord = model<IIdempotencyRecord>('IdempotencyRecord', idempotencyRecordSchema);
