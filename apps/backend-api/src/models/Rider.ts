import { Schema, model } from 'mongoose';
import { IRider } from '../types';

const riderSchema = new Schema<IRider>(
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
    deviceId: {
      type: String,
      sparse: true,
      index: true, // For device-based lookups
    },
  },
  {
    timestamps: true,
    collection: 'riders',
  }
);

// Index for email lookups during authentication
riderSchema.index({ email: 1 });

// Index for device ID lookups when incidents are created
riderSchema.index({ deviceId: 1 }, { sparse: true });

export const Rider = model<IRider>('Rider', riderSchema);
