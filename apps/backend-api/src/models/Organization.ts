import { Schema, model } from 'mongoose';
import { IOrganization } from '../types';

const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    regions: {
      type: [String],
      required: true,
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'organizations',
  }
);

// Index for organization name lookups
organizationSchema.index({ name: 1 });

export const Organization = model<IOrganization>('Organization', organizationSchema);
