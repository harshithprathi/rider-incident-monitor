import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { apiService } from '../../../services/api';

interface ResetPasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ open, onClose }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [userType, setUserType] = useState<'rider' | 'responder'>('rider');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Email address is required');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const res = await apiService.requestPasswordReset(email, userType);
      if (res.error) {
        setError(res.error.message || 'Failed to request reset code');
      } else {
        setSuccess('Reset code sent successfully! Check the backend console.');
        setStep(2);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !newPassword) {
      setError('Verification code and new password are required');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const res = await apiService.resetPassword(email, code, newPassword, userType);
      if (res.error) {
        setError(res.error.message || 'Failed to reset password');
      } else {
        alert('Password reset successfully! You can now log in.');
        handleClose();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setEmail('');
    setUserType('rider');
    setCode('');
    setNewPassword('');
    setError('');
    setSuccess('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Reset Password</DialogTitle>
      
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        {step === 1 ? (
          <Box component="form" onSubmit={handleRequestCode} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter your email address and we will generate a password reset code.
            </Typography>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>User Type</InputLabel>
              <Select
                value={userType}
                label="User Type"
                onChange={(e) => setUserType(e.target.value as 'rider' | 'responder')}
              >
                <MenuItem value="rider">Rider</MenuItem>
                <MenuItem value="responder">Responder</MenuItem>
              </Select>
            </FormControl>

            <TextField
              required
              fullWidth
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
            />
          </Box>
        ) : (
          <Box component="form" onSubmit={handleResetPassword} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter the 6-digit verification code sent to your email (logged in the backend terminal console) and choose a new password.
            </Typography>

            <TextField
              required
              fullWidth
              label="6-Digit Verification Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              margin="normal"
              slotProps={{ htmlInput: { maxLength: 6 } }}
            />

            <TextField
              required
              fullWidth
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              margin="normal"
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        {step === 1 ? (
          <Button
            onClick={handleRequestCode}
            variant="contained"
            disabled={isLoading}
          >
            {isLoading ? 'Sending...' : 'Send Code'}
          </Button>
        ) : (
          <Button
            onClick={handleResetPassword}
            variant="contained"
            disabled={isLoading}
          >
            {isLoading ? 'Resetting...' : 'Reset Password'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
