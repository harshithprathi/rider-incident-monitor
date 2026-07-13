import { Schema, model } from 'mongoose';
import { IOrganization } from '../../core/types';

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

export const Organization = model<IOrganization>('Organization', organizationSchema);
