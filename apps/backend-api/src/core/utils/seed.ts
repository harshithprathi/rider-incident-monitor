/**
 * Seed script - Create rich sample data for testing and demonstrations
 * Includes bcrypt-hashed passwords for all users
 */

import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { connectDatabase } from '../config/database';
import { Organization } from '../../auth/schemas/organization.model';
import { Rider } from '../../auth/schemas/rider.model';
import { Responder } from '../../auth/schemas/responder.model';
import { Incident } from '../../incidents/schemas/incident.model';
import { IncidentUpdate } from '../../incidents/schemas/incident-update.model';
import { SafeReturnSession } from '../../safe-return/schemas/safe-return-session.model';
import { IdempotencyRecord } from '../../incidents/schemas/idempotency-record.model';
import { IncidentType, IncidentStatus, IncidentUpdateType, SafeReturnStatus } from '../types';
import { logger } from './logger';

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'test123';

async function seed() {
  try {
    await connectDatabase();

    logger.info('Starting comprehensive database seed...');

    // Clear existing data to make seed clean and idempotent
    await Organization.deleteMany({});
    await Rider.deleteMany({});
    await Responder.deleteMany({});
    await Incident.deleteMany({});
    await IncidentUpdate.deleteMany({});
    await SafeReturnSession.deleteMany({});
    await IdempotencyRecord.deleteMany({});
    logger.info('Cleared all existing database collections');

    // Hash the default password for all seed users
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    logger.info('Password hashed successfully for seed users');

    // 1. Create Organization
    const org = await Organization.create({
      name: 'Global Emergency Response Center',
      regions: ['north', 'south', 'east', 'west'],
    });
    logger.info('Organization created', { orgId: org._id });

    // 2. Create Riders (10 riders for varied scenarios)
    const riders = await Rider.create([
      { name: 'John Doe', email: 'john@example.com', phone: '+1234567890', password: hashedPassword, deviceId: 'device-001' },
      { name: 'Jane Smith', email: 'jane@example.com', phone: '+1234567891', password: hashedPassword, deviceId: 'device-002' },
      { name: 'Bob Johnson', email: 'bob@example.com', phone: '+1234567892', password: hashedPassword, deviceId: 'device-003' },
      { name: 'Alice Brown', email: 'alice@example.com', phone: '+1234567893', password: hashedPassword, deviceId: 'device-004' },
      { name: 'Charlie Davis', email: 'charlie@example.com', phone: '+1234567894', password: hashedPassword, deviceId: 'device-005' },
      { name: 'Emma Wilson', email: 'emma@example.com', phone: '+1234567895', password: hashedPassword, deviceId: 'device-006' },
      { name: 'Frank Miller', email: 'frank@example.com', phone: '+1234567896', password: hashedPassword, deviceId: 'device-007' },
      { name: 'Grace Lee', email: 'grace@example.com', phone: '+1234567897', password: hashedPassword, deviceId: 'device-008' },
      { name: 'Henry Green', email: 'henry@example.com', phone: '+1234567898', password: hashedPassword, deviceId: 'device-009' },
      { name: 'Ivy Taylor', email: 'ivy@example.com', phone: '+1234567899', password: hashedPassword, deviceId: 'device-010' },
    ]);
    logger.info('Riders created', { count: riders.length });

    // 3. Create Responders (Distributed across regions with active/inactive states)
    const responders = await Responder.create([
      { name: 'Officer Sarah Johnson', email: 'sarah@emergency.com', phone: '+1234567820', password: hashedPassword, organizationId: org._id, region: 'north', isActive: true },
      { name: 'Officer Mike Williams', email: 'mike@emergency.com', phone: '+1234567821', password: hashedPassword, organizationId: org._id, region: 'north', isActive: true },
      { name: 'Officer David Smith', email: 'david@emergency.com', phone: '+1234567822', password: hashedPassword, organizationId: org._id, region: 'south', isActive: true },
      { name: 'Officer Karen Davis', email: 'karen@emergency.com', phone: '+1234567823', password: hashedPassword, organizationId: org._id, region: 'east', isActive: true },
      { name: 'Officer James Taylor', email: 'james@emergency.com', phone: '+1234567824', password: hashedPassword, organizationId: org._id, region: 'west', isActive: true },
      { name: 'Officer Tom Brown', email: 'tom@emergency.com', phone: '+1234567825', password: hashedPassword, organizationId: org._id, region: 'south', isActive: true },
      { name: 'Officer Lisa Anderson', email: 'lisa@emergency.com', phone: '+1234567826', password: hashedPassword, organizationId: org._id, region: 'east', isActive: false },
      { name: 'Officer Amy Garcia', email: 'amy@emergency.com', phone: '+1234567827', password: hashedPassword, organizationId: org._id, region: 'west', isActive: false },
    ]);
    logger.info('Responders created', { count: responders.length });

    // Crash telemetry templates
    const severeCrashTelemetry = {
      i_max: 9.81,
      irms_max: 6.45,
      impact: [
        { tx: 0, iX: 0.1, iY: 0.1, iZ: 0.98 },
        { tx: 10, iX: 2.1, iY: 1.4, iZ: 3.2 },
        { tx: 20, iX: 8.5, iY: 5.2, iZ: 7.1 },
        { tx: 30, iX: 9.81, iY: 5.9, iZ: 8.4 },
        { tx: 40, iX: 4.2, iY: 2.1, iZ: 4.0 },
      ],
      rms: [
        { tx: 0, accel: 1.0, gyro: 0.1, impact: 0.1, impulse: 0.01 },
        { tx: 10, accel: 2.5, gyro: 0.8, impact: 2.4, impulse: 0.4 },
        { tx: 20, accel: 7.9, gyro: 3.1, impact: 6.0, impulse: 1.5 },
        { tx: 30, accel: 9.2, gyro: 3.8, impact: 6.45, impulse: 2.1 },
        { tx: 40, accel: 3.5, gyro: 1.5, impact: 3.0, impulse: 0.9 },
      ],
    };

    const minorCrashTelemetry = {
      i_max: 3.42,
      irms_max: 2.15,
      impact: [
        { tx: 0, iX: 0.05, iY: 0.05, iZ: 0.99 },
        { tx: 10, iX: 1.12, iY: 0.52, iZ: 1.45 },
        { tx: 20, iX: 3.42, iY: 1.84, iZ: 2.88 },
        { tx: 30, iX: 2.10, iY: 1.05, iZ: 1.80 },
      ],
      rms: [
        { tx: 0, accel: 1.0, gyro: 0.05, impact: 0.05, impulse: 0.005 },
        { tx: 10, accel: 1.4, gyro: 0.32, impact: 0.98, impulse: 0.12 },
        { tx: 20, accel: 2.8, gyro: 1.15, impact: 2.15, impulse: 0.65 },
        { tx: 30, accel: 1.9, gyro: 0.65, impact: 1.30, impulse: 0.35 },
      ],
    };

    // 4. Create Incidents spanning all combinations of types, statuses, regions, and assignments
    const incidentsData = [
      // --- North Region Incidents ---
      {
        type: IncidentType.ACTIVE_CRASH,
        status: IncidentStatus.LIVE,
        riderId: riders[0]._id,
        location: { latitude: 37.7749, longitude: -122.4194, address: 'Highway 101 N, San Francisco, CA', timestamp: new Date() },
        processedData: severeCrashTelemetry,
        organizationId: org._id,
        region: 'north',
        description: 'Severe crash detected near Golden Gate Bridge',
        createdAt: new Date(),
      },
      {
        type: IncidentType.SOS,
        status: IncidentStatus.LIVE,
        riderId: riders[1]._id,
        responderId: responders[0]._id, // Sarah Johnson
        location: { latitude: 37.8044, longitude: -122.2712, address: 'Broadway & 14th St, Oakland, CA', timestamp: new Date(Date.now() - 15 * 60 * 1000) }, // 15 mins ago
        organizationId: org._id,
        region: 'north',
        description: 'SOS triggered from dangerous intersection',
        createdAt: new Date(Date.now() - 15 * 60 * 1000),
      },
      {
        type: IncidentType.SAFE_RETURN_MISSED,
        status: IncidentStatus.LIVE,
        riderId: riders[2]._id,
        location: { latitude: 37.7879, longitude: -122.4074, address: 'Union Square, San Francisco, CA', timestamp: new Date(Date.now() - 45 * 60 * 1000) }, // 45 mins ago
        organizationId: org._id,
        region: 'north',
        description: 'Journey safety timeout: Rider missed safe return check-in',
        createdAt: new Date(Date.now() - 45 * 60 * 1000),
      },
      {
        type: IncidentType.ACTIVE_CRASH,
        status: IncidentStatus.RESOLVED,
        riderId: riders[3]._id,
        responderId: responders[1]._id, // Mike Williams
        location: { latitude: 37.3382, longitude: -121.8863, address: 'Downtown San Jose, CA', timestamp: new Date(Date.now() - 2 * 3600 * 1000) }, // 2 hours ago
        processedData: minorCrashTelemetry,
        organizationId: org._id,
        region: 'north',
        description: 'Minor collision. Checked by responder, rider safe.',
        createdAt: new Date(Date.now() - 2 * 3600 * 1000),
        resolvedAt: new Date(Date.now() - 1.5 * 3600 * 1000),
      },

      // --- South Region Incidents ---
      {
        type: IncidentType.ACTIVE_CRASH,
        status: IncidentStatus.LIVE,
        riderId: riders[4]._id,
        location: { latitude: 34.0522, longitude: -118.2437, address: 'I-5 South, Los Angeles, CA', timestamp: new Date() },
        processedData: severeCrashTelemetry,
        organizationId: org._id,
        region: 'south',
        description: 'Multiple vehicle crash reported on highway',
        createdAt: new Date(),
      },
      {
        type: IncidentType.SOS,
        status: IncidentStatus.LIVE,
        riderId: riders[5]._id,
        responderId: responders[2]._id, // David Smith
        location: { latitude: 32.7157, longitude: -117.1611, address: 'Gaslamp Quarter, San Diego, CA', timestamp: new Date(Date.now() - 30 * 60 * 1000) },
        organizationId: org._id,
        region: 'south',
        description: 'Rider feeling unsafe in dark parking lot',
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
      {
        type: IncidentType.SOS,
        status: IncidentStatus.RESOLVED,
        riderId: riders[6]._id,
        responderId: responders[5]._id, // Tom Brown
        location: { latitude: 34.1425, longitude: -118.1503, address: 'Colorado Blvd, Pasadena, CA', timestamp: new Date(Date.now() - 4 * 3600 * 1000) },
        organizationId: org._id,
        region: 'south',
        description: 'SOS triggered accidentally',
        createdAt: new Date(Date.now() - 4 * 3600 * 1000),
        resolvedAt: new Date(Date.now() - 3.8 * 3600 * 1000),
      },

      // --- East Region Incidents ---
      {
        type: IncidentType.ACTIVE_CRASH,
        status: IncidentStatus.LIVE,
        riderId: riders[7]._id,
        location: { latitude: 40.7128, longitude: -74.0060, address: 'FDR Drive, New York, NY', timestamp: new Date(Date.now() - 10 * 60 * 1000) },
        processedData: severeCrashTelemetry,
        organizationId: org._id,
        region: 'east',
        description: 'Motorcycle collision on highway expressway',
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      },
      {
        type: IncidentType.SAFE_RETURN_MISSED,
        status: IncidentStatus.LIVE,
        riderId: riders[8]._id,
        responderId: responders[3]._id, // Karen Davis
        location: { latitude: 42.3601, longitude: -71.0589, address: 'Boston Common, Boston, MA', timestamp: new Date(Date.now() - 2 * 3600 * 1000) },
        organizationId: org._id,
        region: 'east',
        description: 'Missed check-in warning followed by escalation',
        createdAt: new Date(Date.now() - 2 * 3600 * 1000),
      },

      // --- West Region Incidents ---
      {
        type: IncidentType.SOS,
        status: IncidentStatus.LIVE,
        riderId: riders[9]._id,
        location: { latitude: 47.6062, longitude: -122.3321, address: 'Pike Place Market, Seattle, WA', timestamp: new Date() },
        organizationId: org._id,
        region: 'west',
        description: 'Emergency SOS triggered',
        createdAt: new Date(),
      },
      {
        type: IncidentType.ACTIVE_CRASH,
        status: IncidentStatus.LIVE,
        riderId: riders[0]._id,
        location: { latitude: 45.5152, longitude: -122.6784, address: 'Burnside St, Portland, OR', timestamp: new Date(Date.now() - 12 * 3600 * 1000) }, // 12 hours ago
        processedData: minorCrashTelemetry,
        organizationId: org._id,
        region: 'west',
        description: 'Low-speed impact alert',
        createdAt: new Date(Date.now() - 12 * 3600 * 1000),
      },
      {
        type: IncidentType.ACTIVE_CRASH,
        status: IncidentStatus.RESOLVED,
        riderId: riders[1]._id,
        responderId: responders[4]._id, // James Taylor
        location: { latitude: 39.7392, longitude: -104.9903, address: 'Colfax Ave, Denver, CO', timestamp: new Date(Date.now() - 24 * 3600 * 1000) },
        processedData: severeCrashTelemetry,
        organizationId: org._id,
        region: 'west',
        description: 'Severe crash resolved, rider transported to clinic.',
        createdAt: new Date(Date.now() - 24 * 3600 * 1000),
        resolvedAt: new Date(Date.now() - 23.5 * 3600 * 1000),
      },
    ];

    const incidents = await Incident.create(incidentsData);
    logger.info('Incidents created', { count: incidents.length });

    // 5. Create rich timeline of incident updates for the main active incident
    const updatesData = [
      {
        incidentId: incidents[0]._id,
        sequenceNumber: 1,
        type: IncidentUpdateType.CREATED,
        data: { type: IncidentType.ACTIVE_CRASH, location: incidents[0].location, createdAt: incidents[0].createdAt },
        createdAt: incidents[0].createdAt,
      },
      {
        incidentId: incidents[0]._id,
        sequenceNumber: 2,
        type: IncidentUpdateType.SENSOR_DATA,
        data: { i_max: 9.81, irms_max: 6.45, impactVector: { x: 8.5, y: 5.2, z: 7.1 }, severity: 'HIGH' },
        createdAt: new Date(incidents[0].createdAt.getTime() + 1000), // 1s later
      },
      {
        incidentId: incidents[0]._id,
        sequenceNumber: 3,
        type: IncidentUpdateType.LOCATION_UPDATE,
        data: { latitude: 37.7750, longitude: -122.4195, address: 'Highway 101 N (Refined Coordinates), San Francisco, CA', timestamp: new Date() },
        createdAt: new Date(incidents[0].createdAt.getTime() + 5000), // 5s later
      },
      {
        incidentId: incidents[0]._id,
        sequenceNumber: 4,
        type: IncidentUpdateType.RESPONDER_ASSIGNED,
        data: { responderId: responders[0]._id.toString(), responderName: responders[0].name, assignedAt: new Date() },
        createdBy: responders[0]._id,
        createdByModel: 'Responder',
        createdAt: new Date(incidents[0].createdAt.getTime() + 30 * 1000), // 30s later
      },
      {
        incidentId: incidents[0]._id,
        sequenceNumber: 5,
        type: IncidentUpdateType.COMMENT,
        data: { comment: 'En route to the coordinates. ETA 4 minutes.' },
        createdBy: responders[0]._id,
        createdByModel: 'Responder',
        createdAt: new Date(incidents[0].createdAt.getTime() + 60 * 1000), // 1m later
      },
      {
        incidentId: incidents[0]._id,
        sequenceNumber: 6,
        type: IncidentUpdateType.COMMENT,
        data: { comment: 'Dispatching additional paramedic support as a precaution.' },
        createdBy: responders[1]._id,
        createdByModel: 'Responder',
        createdAt: new Date(incidents[0].createdAt.getTime() + 90 * 1000), // 1.5m later
      },
    ];

    const updates = await IncidentUpdate.create(updatesData as any);
    logger.info('Incident updates created for incident 0', { count: (updates as any).length });

    // Seed updates for incident 1 (Sarah Johnson assigned SOS)
    await IncidentUpdate.create([
      {
        incidentId: incidents[1]._id,
        sequenceNumber: 1,
        type: IncidentUpdateType.CREATED,
        data: { type: IncidentType.SOS, location: incidents[1].location, createdAt: incidents[1].createdAt },
        createdAt: incidents[1].createdAt,
      },
      {
        incidentId: incidents[1]._id,
        sequenceNumber: 2,
        type: IncidentUpdateType.RESPONDER_ASSIGNED,
        data: { responderId: responders[0]._id.toString(), responderName: responders[0].name, assignedAt: new Date() },
        createdBy: responders[0]._id,
        createdByModel: 'Responder',
        createdAt: new Date(incidents[1].createdAt.getTime() + 10 * 1000),
      },
      {
        incidentId: incidents[1]._id,
        sequenceNumber: 3,
        type: IncidentUpdateType.COMMENT,
        data: { comment: 'Contact established. Rider reports minor harassment, safely escorting them to vehicle.' },
        createdBy: responders[0]._id,
        createdByModel: 'Responder',
        createdAt: new Date(incidents[1].createdAt.getTime() + 5 * 60 * 1000),
      },
    ] as any);

    // Seed updates for incident 2 (Safe Return checkin missed)
    await IncidentUpdate.create([
      {
        incidentId: incidents[2]._id,
        sequenceNumber: 1,
        type: IncidentUpdateType.CREATED,
        data: { type: IncidentType.SAFE_RETURN_MISSED, location: incidents[2].location, createdAt: incidents[2].createdAt },
        createdAt: incidents[2].createdAt,
      },
      {
        incidentId: incidents[2]._id,
        sequenceNumber: 2,
        type: IncidentUpdateType.COMMENT,
        data: { comment: 'Automated System Alert: Safe Return session missed check-in deadline.' },
        createdAt: new Date(incidents[2].createdAt.getTime() + 1000),
      },
    ] as any);

    // 6. Create Safe Return Sessions (ACTIVE, COMPLETED, almost expired, expired)
    const safeReturnSessionsData = [
      {
        riderId: riders[0]._id, // John Doe
        destination: '123 Market St, San Francisco, CA',
        destinationCoords: { latitude: 37.7891, longitude: -122.4014, timestamp: new Date() },
        deadline: new Date(Date.now() + 45 * 60 * 1000), // 45 minutes from now
        status: SafeReturnStatus.ACTIVE,
        organizationId: org._id,
        region: 'north',
      },
      {
        riderId: riders[1]._id, // Jane Smith
        destination: 'Palo Alto Transit Center, Palo Alto, CA',
        destinationCoords: { latitude: 37.4431, longitude: -122.1642, timestamp: new Date() },
        deadline: new Date(Date.now() + 2 * 3600 * 1000), // 2 hours from now
        status: SafeReturnStatus.ACTIVE,
        organizationId: org._id,
        region: 'north',
      },
      {
        riderId: riders[2]._id, // Bob Johnson
        destination: 'Oakland Airport, Oakland, CA',
        destinationCoords: { latitude: 37.7126, longitude: -122.2197, timestamp: new Date() },
        deadline: new Date(Date.now() - 30 * 60 * 1000), // deadline was 30 mins ago
        status: SafeReturnStatus.COMPLETED,
        completedAt: new Date(Date.now() - 40 * 60 * 1000), // completed 40 mins ago (safe)
        organizationId: org._id,
        region: 'north',
      },
      {
        riderId: riders[3]._id, // Alice Brown
        destination: 'Stanford University, Stanford, CA',
        destinationCoords: { latitude: 37.4275, longitude: -122.1697, timestamp: new Date() },
        deadline: new Date(Date.now() - 3 * 3600 * 1000),
        status: SafeReturnStatus.COMPLETED,
        completedAt: new Date(Date.now() - 3.5 * 3600 * 1000),
        organizationId: org._id,
        region: 'north',
      },
      {
        riderId: riders[4]._id, // Charlie Davis
        destination: 'Santa Monica Pier, Santa Monica, CA',
        destinationCoords: { latitude: 34.0101, longitude: -118.4961, timestamp: new Date() },
        deadline: new Date(Date.now() + 2 * 60 * 1000), // Urgency test: expires in 2 minutes
        status: SafeReturnStatus.ACTIVE,
        organizationId: org._id,
        region: 'south',
      },
    ];

    const safeReturnSessions = await SafeReturnSession.create(safeReturnSessionsData);
    logger.info('Safe Return Sessions created', { count: safeReturnSessions.length });

    // 7. Create Idempotency Records
    const idempotencyRecordsData = [
      {
        key: `idemp-key-completed-1`,
        incidentId: incidents[0]._id,
        status: 'COMPLETED',
        response: { data: { incident: incidents[0] }, meta: {} },
        expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
      },
      {
        key: `idemp-key-completed-2`,
        incidentId: incidents[1]._id,
        status: 'COMPLETED',
        response: { data: { incident: incidents[1] }, meta: {} },
        expiresAt: new Date(Date.now() + 15 * 3600 * 1000),
      },
      {
        key: `idemp-key-processing-1`,
        incidentId: new Types.ObjectId(),
        status: 'PROCESSING',
        response: {},
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        createdAt: new Date(), // Active processing
      },
      {
        key: `idemp-key-stale-1`,
        incidentId: new Types.ObjectId(),
        status: 'PROCESSING',
        response: {},
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        createdAt: new Date(Date.now() - 120 * 1000), // Stale processing (created 2 mins ago)
      },
    ];

    await IdempotencyRecord.create(idempotencyRecordsData as any);
    logger.info('Idempotency records seeded', { count: idempotencyRecordsData.length });

    logger.info('Comprehensive Database Seeding Completed Successfully!');
    logger.info('Sample Login Credentials for Manual Demo:');
    logger.info('------------------------------------------');
    logger.info('  1. Rider Logins:');
    logger.info('     - John Doe:     john@example.com / test123');
    logger.info('     - Jane Smith:    jane@example.com / test123');
    logger.info('     - Bob Johnson:   bob@example.com / test123');
    logger.info('     - Alice Brown:   alice@example.com / test123');
    logger.info('  2. Responder Logins:');
    logger.info('     - North (Sarah Johnson):  sarah@emergency.com / test123');
    logger.info('     - North (Mike Williams):  mike@emergency.com / test123');
    logger.info('     - South (David Smith):    david@emergency.com / test123');
    logger.info('     - East (Karen Davis):     karen@emergency.com / test123');
    logger.info('     - West (James Taylor):    james@emergency.com / test123');
    logger.info('------------------------------------------');

    process.exit(0);

  } catch (error) {
    logger.error('Database seeding failed', error);
    process.exit(1);
  }
}

seed();
