import { Schema, model } from 'mongoose';
import { IResponder } from '../../core/types';

const responderSchema = new Schema<IResponder>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // Never returned in queries by default — use .select('+password') for auth
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true, // For org-based filtering
    },
    region: {
      type: String,
      required: true,
      index: true, // For region-based filtering
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true, // For active responder queries
    },
  },
  {
    timestamps: true,
    collection: 'responders',
  }
);

// Compound index for authorization queries - responders filtered by org AND region
// Serves: "Find all incidents for responder's org/region"
responderSchema.index({ organizationId: 1, region: 1 });

// Compound index for active responders in an org/region
// Serves: "Find active responders for assignment"
responderSchema.index({ organizationId: 1, region: 1, isActive: 1 });

export const Responder = model<IResponder>('Responder', responderSchema);
