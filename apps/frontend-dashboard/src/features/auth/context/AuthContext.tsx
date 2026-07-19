import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../../../types';
import { apiService } from '../../../services/api';
import { socketService } from '../../../services/socket';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, userType: 'rider' | 'responder') => Promise<string | undefined>;
  loginWithOtp: (email: string, code: string, userType: 'rider' | 'responder') => Promise<string | undefined>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load user from localStorage on mount
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        
        // Connect socket
        socketService.connect(storedToken);
      } catch (error) {
        console.error('Failed to restore session:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }

    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string, userType: 'rider' | 'responder'): Promise<string | undefined> => {
    try {
      const response = await apiService.login(email, password, userType);

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data) {
        throw new Error('Invalid response from server');
      }

      const { token: newToken, user: newUser } = response.data;

      // Store in state and localStorage
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));

      // Connect socket
      socketService.connect(newToken);

      return response.meta?.warning;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const loginWithOtp = async (email: string, code: string, userType: 'rider' | 'responder'): Promise<string | undefined> => {
    try {
      const response = await apiService.loginWithOtp(email, code, userType);

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data) {
        throw new Error('Invalid response from server');
      }

      const { token: newToken, user: newUser } = response.data;

      // Store in state and localStorage
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));

      // Connect socket
      socketService.connect(newToken);

      return response.meta?.warning;
    } catch (error) {
      console.error('OTP Login failed:', error);
      throw error;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Disconnect socket
    socketService.disconnect();
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    loginWithOtp,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
