import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  Chip,
  Grid,
  CircularProgress,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { format } from 'date-fns';
import { Incident, IncidentUpdate, IncidentStatus } from '../../../types';
import { apiService } from '../../../services/api';
import { socketService } from '../../../services/socket';
import { CrashAnalysisPanel } from '../components/CrashAnalysisPanel';

export const IncidentDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [updates, setUpdates] = useState<IncidentUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Track if socket has been connected to prevent re-triggers
  const hasConnectedRef = useRef(false);
  const socketConnectedRef = useRef(false);

  useEffect(() => {
    if (!id) {
      setError('Incident ID is required');
      return;
    }

    loadIncident();
  }, [id]);

  // Socket.IO effect - runs exactly once per mount
  useEffect(() => {
    if (!id || hasConnectedRef.current) return;

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Authentication required');
      return;
    }

    // Mark as connected
    hasConnectedRef.current = true;

    // Connect socket if not already connected
    if (!socketService.isConnected()) {
      socketService.connect(token);
    }

    // Join incident room
    socketService.joinIncident(
      id,
      handleReplay,
      handleLiveUpdate
    );

    socketConnectedRef.current = true;
    setIsSocketConnected(true);

    // Cleanup on unmount
    return () => {
      if (socketConnectedRef.current) {
        socketService.leaveIncident(id);
        socketConnectedRef.current = false;
        hasConnectedRef.current = false;
      }
    };
  }, [id]);

  const loadIncident = async () => {
    if (!id) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiService.getIncident(id);

      if (response.error) {
        setError(response.error.message);
        return;
      }

      if (response.data) {
        setIncident(response.data.incident);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load incident');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReplay = useCallback((data: { incidentId: string; updates: IncidentUpdate[]; count: number }) => {
    console.log('Replay received:', data.count, 'updates');
    setUpdates(data.updates);
  }, []);

  const handleLiveUpdate = useCallback((data: { incidentId: string; update: IncidentUpdate }) => {
    console.log('Live update received:', data.update.sequenceNumber);
    
    // Add to updates if not already present
    setUpdates((prevUpdates) => {
      const exists = prevUpdates.some((u) => u.sequenceNumber === data.update.sequenceNumber);
      if (exists) {
        return prevUpdates;
      }
      return [...prevUpdates, data.update].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    });
  }, []);

  const handleResolve = async () => {
    if (!id || !incident) return;

    const originalIncident = incident;
    // Optimistically update status to RESOLVED
    setIncident((prev) => prev ? { ...prev, status: IncidentStatus.RESOLVED } : null);
    setIsResolving(true);

    try {
      const response = await apiService.resolveIncident(id);

      if (response.error) {
        // Revert optimistic update
        setIncident(originalIncident);
        alert(response.error.message);
        return;
      }

      if (response.data?.incident) {
        setIncident(response.data.incident);
        alert('Incident resolved successfully');
      }
    } catch (err: any) {
      // Revert optimistic update
      setIncident(originalIncident);
      alert(err.message || 'Failed to resolve incident');
    } finally {
      setIsResolving(false);
    }
  };

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error || !incident) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">{error || 'Incident not found'}</Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/incidents')}
          sx={{ mt: 2 }}
        >
          Back to List
        </Button>
      </Container>
    );
  }

  const isResolved = incident.status === IncidentStatus.RESOLVED;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/incidents')}
        sx={{ mb: 2 }}
      >
        Back to List
      </Button>

      {/* Incident Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="h5">
            Incident Details
          </Typography>
          <Box>
            <Chip
              label={incident.status}
              color={isResolved ? 'success' : 'error'}
              sx={{ mr: 1 }}
            />
            <Chip
              label={incident.type.replace(/_/g, ' ')}
              color="primary"
            />
          </Box>
        </Box>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">Rider</Typography>
            <Typography variant="body1">{incident.riderId?.name || 'Unknown'}</Typography>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">Location</Typography>
            <Typography variant="body1">{incident.location.address || 'N/A'}</Typography>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">Created At</Typography>
            <Typography variant="body1">
              {format(new Date(incident.createdAt), 'MMM dd, yyyy HH:mm:ss')}
            </Typography>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary">Region</Typography>
            <Typography variant="body1">{incident.region}</Typography>
          </Grid>

          {incident.description && (
            <Grid size={12}>
              <Typography variant="body2" color="text.secondary">Description</Typography>
              <Typography variant="body1">{incident.description}</Typography>
            </Grid>
          )}

          {incident.responderId && (
            <Grid size={12}>
              <Typography variant="body2" color="text.secondary">Responder</Typography>
              <Typography variant="body1">{incident.responderId.name}</Typography>
            </Grid>
          )}
        </Grid>

        <Box sx={{ mt: 3 }}>
          <Button
            variant="contained"
            color="success"
            onClick={handleResolve}
            disabled={isResolved || isResolving}
            aria-disabled={isResolved || isResolving}
            tabIndex={isResolved || isResolving ? -1 : 0}
          >
            {isResolved ? 'Resolved' : isResolving ? 'Resolving...' : 'Resolve Incident'}
          </Button>

          {isSocketConnected && (
            <Chip
              label="Live Updates Active"
              color="success"
              size="small"
              sx={{ ml: 2 }}
            />
          )}
        </Box>
      </Paper>

      {/* Crash Analysis Panel */}
      {incident.type === 'ACTIVE_CRASH' && (
        <CrashAnalysisPanel
          processedData={incident.processedData}
          unfilteredData={incident.unfilteredData}
        />
      )}

      {/* Incident Updates */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Incident Updates ({updates.length})
        </Typography>
        <Divider sx={{ mb: 2 }} />

        {updates.length === 0 ? (
          <Typography color="text.secondary">No updates yet</Typography>
        ) : (
          <List>
            {updates.map((update) => (
              <ListItem key={update._id} alignItems="flex-start" divider>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={`#${update.sequenceNumber}`} size="small" />
                      <Typography variant="subtitle2">{update.type.replace(/_/g, ' ')}</Typography>
                    </Box>
                  }
                  secondary={
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {format(new Date(update.createdAt), 'MMM dd, yyyy HH:mm:ss')}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        {JSON.stringify(update.data, null, 2)}
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Container>
  );
};
