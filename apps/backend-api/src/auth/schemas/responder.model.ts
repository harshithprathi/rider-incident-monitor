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
    },
    region: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'responders',
  },
);

// Compound index for active responders in an org/region and for authorization queries - responders filtered by org AND region
// Serves: "Find active responders for assignment"
responderSchema.index({ organizationId: 1, region: 1, isActive: 1 });

export const Responder = model<IResponder>('Responder', responderSchema);
