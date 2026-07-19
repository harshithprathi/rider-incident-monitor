import { Schema } from 'mongoose';

export const locationSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String },
    timestamp: { type: Date, required: true },
  },
  { _id: false }
);
