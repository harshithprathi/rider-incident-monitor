/**
 * Seed script - Create sample data for testing
 * Includes bcrypt-hashed passwords for all users
 */

import bcrypt from 'bcrypt';
import { connectDatabase } from '../config/database';
import { Organization } from '../../auth/schemas/organization.model';
import { Rider } from '../../auth/schemas/rider.model';
import { Responder } from '../../auth/schemas/responder.model';
import { Incident } from '../../incidents/schemas/incident.model';
import { IncidentUpdate } from '../../incidents/schemas/incident-update.model';
import { IncidentType, IncidentStatus, IncidentUpdateType } from '../types';
import { logger } from './logger';

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'test123';

async function seed() {
  try {
    await connectDatabase();

    logger.info('Starting seed...');

    // Clear existing data to make seed idempotent
    await Organization.deleteMany({});
    await Rider.deleteMany({});
    await Responder.deleteMany({});
    await Incident.deleteMany({});
    await IncidentUpdate.deleteMany({});
    logger.info('Cleared existing database collections');

    // Hash the default password for all seed users
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    logger.info('Password hashed for seed users');

    // Create organization
    const org = await Organization.create({
      name: 'Emergency Response Center',
      regions: ['north', 'south', 'east', 'west'],
    });

    logger.info('Organization created', { orgId: org._id });

    // Create riders with hashed passwords
    const riders = await Rider.create([
      {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        password: hashedPassword,
        deviceId: 'device-001',
      },
      {
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+1234567891',
        password: hashedPassword,
        deviceId: 'device-002',
      },
    ]);

    logger.info('Riders created', { count: riders.length });

    // Create responders with hashed passwords
    const responders = await Responder.create([
      {
        name: 'Officer Sarah Johnson',
        email: 'sarah@emergency.com',
        phone: '+1234567892',
        password: hashedPassword,
        organizationId: org._id,
        region: 'north',
        isActive: true,
      },
      {
        name: 'Officer Mike Williams',
        email: 'mike@emergency.com',
        phone: '+1234567893',
        password: hashedPassword,
        organizationId: org._id,
        region: 'north',
        isActive: true,
      },
    ]);

    logger.info('Responders created', { count: responders.length });

    // Create sample incidents with crash data
    const crashData = {
      i_max: 7.84,
      irms_max: 5.12,
      impact: [
        { tx: 0, iX: 0.12, iY: -0.04, iZ: 0.98 },
        { tx: 10, iX: 1.40, iY: 0.61, iZ: 2.10 },
        { tx: 20, iX: 5.92, iY: 3.11, iZ: 4.77 },
        { tx: 30, iX: 7.84, iY: 4.21, iZ: 6.10 },
        { tx: 40, iX: 6.50, iY: 3.80, iZ: 5.20 },
        { tx: 50, iX: 4.20, iY: 2.50, iZ: 3.80 },
        { tx: 60, iX: 2.10, iY: 1.20, iZ: 2.00 },
        { tx: 70, iX: 0.90, iY: 0.50, iZ: 1.10 },
      ],
      rms: [
        { tx: 0, accel: 1.01, gyro: 0.22, impact: 0.10, impulse: 0.02 },
        { tx: 10, accel: 1.88, gyro: 0.95, impact: 1.42, impulse: 0.51 },
        { tx: 20, accel: 3.40, gyro: 2.10, impact: 5.12, impulse: 1.30 },
        { tx: 30, accel: 4.20, gyro: 2.80, impact: 6.50, impulse: 1.80 },
        { tx: 40, accel: 3.80, gyro: 2.40, impact: 5.50, impulse: 1.50 },
        { tx: 50, accel: 2.90, gyro: 1.70, impact: 3.90, impulse: 1.00 },
        { tx: 60, accel: 1.90, gyro: 1.00, impact: 2.20, impulse: 0.60 },
        { tx: 70, accel: 1.20, gyro: 0.50, impact: 1.00, impulse: 0.30 },
      ],
    };

    const unfilteredData = {
      impact: [
        { tx: 0, iX: 0.20, iY: -0.11, iZ: 1.05 },
        { tx: 10, iX: 1.50, iY: 0.70, iZ: 2.20 },
        { tx: 20, iX: 6.10, iY: 3.25, iZ: 4.90 },
        { tx: 30, iX: 8.00, iY: 4.35, iZ: 6.25 },
        { tx: 40, iX: 6.70, iY: 3.95, iZ: 5.35 },
        { tx: 50, iX: 4.35, iY: 2.65, iZ: 3.95 },
        { tx: 60, iX: 2.25, iY: 1.35, iZ: 2.15 },
        { tx: 70, iX: 1.05, iY: 0.65, iZ: 1.25 },
      ],
    };

    const incidents = await Incident.create([
      {
        type: IncidentType.ACTIVE_CRASH,
        status: IncidentStatus.LIVE,
        riderId: riders[0]._id,
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          address: 'San Francisco, CA',
          timestamp: new Date(),
        },
        processedData: crashData,
        unfilteredData: unfilteredData,
        organizationId: org._id,
        region: 'north',
        description: 'Severe crash detected on Highway 101',
      },
      {
        type: IncidentType.SOS,
        status: IncidentStatus.LIVE,
        riderId: riders[1]._id,
        responderId: responders[0]._id,
        location: {
          latitude: 37.8044,
          longitude: -122.2712,
          address: 'Oakland, CA',
          timestamp: new Date(),
        },
        organizationId: org._id,
        region: 'north',
        description: 'Rider triggered SOS button',
      },
      {
        type: IncidentType.ACTIVE_CRASH,
        status: IncidentStatus.RESOLVED,
        riderId: riders[0]._id,
        responderId: responders[1]._id,
        location: {
          latitude: 37.3382,
          longitude: -121.8863,
          address: 'San Jose, CA',
          timestamp: new Date(Date.now() - 3600000), // 1 hour ago
        },
        organizationId: org._id,
        region: 'north',
        description: 'Minor collision, rider safe',
      },
    ]);

    logger.info('Incidents created', { count: incidents.length });

    // Create incident updates for first incident
    const updates = await IncidentUpdate.create([
      {
        incidentId: incidents[0]._id,
        sequenceNumber: 1,
        type: IncidentUpdateType.CREATED,
        data: {
          type: IncidentType.ACTIVE_CRASH,
          location: incidents[0].location,
          createdAt: incidents[0].createdAt,
        },
      },
      {
        incidentId: incidents[0]._id,
        sequenceNumber: 2,
        type: IncidentUpdateType.LOCATION_UPDATE,
        data: {
          latitude: 37.7750,
          longitude: -122.4195,
          address: 'San Francisco, CA - Updated',
          timestamp: new Date(),
        },
      },
      {
        incidentId: incidents[0]._id,
        sequenceNumber: 3,
        type: IncidentUpdateType.RESPONDER_ASSIGNED,
        data: {
          responderId: responders[0]._id.toString(),
          responderName: responders[0].name,
          assignedAt: new Date(),
        },
        createdBy: responders[0]._id,
        createdByModel: 'Responder',
      },
    ]);

    logger.info('Incident updates created', { count: updates.length });

    logger.info('Seed complete!');
    logger.info('Sample login credentials:');
    logger.info('  Rider: john@example.com / test123');
    logger.info('  Responder: sarah@emergency.com / test123');

    process.exit(0);

  } catch (error) {
    logger.error('Seed failed', error);
    process.exit(1);
  }
}

seed();
