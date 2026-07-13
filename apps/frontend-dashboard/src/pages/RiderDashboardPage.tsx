import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { format, differenceInSeconds } from 'date-fns';

export const RiderDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [activeSession, setActiveSession] = useState<any>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [destination, setDestination] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Load session and organizations
  const loadDashboardData = async () => {
    setIsLoading(true);
    setError('');
    try {
      // 1. Get active session
      const sessionRes = await apiService.getActiveSession();
      if (sessionRes.data?.session) {
        setActiveSession(sessionRes.data.session);
      } else {
        setActiveSession(null);
      }

      // 2. Get organizations
      const orgsRes = await apiService.listOrganizations();
      if (orgsRes.data?.organizations) {
        setOrganizations(orgsRes.data.organizations);
        if (orgsRes.data.organizations.length > 0) {
          const firstOrg = orgsRes.data.organizations[0];
          setSelectedOrg(firstOrg._id);
          if (firstOrg.regions && firstOrg.regions.length > 0) {
            setSelectedRegion(firstOrg.regions[0]);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Time remaining countdown timer
  useEffect(() => {
    if (!activeSession) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const seconds = differenceInSeconds(new Date(activeSession.deadline), new Date());
      if (seconds <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
        // Refresh session state (will have transitioned to expired/completed)
        loadDashboardData();
      } else {
        setTimeLeft(seconds);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination || !durationMinutes || !selectedOrg || !selectedRegion) {
      setError('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const deadline = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
      const response = await apiService.createSession({
        destination,
        deadline,
        organizationId: selectedOrg,
        region: selectedRegion,
      });

      if (response.error) {
        setError(response.error.message);
        return;
      }

      setSuccessMsg('Safe Return Session started successfully!');
      loadDashboardData();
    } catch (err: any) {
      setError(err.message || 'Failed to start session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteSession = async () => {
    if (!activeSession) return;
    setIsSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const response = await apiService.completeSession(activeSession._id);
      if (response.error) {
        setError(response.error.message);
        return;
      }

      setSuccessMsg('Session completed successfully. Arrived safe!');
      setActiveSession(null);
      loadDashboardData();
    } catch (err: any) {
      setError(err.message || 'Failed to complete session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExtendSession = async () => {
    if (!activeSession) return;
    setIsSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const response = await apiService.extendSession(activeSession._id, 15);
      if (response.error) {
        setError(response.error.message);
        return;
      }

      setSuccessMsg('Trip extended by 15 minutes!');
      loadDashboardData();
    } catch (err: any) {
      setError(err.message || 'Failed to extend session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedOrgObj = organizations.find((o) => o._id === selectedOrg);
  const regions = selectedOrgObj ? selectedOrgObj.regions : [];

  const formatTimeLeft = (totalSeconds: number) => {
    if (totalSeconds <= 0) return 'Deadline missed!';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs}s remaining`;
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, mb: 4, background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)', color: 'white' }}>
        <Typography variant="h4" gutterBottom fontWeight="bold">
          Safe Return Console
        </Typography>
        <Typography variant="body1">
          Welcome back, {user?.name}. Protect your journey by activating a monitored Safe Return Session.
        </Typography>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {successMsg && <Alert severity="success" sx={{ mb: 3 }}>{successMsg}</Alert>}

      {activeSession ? (
        <Card sx={{ borderLeft: '6px solid #4caf50', mb: 4, boxShadow: 3 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h5" fontWeight="bold">
                Active Safe Return Trip
              </Typography>
              <Chip label="MONITORED" color="success" sx={{ fontWeight: 'bold' }} />
            </Box>

            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">DESTINATION</Typography>
                <Typography variant="h6" fontWeight="medium">{activeSession.destination}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">EXPECTED DEADLINE</Typography>
                <Typography variant="h6" fontWeight="medium">
                  {format(new Date(activeSession.deadline), 'PPpp')}
                </Typography>
              </Grid>
            </Grid>

            {timeLeft !== null && (
              <Box sx={{ p: 3, bgcolor: timeLeft < 300 ? '#ffebee' : '#e8f5e9', borderRadius: 2, mb: 4, textAlign: 'center' }}>
                <Typography variant="h4" fontWeight="bold" color={timeLeft < 300 ? 'error.main' : 'success.main'}>
                  {formatTimeLeft(timeLeft)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Please complete the session or extend it before the timer runs out.
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                color="success"
                size="large"
                fullWidth
                onClick={handleCompleteSession}
                disabled={isSubmitting}
                sx={{ py: 1.5, fontWeight: 'bold' }}
              >
                I'm Safe (Arrived at Destination)
              </Button>
              <Button
                variant="outlined"
                color="primary"
                size="large"
                fullWidth
                onClick={handleExtendSession}
                disabled={isSubmitting}
                sx={{ py: 1.5, fontWeight: 'bold' }}
              >
                Extend Trip (+15 Min)
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ boxShadow: 3 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h5" fontWeight="bold" sx={{ mb: 3 }}>
              Start a New Trip
            </Typography>

            <Box component="form" onSubmit={handleStartSession}>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    required
                    label="Destination Address"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Enter destination address or landmark"
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    required
                    type="number"
                    label="Expected Duration (Minutes)"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 0)}
                    InputProps={{ inputProps: { min: 1 } }}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    select
                    fullWidth
                    required
                    label="Emergency Agency"
                    value={selectedOrg}
                    onChange={(e) => {
                      setSelectedOrg(e.target.value);
                      const org = organizations.find((o) => o._id === e.target.value);
                      if (org && org.regions && org.regions.length > 0) {
                        setSelectedRegion(org.regions[0]);
                      } else {
                        setSelectedRegion('');
                      }
                    }}
                  >
                    {organizations.map((org) => (
                      <MenuItem key={org._id} value={org._id}>
                        {org.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    select
                    fullWidth
                    required
                    label="Emergency Region"
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    disabled={!selectedOrg}
                  >
                    {regions.map((reg: string) => (
                      <MenuItem key={reg} value={reg}>
                        {reg.toUpperCase()}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12}>
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={isSubmitting}
                    sx={{ py: 1.5, fontWeight: 'bold' }}
                  >
                    {isSubmitting ? 'Starting Session...' : 'Start Safe Return Session'}
                  </Button>
                </Grid>
              </Grid>
            </Box>
          </CardContent>
        </Card>
      )}
    </Container>
  );
};
