import { Schema, model } from 'mongoose';
import { IRider } from '../../core/types';

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
    },
  },
  {
    timestamps: true,
    collection: 'riders',
  }
);

// Index for device ID lookups when incidents are created
riderSchema.index({ deviceId: 1 }, { sparse: true });

export const Rider = model<IRider>('Rider', riderSchema);
