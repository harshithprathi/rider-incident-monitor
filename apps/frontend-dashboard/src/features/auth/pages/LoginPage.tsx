import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Grid,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../../../services/api';
import { ResetPasswordModal } from '../components/ResetPasswordModal';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, loginWithOtp } = useAuth();

  // Navigation tabs: 'login' (0) or 'register' (1)
  const [activeTab, setActiveTab] = useState<number>(0);

  // Login States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('test123');
  const [userType, setUserType] = useState<'rider' | 'responder'>('responder');
  const [loginMode, setLoginMode] = useState<'password' | 'otp'>('password');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Register States
  const [regUserType, setRegUserType] = useState<'rider' | 'responder'>('rider');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regOrg, setRegOrg] = useState('');
  const [regRegion, setRegRegion] = useState('');

  // Dropdown options
  const [organizations, setOrganizations] = useState<any[]>([]);

  // UI States
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Fetch organizations when on registration tab
  useEffect(() => {
    if (activeTab === 1) {
      const fetchOrgs = async () => {
        try {
          const res = await apiService.listOrganizations();
          if (res.data?.organizations) {
            setOrganizations(res.data.organizations);
            if (res.data.organizations.length > 0) {
              setRegOrg(res.data.organizations[0]._id);
              if (res.data.organizations[0].regions?.length > 0) {
                setRegRegion(res.data.organizations[0].regions[0]);
              }
            }
          }
        } catch (err: any) {
          console.error('Failed to load organizations', err);
        }
      };
      fetchOrgs();
    }
  }, [activeTab]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    setError('');
    setSuccess('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      if (loginMode === 'password') {
        const warning = await login(email, password, userType);
        if (warning) {
          alert(warning);
        }

        // Navigate based on actual authenticated user role, not the dropdown selected type
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const actualUser = JSON.parse(storedUser);
          navigate(actualUser.role === 'RIDER' ? '/rider-dashboard' : '/incidents');
        } else {
          navigate(userType === 'rider' ? '/rider-dashboard' : '/incidents');
        }
      } else {
        // OTP login verification
        if (!otpSent) {
          // Step 1: Request OTP
          const res = await apiService.requestOtp(email, userType);
          if (res.error) {
            setError(res.error.message || 'Failed to request OTP');
          } else {
            setOtpSent(true);
            setSuccess('Verification code sent successfully! Check backend console.');
          }
        } else {
          // Step 2: Verify OTP
          const warning = await loginWithOtp(email, otpCode, userType);
          if (warning) {
            alert(warning);
          }

          // Navigate based on actual authenticated user role
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            const actualUser = JSON.parse(storedUser);
            navigate(actualUser.role === 'RIDER' ? '/rider-dashboard' : '/incidents');
          } else {
            navigate(userType === 'rider' ? '/rider-dashboard' : '/incidents');
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      if (regUserType === 'rider') {
        const res = await apiService.registerRider({
          name: regName,
          email: regEmail,
          phone: regPhone,
          password: regPassword,
        });

        if (res.error) {
          setError(res.error.message || 'Failed to register rider');
        } else {
          setSuccess('Rider registered successfully! Redirecting...');
          // Automatically log in
          if (res.data?.token) {
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            setTimeout(() => navigate('/rider-dashboard'), 1500);
          }
        }
      } else {
        // Responder registration
        const res = await apiService.registerResponder({
          name: regName,
          email: regEmail,
          phone: regPhone,
          password: regPassword,
          organizationId: regOrg,
          region: regRegion,
        });

        if (res.error) {
          setError(res.error.message || 'Failed to register responder');
        } else {
          setSuccess('Responder registered successfully! Redirecting...');
          // Automatically log in
          if (res.data?.token) {
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            setTimeout(() => navigate('/incidents'), 1500);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedOrgObj = organizations.find((o) => o._id === regOrg);
  const regions = selectedOrgObj ? selectedOrgObj.regions : [];

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          marginTop: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          mb: 6,
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%', borderRadius: 2 }}>
          <Typography component="h1" variant="h4" align="center" sx={{ fontWeight: 'bold' }} gutterBottom>
            Rider Incident Monitor
          </Typography>
          
          <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 3 }}>
            Real-time Safety Platform
          </Typography>

          <Tabs value={activeTab} onChange={handleTabChange} variant="fullWidth" sx={{ mb: 3 }}>
            <Tab label="Sign In" />
            <Tab label="Register" />
          </Tabs>

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

          {activeTab === 0 ? (
            /* Sign In Tab */
            <Box component="form" onSubmit={handleLoginSubmit}>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel id="user-type-label">User Type</InputLabel>
                <Select
                  labelId="user-type-label"
                  id="user-type"
                  value={userType}
                  label="User Type"
                  disabled={isLoading || otpSent}
                  onChange={(e) => setUserType(e.target.value as 'rider' | 'responder')}
                >
                  <MenuItem value="responder">Responder</MenuItem>
                  <MenuItem value="rider">Rider</MenuItem>
                </Select>
              </FormControl>

              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                autoFocus
                disabled={isLoading || otpSent}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              {loginMode === 'password' ? (
                <>
                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    name="password"
                    label="Password"
                    type="password"
                    id="password"
                    autoComplete="current-password"
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, mb: 1 }}>
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => setResetModalOpen(true)}
                    >
                      Forgot Password?
                    </Button>
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => {
                        setLoginMode('otp');
                        setError('');
                        setSuccess('');
                      }}
                    >
                      Login via OTP
                    </Button>
                  </Box>
                </>
              ) : (
                <>
                  {otpSent && (
                    <TextField
                      margin="normal"
                      required
                      fullWidth
                      name="otpCode"
                      label="6-Digit OTP Code"
                      type="text"
                      id="otpCode"
                      slotProps={{ htmlInput: { maxLength: 6 } }}
                      disabled={isLoading}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                  )}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, mb: 1 }}>
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => {
                        setLoginMode('password');
                        setOtpSent(false);
                        setOtpCode('');
                        setError('');
                        setSuccess('');
                      }}
                      disabled={isLoading}
                    >
                      Login via Password
                    </Button>
                    {otpSent && (
                      <Button
                        variant="text"
                        size="small"
                        disabled={isLoading}
                        onClick={async () => {
                          setError('');
                          setSuccess('');
                          try {
                            const res = await apiService.requestOtp(email, userType);
                            if (res.error) setError(res.error.message);
                            else setSuccess('New verification code sent!');
                          } catch (err: any) {
                            setError(err.message);
                          }
                        }}
                      >
                        Resend OTP
                      </Button>
                    )}
                  </Box>
                </>
              )}

              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2, py: 1.2, fontWeight: 'bold' }}
                disabled={isLoading}
              >
                {isLoading
                  ? 'Processing...'
                  : loginMode === 'otp' && !otpSent
                  ? 'Request OTP'
                  : 'Sign In'}
              </Button>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                <strong>Quick Login Demo Credentials:</strong>
                <br />
                Responder: sarah@emergency.com / test123
                <br />
                Rider: john@example.com / test123
              </Typography>
            </Box>
          ) : (
            /* Register Tab */
            <Box component="form" onSubmit={handleRegisterSubmit}>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel id="register-as-label">Register As</InputLabel>
                <Select
                  labelId="register-as-label"
                  id="register-as"
                  value={regUserType}
                  label="Register As"
                  disabled={isLoading}
                  onChange={(e) => setRegUserType(e.target.value as 'rider' | 'responder')}
                >
                  <MenuItem value="rider">Rider (Monitored Trips)</MenuItem>
                  <MenuItem value="responder">Responder (Agency Staff)</MenuItem>
                </Select>
              </FormControl>

              <Grid container spacing={2}>
                <Grid size={12}>
                  <TextField
                    required
                    fullWidth
                    label="Full Name"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    disabled={isLoading}
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    required
                    fullWidth
                    type="email"
                    label="Email Address"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    disabled={isLoading}
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    required
                    fullWidth
                    label="Phone Number"
                    value={regPhone}
                    placeholder="+1234567890"
                    onChange={(e) => setRegPhone(e.target.value)}
                    disabled={isLoading}
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    required
                    fullWidth
                    type="password"
                    label="Choose Password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    disabled={isLoading}
                  />
                </Grid>

                {regUserType === 'responder' && (
                  <>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormControl fullWidth required>
                        <InputLabel id="reg-org-label">Emergency Agency</InputLabel>
                        <Select
                          labelId="reg-org-label"
                          id="reg-org"
                          value={regOrg}
                          label="Emergency Agency"
                          disabled={isLoading}
                          onChange={(e) => {
                            setRegOrg(e.target.value);
                            const org = organizations.find((o) => o._id === e.target.value);
                            if (org && org.regions && org.regions.length > 0) {
                              setRegRegion(org.regions[0]);
                            } else {
                              setRegRegion('');
                            }
                          }}
                        >
                          {organizations.map((org) => (
                            <MenuItem key={org._id} value={org._id}>
                              {org.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormControl fullWidth required disabled={!regOrg || isLoading}>
                        <InputLabel id="reg-region-label">Agency Region</InputLabel>
                        <Select
                          labelId="reg-region-label"
                          id="reg-region"
                          value={regRegion}
                          label="Agency Region"
                          onChange={(e) => setRegRegion(e.target.value)}
                        >
                          {regions.map((reg: string) => (
                            <MenuItem key={reg} value={reg}>
                              {reg.toUpperCase()}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                  </>
                )}
              </Grid>

              <Button
                type="submit"
                fullWidth
                variant="contained"
                color="secondary"
                sx={{ mt: 3, mb: 2, py: 1.2, fontWeight: 'bold' }}
                disabled={isLoading}
              >
                {isLoading ? 'Creating Account...' : 'Register & Sign Up'}
              </Button>
            </Box>
          )}
        </Paper>
      </Box>

      {/* Forgot Password Modal */}
      <ResetPasswordModal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
      />
    </Container>
  );
};
