import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { Rider } from '../schemas/rider.model';
import { Responder } from '../schemas/responder.model';
import { JwtPayload, UserRole, ApiResponse, AuthResponseData } from '../../core/types';
import { logger } from '../../core/utils/logger';
import { getRedisClient } from '../../core/config/redis';

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
   * Smart authentication - automatically detects user type
   * If requestedType is provided but wrong, it will auto-correct and login with the correct type
   */
  async authenticateUser(
    email: string,
    password: string,
    requestedType?: string
  ): Promise<ApiResponse<AuthResponseData>> {
    try {
      // Try the requested type first if provided
      if (requestedType === 'rider') {
        const riderResult = await this.authenticateRider(email, password);
        // If it's a wrong user type error, try responder automatically
        if (riderResult.error?.code === 'WRONG_USER_TYPE') {
          logger.info('Auto-switching from rider to responder', { email });
          return await this.authenticateResponder(email, password);
        }
        return riderResult;
      } else if (requestedType === 'responder') {
        const responderResult = await this.authenticateResponder(email, password);
        // If it's a wrong user type error, try rider automatically
        if (responderResult.error?.code === 'WRONG_USER_TYPE') {
          logger.info('Auto-switching from responder to rider', { email });
          return await this.authenticateRider(email, password);
        }
        return responderResult;
      }

      // No type specified or both failed - try both types
      logger.info('Attempting auto-detection of user type', { email });
      
      // Try rider first
      const riderResult = await this.authenticateRider(email, password);
      if (!riderResult.error || riderResult.error.code !== 'WRONG_USER_TYPE') {
        return riderResult;
      }

      // Try responder
      const responderResult = await this.authenticateResponder(email, password);
      return responderResult;
    } catch (error) {
      logger.error('Smart authentication error', error);
      throw error;
    }
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

        // Check if email exists as responder
        const responder = await Responder.findOne({ email: email.toLowerCase() });
        if (responder) {
          return {
            error: {
              code: 'WRONG_USER_TYPE',
              message: 'This email is registered as a Responder. Please select "Responder" as user type.',
            },
          };
        }

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

      if (!responder) {
        logger.warn('Responder authentication failed - user not found', { email });

        // Check if email exists as rider
        const rider = await Rider.findOne({ email: email.toLowerCase() });
        if (rider) {
          return {
            error: {
              code: 'WRONG_USER_TYPE',
              message: 'This email is registered as a Rider. Please select "Rider" as user type.',
            },
          };
        }

        return {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        };
      }

      if (!responder.isActive) {
        logger.warn('Responder authentication failed - inactive account', { email });

        return {
          error: {
            code: 'ACCOUNT_INACTIVE',
            message: 'Your account has been deactivated. Please contact your administrator.',
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

      // Extract organizationId - handle both populated and unpopulated cases
      const org = responder.organizationId as any;
      let orgId: string;
      
      if (org && org._id) {
        // Populated case: organizationId is a full Organization document
        orgId = org._id.toString();
      } else if (responder.organizationId) {
        // Unpopulated case: organizationId is just an ObjectId
        orgId = responder.organizationId.toString();
      } else {
        // Missing organizationId - critical error
        logger.error('Responder missing organizationId', { email, responderId: responder._id });
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
      // Check if email already exists as rider
      const existingRider = await Rider.findOne({ email: data.email.toLowerCase() });
      if (existingRider) {
        return {
          error: {
            code: 'USER_EXISTS',
            message: 'This email is already registered as a Rider',
          },
        };
      }

      // Check if email already exists as responder
      const existingResponder = await Responder.findOne({ email: data.email.toLowerCase() });
      if (existingResponder) {
        return {
          error: {
            code: 'EMAIL_IN_USE',
            message: 'This email is already registered as a Responder. Please use a different email.',
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
      // Check if email already exists as responder
      const existingResponder = await Responder.findOne({ email: data.email.toLowerCase() });
      if (existingResponder) {
        return {
          error: {
            code: 'USER_EXISTS',
            message: 'This email is already registered as a Responder',
          },
        };
      }

      // Check if email already exists as rider
      const existingRider = await Rider.findOne({ email: data.email.toLowerCase() });
      if (existingRider) {
        return {
          error: {
            code: 'EMAIL_IN_USE',
            message: 'This email is already registered as a Rider. Please use a different email.',
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

  /**
   * Request OTP code for login
   */
  async requestOtp(
    email: string,
    userType: 'rider' | 'responder'
  ): Promise<ApiResponse<{ success: boolean }>> {
    try {
      let userExists = false;
      if (userType === 'rider') {
        const rider = await Rider.findOne({ email: email.toLowerCase() });
        userExists = !!rider;
      } else {
        const responder = await Responder.findOne({ email: email.toLowerCase() });
        userExists = !!responder;
      }

      if (!userExists) {
        return {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'No user registered with this email address',
          },
        };
      }

      // Generate 6-digit OTP code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Store in Redis (5-minute TTL)
      const redis = getRedisClient();
      await redis.set(`otp:${email.toLowerCase()}:${userType}`, code, 'EX', 300);

      // Log to backend console (mock email dispatch)
      logger.info(`OTP generated for ${userType} ${email}`, { code });
      console.log(`\n==================================================\n[OTP] Verification Code for ${userType} ${email}: ${code}\n==================================================\n`);

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
    userType: 'rider' | 'responder'
  ): Promise<ApiResponse<AuthResponseData>> {
    try {
      const redis = getRedisClient();
      const storedCode = await redis.get(`otp:${email.toLowerCase()}:${userType}`);

      if (!storedCode || storedCode !== code) {
        logger.warn('OTP verification failed - invalid or expired code', { email });
        return {
          error: {
            code: 'INVALID_OTP',
            message: 'Invalid or expired verification code',
          },
        };
      }

      // Clean up verification code
      await redis.del(`otp:${email.toLowerCase()}:${userType}`);

      let token = '';
      let userData: any;

      if (userType === 'rider') {
        const rider = await Rider.findOne({ email: email.toLowerCase() });
        if (!rider) {
          return {
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User profile not found',
            },
          };
        }

        token = this.generateToken({
          userId: rider._id.toString(),
          role: UserRole.RIDER,
        });

        userData = {
          id: rider._id,
          name: rider.name,
          email: rider.email,
          role: UserRole.RIDER,
        };
      } else {
        const responder = await Responder.findOne({ email: email.toLowerCase() })
          .populate('organizationId', 'name');

        if (!responder || !responder.isActive) {
          return {
            error: {
              code: 'USER_NOT_FOUND',
              message: 'Responder profile not found or inactive',
            },
          };
        }

        // Extract organizationId - handle both populated and unpopulated cases
        const org = responder.organizationId as any;
        let orgId: string;
        
        if (org && org._id) {
          // Populated case: organizationId is a full Organization document
          orgId = org._id.toString();
        } else if (responder.organizationId) {
          // Unpopulated case: organizationId is just an ObjectId
          orgId = responder.organizationId.toString();
        } else {
          // Missing organizationId - critical error
          logger.error('Responder missing organizationId during OTP login', { email });
          return {
            error: {
              code: 'INVALID_USER_DATA',
              message: 'User profile is incomplete',
            },
          };
        }

        token = this.generateToken({
          userId: responder._id.toString(),
          role: UserRole.RESPONDER,
          organizationId: orgId,
          region: responder.region,
        });

        userData = {
          id: responder._id,
          name: responder.name,
          email: responder.email,
          role: UserRole.RESPONDER,
          organizationId: orgId,
          organizationName: org ? org.name : undefined,
          region: responder.region,
        };
      }

      logger.info('User logged in via OTP successfully', { email, userType });

      return {
        data: {
          token,
          user: userData,
        },
        meta: {},
      };
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
    userType: 'rider' | 'responder'
  ): Promise<ApiResponse<{ success: boolean }>> {
    try {
      let userExists = false;
      if (userType === 'rider') {
        const rider = await Rider.findOne({ email: email.toLowerCase() });
        userExists = !!rider;
      } else {
        const responder = await Responder.findOne({ email: email.toLowerCase() });
        userExists = !!responder;
      }

      if (!userExists) {
        return {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'No user registered with this email address',
          },
        };
      }

      // Generate 6-digit reset code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Store in Redis (10-minute TTL)
      const redis = getRedisClient();
      await redis.set(`reset:${email.toLowerCase()}:${userType}`, code, 'EX', 600);

      // Log to backend console (mock email dispatch)
      logger.info(`Password reset code generated for ${userType} ${email}`, { code });
      console.log(`\n==================================================\n[PASSWORD_RESET] Code for ${userType} ${email}: ${code}\n==================================================\n`);

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
    userType: 'rider' | 'responder'
  ): Promise<ApiResponse<{ success: boolean }>> {
    try {
      const redis = getRedisClient();
      const storedCode = await redis.get(`reset:${email.toLowerCase()}:${userType}`);

      if (!storedCode || storedCode !== code) {
        logger.warn('Password reset failed - invalid or expired code', { email });
        return {
          error: {
            code: 'INVALID_RESET_CODE',
            message: 'Invalid or expired password reset code',
          },
        };
      }

      // Clean up reset code
      await redis.del(`reset:${email.toLowerCase()}:${userType}`);

      // Hash new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update password in DB
      if (userType === 'rider') {
        await Rider.updateOne({ email: email.toLowerCase() }, { password: hashedPassword });
      } else {
        await Responder.updateOne({ email: email.toLowerCase() }, { password: hashedPassword });
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
