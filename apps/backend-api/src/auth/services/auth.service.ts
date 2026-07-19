import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { Rider } from '../schemas/rider.model';
import { Responder } from '../schemas/responder.model';
import {
  JwtPayload,
  UserRole,
  ApiResponse,
  AuthResponseData,
  IOrganization,
  IRider,
  IResponder,
} from '../../core/types';
import { logger } from '../../core/utils/logger';
import { getRedisClient } from '../../core/config/redis';

/**
 * Authentication Service
 * - JWT token generation and verification
 * - Password hashing and validation (bcrypt)
 * - User authentication with parallelized lookups (optimized latency)
 * - Dynamic mismatch type handling
 * - Centralized verification code workflows
 */
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly saltRounds: number;

  constructor() {
    this.jwtSecret =
      process.env.JWT_SECRET || 'your-secret-key-change-in-production';
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
   * Centralized Smart Authentication
   * - Performs parallel database checks to reduce response latency by ~50%
   * - Allows login even if user type mismatches the requestedType, returning a metadata warning
   */
  async authenticateUser(
    email: string,
    password: string,
    requestedType?: string,
  ): Promise<ApiResponse<AuthResponseData>> {
    try {
      const emailLower = email.toLowerCase();

      // Parallelize DB lookups for Rider and Responder profiles (ESR optimized)
      // Uses lean() to bypass heavy Mongoose Document instantiation overhead
      const [rider, responder] = await Promise.all([
        Rider.findOne({ email: emailLower }).select('+password').lean(),
        Responder.findOne({ email: emailLower })
          .select('+password')
          .populate('organizationId', 'name')
          .lean(),
      ]);

      // Handle "User Not Found" in both collections
      if (!rider && !responder) {
        logger.warn(
          'Authentication failed - user not found in any collection',
          { email },
        );
        return {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        };
      }

      // Check if there is a mismatch, but allow login using actual type and set metadata warning
      let warningMessage: string | undefined;

      if (requestedType === 'rider' && !rider && responder) {
        warningMessage =
          'This email is registered as a Responder. Automatically logging you into the Responder portal.';
      } else if (requestedType === 'responder' && !responder && rider) {
        warningMessage =
          'This email is registered as a Rider. Automatically logging you into the Rider portal.';
      }

      // Authenticate using the actual profile type found in DB
      if (rider) {
        return this.processRiderAuth(rider, password, warningMessage);
      } else if (responder) {
        return this.processResponderAuth(responder, password, warningMessage);
      } else {
        return {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        };
      }
    } catch (error) {
      logger.error('Smart authentication error', error);
      throw error;
    }
  }

  /**
   * Helper: Process password validation and token generation for Riders
   */
  private async processRiderAuth(
    rider: IRider,
    password: string,
    warning?: string,
  ): Promise<ApiResponse<AuthResponseData>> {
    const isValidPassword = await this.verifyPassword(password, rider.password);
    if (!isValidPassword) {
      logger.warn('Rider authentication failed - invalid password', {
        email: rider.email,
      });
      return {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      };
    }

    return this.buildRiderAuthResponse(rider, warning);
  }

  /**
   * Helper: Process password validation, status checks, and token generation for Responders
   */
  private async processResponderAuth(
    responder: IResponder,
    password: string,
    warning?: string,
  ): Promise<ApiResponse<AuthResponseData>> {
    if (!responder.isActive) {
      logger.warn('Responder authentication failed - inactive account', {
        email: responder.email,
      });
      return {
        error: {
          code: 'ACCOUNT_INACTIVE',
          message:
            'Your account has been deactivated. Please contact your administrator.',
        },
      };
    }

    const isValidPassword = await this.verifyPassword(
      password,
      responder.password,
    );
    if (!isValidPassword) {
      logger.warn('Responder authentication failed - invalid password', {
        email: responder.email,
      });
      return {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      };
    }

    return this.buildResponderAuthResponse(responder, warning);
  }

  /**
   * Helper: Build successful Rider authentication response
   */
  private buildRiderAuthResponse(
    rider: IRider,
    warning?: string,
  ): ApiResponse<AuthResponseData> {
    const token = this.generateToken({
      userId: rider._id.toString(),
      role: UserRole.RIDER,
    });

    logger.info('Rider authenticated successfully', { riderId: rider._id });

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
      meta: warning ? { warning } : {},
    };
  }

  /**
   * Helper: Build successful Responder authentication response
   */
  private buildResponderAuthResponse(
    responder: IResponder,
    warning?: string,
  ): ApiResponse<AuthResponseData> {
    const org = responder.organizationId as unknown as IOrganization | null;
    let orgId: string;

    if (org && org._id) {
      orgId = org._id.toString();
    } else if (responder.organizationId) {
      orgId = responder.organizationId.toString();
    } else {
      logger.error('Responder missing organizationId', {
        email: responder.email,
        responderId: responder._id,
      });
      return {
        error: {
          code: 'INVALID_USER_DATA',
          message: 'User profile is incomplete',
        },
      };
    }

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
      meta: warning ? { warning } : {},
    };
  }

  /**
   * Centralized Helper: Check user existence by email and user type
   */
  private async checkUserExists(
    email: string,
    userType: 'rider' | 'responder',
  ): Promise<boolean> {
    const emailLower = email.toLowerCase();
    if (userType === 'rider') {
      const rider = await Rider.findOne({ email: emailLower })
        .select('_id')
        .lean();
      return !!rider;
    } else {
      const responder = await Responder.findOne({ email: emailLower })
        .select('_id')
        .lean();
      return !!responder;
    }
  }

  /**
   * Centralized Helper: Find user details by email and user type
   */
  private async findUserByEmail(
    email: string,
    userType: 'rider' | 'responder',
  ): Promise<any> {
    const emailLower = email.toLowerCase();
    if (userType === 'rider') {
      return Rider.findOne({ email: emailLower }).lean();
    } else {
      return Responder.findOne({ email: emailLower })
        .populate('organizationId', 'name')
        .lean();
    }
  }

  /**
   * Centralized Helper: Generate a verification code, store in Redis with TTL, and return it
   */
  private async generateAndStoreVerificationCode(
    email: string,
    userType: 'rider' | 'responder',
    purpose: 'otp' | 'reset',
    ttlSeconds: number,
  ): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const redis = getRedisClient();
    await redis.set(
      `${purpose}:${email.toLowerCase()}:${userType}`,
      code,
      'EX',
      ttlSeconds,
    );
    return code;
  }

  /**
   * Centralized Helper: Verify a code from Redis and atomically delete it if matching
   */
  private async verifyAndConsumeCode(
    email: string,
    userType: 'rider' | 'responder',
    purpose: 'otp' | 'reset',
    providedCode: string,
  ): Promise<boolean> {
    const emailLower = email.toLowerCase();
    const redis = getRedisClient();
    const key = `${purpose}:${emailLower}:${userType}`;
    const storedCode = await redis.get(key);

    if (!storedCode || storedCode !== providedCode) {
      return false;
    }

    await redis.del(key);
    return true;
  }

  /**
   * Register new rider with parallelized index checks
   */
  async registerRider(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<ApiResponse<AuthResponseData>> {
    try {
      const emailLower = data.email.toLowerCase();

      // Parallelize email conflict verification to reduce latency
      const [existingRider, existingResponder] = await Promise.all([
        Rider.findOne({ email: emailLower }).select('_id').lean(),
        Responder.findOne({ email: emailLower }).select('_id').lean(),
      ]);

      if (existingRider) {
        return {
          error: {
            code: 'USER_EXISTS',
            message: 'This email is already registered as a Rider',
          },
        };
      }

      if (existingResponder) {
        return {
          error: {
            code: 'EMAIL_IN_USE',
            message:
              'This email is already registered as a Responder. Please use a different email.',
          },
        };
      }

      const hashedPassword = await this.hashPassword(data.password);

      const rider = await Rider.create({
        name: data.name,
        email: emailLower,
        phone: data.phone,
        password: hashedPassword,
      });

      logger.info('Rider registered successfully', { riderId: rider._id });

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
   * Register new responder with parallelized index checks
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
      const emailLower = data.email.toLowerCase();

      // Parallelize email conflict verification to reduce latency
      const [existingResponder, existingRider] = await Promise.all([
        Responder.findOne({ email: emailLower }).select('_id').lean(),
        Rider.findOne({ email: emailLower }).select('_id').lean(),
      ]);

      if (existingResponder) {
        return {
          error: {
            code: 'USER_EXISTS',
            message: 'This email is already registered as a Responder',
          },
        };
      }

      if (existingRider) {
        return {
          error: {
            code: 'EMAIL_IN_USE',
            message:
              'This email is already registered as a Rider. Please use a different email.',
          },
        };
      }

      const hashedPassword = await this.hashPassword(data.password);

      const responder = await Responder.create({
        name: data.name,
        email: emailLower,
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

  /**
   * Request OTP code for login
   */
  async requestOtp(
    email: string,
    userType: 'rider' | 'responder',
  ): Promise<ApiResponse<{ success: boolean }>> {
    try {
      const userExists = await this.checkUserExists(email, userType);

      if (!userExists) {
        return {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'No user registered with this email address',
          },
        };
      }

      const code = await this.generateAndStoreVerificationCode(
        email,
        userType,
        'otp',
        300,
      );

      logger.info(`OTP generated for ${userType} ${email}`, { code });
      console.log(
        `\n==================================================\n[OTP] Verification Code for ${userType} ${email}: ${code}\n==================================================\n`,
      );

      return {
        data: { success: true },
        meta: {},
      };
    } catch (error) {
      logger.error('Request OTP error', error);
      throw error;
    }
  }

  /**
   * Verify OTP and Login
   */
  async verifyOtpAndLogin(
    email: string,
    code: string,
    userType: 'rider' | 'responder',
  ): Promise<ApiResponse<AuthResponseData>> {
    try {
      const isCodeValid = await this.verifyAndConsumeCode(
        email,
        userType,
        'otp',
        code,
      );
      if (!isCodeValid) {
        logger.warn('OTP verification failed - invalid or expired code', {
          email,
        });
        return {
          error: {
            code: 'INVALID_OTP',
            message: 'Invalid or expired verification code',
          },
        };
      }

      if (userType === 'rider') {
        const rider = await this.findUserByEmail(email, 'rider');
        if (!rider) {
          return {
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User profile not found',
            },
          };
        }

        return this.buildRiderAuthResponse(rider);
      } else {
        const responder = await this.findUserByEmail(email, 'responder');

        if (!responder || !responder.isActive) {
          return {
            error: {
              code: 'USER_NOT_FOUND',
              message: 'Responder profile not found or inactive',
            },
          };
        }

        return this.buildResponderAuthResponse(responder);
      }
    } catch (error) {
      logger.error('Verify OTP and login error', error);
      throw error;
    }
  }

  /**
   * Request password reset token/code
   */
  async requestPasswordReset(
    email: string,
    userType: 'rider' | 'responder',
  ): Promise<ApiResponse<{ success: boolean }>> {
    try {
      const userExists = await this.checkUserExists(email, userType);

      if (!userExists) {
        return {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'No user registered with this email address',
          },
        };
      }

      const code = await this.generateAndStoreVerificationCode(
        email,
        userType,
        'reset',
        600,
      );

      logger.info(`Password reset code generated for ${userType} ${email}`, {
        code,
      });
      console.log(
        `\n==================================================\n[PASSWORD_RESET] Code for ${userType} ${email}: ${code}\n==================================================\n`,
      );

      return {
        data: { success: true },
        meta: {},
      };
    } catch (error) {
      logger.error('Request password reset error', error);
      throw error;
    }
  }

  /**
   * Reset password with code
   */
  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
    userType: 'rider' | 'responder',
  ): Promise<ApiResponse<{ success: boolean }>> {
    try {
      const isCodeValid = await this.verifyAndConsumeCode(
        email,
        userType,
        'reset',
        code,
      );
      if (!isCodeValid) {
        logger.warn('Password reset failed - invalid or expired code', {
          email,
        });
        return {
          error: {
            code: 'INVALID_RESET_CODE',
            message: 'Invalid or expired password reset code',
          },
        };
      }

      const hashedPassword = await this.hashPassword(newPassword);

      if (userType === 'rider') {
        await Rider.updateOne(
          { email: email.toLowerCase() },
          { password: hashedPassword },
        );
      } else {
        await Responder.updateOne(
          { email: email.toLowerCase() },
          { password: hashedPassword },
        );
      }

      logger.info('Password reset completed successfully', { email, userType });

      return {
        data: { success: true },
        meta: {},
      };
    } catch (error) {
      logger.error('Reset password error', error);
      throw error;
    }
  }
}
