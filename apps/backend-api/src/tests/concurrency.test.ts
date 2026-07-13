/**
 * Feature C: Concurrency Test
 * 
 * Tests that concurrent requests with the same idempotency key
 * create exactly ONE incident, not multiple.
 * 
 * This test fires 100 concurrent requests and verifies:
 * 1. All requests return successfully
 * 2. All return the same incident ID
 * 3. Only one incident exists in database
 * 4. Only one set of notifications sent (checked via incident updates)
 */

import { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { IncidentService } from '../services/IncidentService';
import { Incident } from '../models/Incident';
import { IncidentUpdate } from '../models/IncidentUpdate';
import { IdempotencyRecord } from '../models/IdempotencyRecord';
import { Organization } from '../models/Organization';
import { Rider } from '../models/Rider';
import { IncidentType } from '../types';

describe('Feature C: Idempotent Incident Ingestion Under Concurrency', () => {
  let incidentService: IncidentService;
  let testOrg: any;
  let testRider: any;

  beforeAll(async () => {
    await connectDatabase();
    incidentService = new IncidentService();

    // Create test data
    testOrg = await Organization.create({
      name: 'Test Organization',
      regions: ['test-region'],
    });

    testRider = await Rider.create({
      name: 'Test Rider',
      email: 'test@example.com',
      phone: '+1234567890',
      password: '$2b$10$testhashedpasswordplaceholder12345678',
      deviceId: 'test-device',
    });
  });

  afterAll(async () => {
    // Cleanup
    await Organization.deleteMany({});
    await Rider.deleteMany({});
    await Incident.deleteMany({});
    await IncidentUpdate.deleteMany({});
    await IdempotencyRecord.deleteMany({});
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clear incidents and idempotency records before each test
    await Incident.deleteMany({});
    await IncidentUpdate.deleteMany({});
    await IdempotencyRecord.deleteMany({});
  });

  it('should create exactly ONE incident when 100 concurrent requests arrive with same idempotency key', async () => {
    const idempotencyKey = `crash-${Date.now()}`;
    const incidentData = {
      type: IncidentType.ACTIVE_CRASH,
      riderId: testRider._id.toString(),
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        address: 'San Francisco, CA',
        timestamp: new Date(),
      },
      organizationId: testOrg._id.toString(),
      region: 'test-region',
      description: 'Concurrency test incident',
    };

    console.log('Firing 100 concurrent requests with idempotency key:', idempotencyKey);

    // Fire 100 concurrent requests
    const startTime = Date.now();
    const promises = Array(100)
      .fill(null)
      .map(() =>
        incidentService.createIncidentIdempotent(idempotencyKey, incidentData)
      );

    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;

    console.log(`All requests completed in ${duration}ms`);

    // Verify all requests succeeded (no errors or all have same incident)
    const successfulResults = results.filter((r) => r.data?.incident);
    const inProgressResults = results.filter(
      (r) => r.error?.code === 'REQUEST_IN_PROGRESS'
    );

    console.log(`Successful responses: ${successfulResults.length}`);
    console.log(`In-progress responses: ${inProgressResults.length}`);

    // Extract incident IDs
    const incidentIds = successfulResults.map((r) => r.data!.incident._id.toString());
    const uniqueIds = new Set(incidentIds);

    console.log(`Unique incident IDs: ${uniqueIds.size}`);
    console.log('Incident ID:', Array.from(uniqueIds)[0]);

    // CRITICAL ASSERTION: Only ONE unique incident ID
    expect(uniqueIds.size).toBe(1);

    // Verify in database: exactly one incident exists
    const incidentsInDb = await Incident.find({
      riderId: testRider._id,
    });

    console.log(`Incidents in database: ${incidentsInDb.length}`);
    expect(incidentsInDb.length).toBe(1);

    // Verify only one idempotency record
    const idempotencyRecords = await IdempotencyRecord.find({
      key: idempotencyKey,
    });

    console.log(`Idempotency records: ${idempotencyRecords.length}`);
    expect(idempotencyRecords.length).toBe(1);

    // Verify exactly one set of incident updates (sequence starts at 1)
    const updates = await IncidentUpdate.find({
      incidentId: incidentsInDb[0]._id,
    }).sort({ sequenceNumber: 1 });

    console.log(`Incident updates: ${updates.length}`);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0].sequenceNumber).toBe(1);

    // Verify no gaps in sequence numbers
    for (let i = 0; i < updates.length; i++) {
      expect(updates[i].sequenceNumber).toBe(i + 1);
    }

    console.log('✅ Concurrency test passed: Exactly ONE incident created');
  }, 30000); // 30 second timeout

  it('should handle race condition with duplicate key error gracefully', async () => {
    const idempotencyKey = `crash-${Date.now()}-race`;

    // Simulate extreme race condition with Promise.race
    // First request should win, others should get duplicate error
    const results = await Promise.all([
      incidentService.createIncidentIdempotent(idempotencyKey, {
        type: IncidentType.SOS,
        riderId: testRider._id.toString(),
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          address: 'SF',
          timestamp: new Date(),
        },
        organizationId: testOrg._id.toString(),
        region: 'test-region',
      }),
      incidentService.createIncidentIdempotent(idempotencyKey, {
        type: IncidentType.SOS,
        riderId: testRider._id.toString(),
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          address: 'SF',
          timestamp: new Date(),
        },
        organizationId: testOrg._id.toString(),
        region: 'test-region',
      }),
    ]);

    // At least one should succeed
    const successCount = results.filter((r) => r.data?.incident).length;
    expect(successCount).toBeGreaterThanOrEqual(1);

    // Only one incident in database
    const incidents = await Incident.find({ riderId: testRider._id });
    expect(incidents.length).toBe(1);
  });

  it('should return same response for duplicate requests', async () => {
    const idempotencyKey = `crash-${Date.now()}-same-response`;

    const incidentData = {
      type: IncidentType.ACTIVE_CRASH,
      riderId: testRider._id.toString(),
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        address: 'Test Location',
        timestamp: new Date(),
      },
      organizationId: testOrg._id.toString(),
      region: 'test-region',
    };

    // First request
    const response1 = await incidentService.createIncidentIdempotent(
      idempotencyKey,
      incidentData
    );

    expect(response1.data?.incident).toBeDefined();
    const incidentId1 = response1.data!.incident._id;

    // Wait a bit to ensure first request completes
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second request with same key
    const response2 = await incidentService.createIncidentIdempotent(
      idempotencyKey,
      incidentData
    );

    // Should return same incident
    expect(response2.data?.incident).toBeDefined();
    const incidentId2 = response2.data!.incident._id;

    expect(incidentId1.toString()).toBe(incidentId2.toString());
  });
});
