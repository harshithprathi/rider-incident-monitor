import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { Rider } from '../models/Rider';
import { Responder } from '../models/Responder';
import { JwtPayload, UserRole, ApiResponse, AuthResponseData } from '../types';
import { logger } from '../utils/logger';

/**
 * Authentication Service
 * - JWT token generation and verification
 * - Password hashing and validation (bcrypt)
 * - User authentication with real password checking
 */
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly saltRounds: number;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1h';
    this.saltRounds = 10;

    if (this.jwtSecret === 'your-secret-key-change-in-production') {
      logger.warn('Using default JWT secret - change in production!');
    }
  }

  /**
   * Generate JWT token
   */
  generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    } as jwt.SignOptions);
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('TOKEN_EXPIRED');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('INVALID_TOKEN');
      }
      throw error;
    }
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Verify password against bcrypt hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Authenticate rider with real password verification
   */
  async authenticateRider(
    email: string,
    password: string
  ): Promise<ApiResponse<AuthResponseData>> {
    try {
      // Use .select('+password') to include the password field for verification
      const rider = await Rider.findOne({ email: email.toLowerCase() }).select('+password');

      if (!rider) {
        logger.warn('Rider authentication failed - user not found', { email });

        return {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        };
      }

      // Verify password with bcrypt
      const isValidPassword = await this.verifyPassword(password, rider.password);
      if (!isValidPassword) {
        logger.warn('Rider authentication failed - invalid password', { email });

        return {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        };
      }

      const token = this.generateToken({
        userId: rider._id.toString(),
        role: UserRole.RIDER,
      });

      logger.info('Rider authenticated successfully', {
        riderId: rider._id,
      });

      return {
        data: {
          token,
          user: {
            id: rider._id,
            name: rider.name,
            email: rider.email,
            role: UserRole.RIDER,
          },
        },
        meta: {},
      };
    } catch (error) {
      logger.error('Rider authentication error', error);
      throw error;
    }
  }

  /**
   * Authenticate responder with real password verification
   */
  async authenticateResponder(
    email: string,
    password: string
  ): Promise<ApiResponse<AuthResponseData>> {
    try {
      // Use .select('+password') and populate organization for org name
      const responder = await Responder.findOne({ email: email.toLowerCase() })
        .select('+password')
        .populate('organizationId', 'name');

      if (!responder || !responder.isActive) {
        logger.warn('Responder authentication failed - user not found or inactive', { email });

        return {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        };
      }

      // Verify password with bcrypt
      const isValidPassword = await this.verifyPassword(password, responder.password);
      if (!isValidPassword) {
        logger.warn('Responder authentication failed - invalid password', { email });

        return {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        };
      }

      const org = responder.organizationId as any;
      const orgId = org && org._id ? org._id.toString() : (responder.organizationId ? responder.organizationId.toString() : '');

      const token = this.generateToken({
        userId: responder._id.toString(),
        role: UserRole.RESPONDER,
        organizationId: orgId,
        region: responder.region,
      });

      logger.info('Responder authenticated successfully', {
        responderId: responder._id,
        organizationId: orgId,
        region: responder.region,
      });

      return {
        data: {
          token,
          user: {
            id: responder._id,
            name: responder.name,
            email: responder.email,
            role: UserRole.RESPONDER,
            organizationId: orgId,
            organizationName: org ? org.name : undefined,
            region: responder.region,
          },
        },
        meta: {},
      };
    } catch (error) {
      logger.error('Responder authentication error', error);
      throw error;
    }
  }

  /**
   * Register new rider with bcrypt password hashing
   */
  async registerRider(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<ApiResponse<AuthResponseData>> {
    try {
      // Check if user already exists
      const existing = await Rider.findOne({ email: data.email.toLowerCase() });
      if (existing) {
        return {
          error: {
            code: 'USER_EXISTS',
            message: 'User with this email already exists',
          },
        };
      }

      // Hash password with bcrypt
      const hashedPassword = await this.hashPassword(data.password);

      // Create rider with hashed password
      const rider = await Rider.create({
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        password: hashedPassword,
      });

      logger.info('Rider registered successfully', {
        riderId: rider._id,
      });

      // Generate token
      const token = this.generateToken({
        userId: rider._id.toString(),
        role: UserRole.RIDER,
      });

      return {
        data: {
          token,
          user: {
            id: rider._id,
            name: rider.name,
            email: rider.email,
            role: UserRole.RIDER,
          },
        },
        meta: {},
      };
    } catch (error) {
      logger.error('Rider registration error', error);
      throw error;
    }
  }

  /**
   * Register new responder with bcrypt password hashing
   */
  async registerResponder(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    organizationId: string;
    region: string;
  }): Promise<ApiResponse<AuthResponseData>> {
    try {
      // Check if user already exists
      const existing = await Responder.findOne({ email: data.email.toLowerCase() });
      if (existing) {
        return {
          error: {
            code: 'USER_EXISTS',
            message: 'User with this email already exists',
          },
        };
      }

      // Hash password with bcrypt
      const hashedPassword = await this.hashPassword(data.password);

      // Create responder with hashed password
      const responder = await Responder.create({
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        password: hashedPassword,
        organizationId: new Types.ObjectId(data.organizationId),
        region: data.region,
        isActive: true,
      });

      logger.info('Responder registered successfully', {
        responderId: responder._id,
        organizationId: data.organizationId,
        region: data.region,
      });

      // Generate token
      const token = this.generateToken({
        userId: responder._id.toString(),
        role: UserRole.RESPONDER,
        organizationId: data.organizationId,
        region: data.region,
      });

      return {
        data: {
          token,
          user: {
            id: responder._id,
            name: responder.name,
            email: responder.email,
            role: UserRole.RESPONDER,
            organizationId: responder.organizationId.toString(),
            region: responder.region,
          },
        },
        meta: {},
      };
    } catch (error) {
      logger.error('Responder registration error', error);
      throw error;
    }
  }
}
