import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Button,
  TextField,
  MenuItem,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import { format } from 'date-fns';
import { Incident, IncidentType, IncidentStatus } from '../types';
import { apiService } from '../services/api';

export const IncidentListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  // Filters from URL
  const [type, setType] = useState(searchParams.get('type') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '');

  // Optimistic updates map
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, IncidentStatus>>({});

  const loadIncidents = useCallback(async (cursor?: string) => {
    setIsLoading(true);
    setError('');

    try {
      const response = await apiService.listIncidents({
        type: type || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        cursor,
        limit: 20,
      });

      if (response.error) {
        setError(response.error.message);
        return;
      }

      if (response.data) {
        setIncidents(response.data.incidents);
        setHasMore(response.meta?.hasMore || false);
        setNextCursor(response.meta?.nextCursor);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load incidents');
    } finally {
      setIsLoading(false);
    }
  }, [type, status, dateFrom, dateTo]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const handleFilterChange = () => {
    // Update URL params
    const params: Record<string, string> = {};
    if (type) params.type = type;
    if (status) params.status = status;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;

    setSearchParams(params);
    loadIncidents();
  };

  const handleClearFilters = () => {
    setType('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setSearchParams({});
    loadIncidents();
  };

  const handleLoadMore = () => {
    if (nextCursor) {
      loadIncidents(nextCursor);
    }
  };

  const handleResolveIncident = async (incidentId: string) => {
    // Optimistic update
    setOptimisticUpdates((prev) => ({
      ...prev,
      [incidentId]: IncidentStatus.RESOLVED,
    }));

    try {
      const response = await apiService.resolveIncident(incidentId);

      if (response.error) {
        // Revert optimistic update
        setOptimisticUpdates((prev) => {
          const newUpdates = { ...prev };
          delete newUpdates[incidentId];
          return newUpdates;
        });
        alert(response.error.message);
        return;
      }

      // Update succeeded, refresh list
      loadIncidents();
      
      // Clear optimistic update
      setOptimisticUpdates((prev) => {
        const newUpdates = { ...prev };
        delete newUpdates[incidentId];
        return newUpdates;
      });
    } catch (err: any) {
      // Revert optimistic update
      setOptimisticUpdates((prev) => {
        const newUpdates = { ...prev };
        delete newUpdates[incidentId];
        return newUpdates;
      });
      alert(err.message || 'Failed to resolve incident');
    }
  };

  const getStatusChipColor = (incidentStatus: IncidentStatus) => {
    return incidentStatus === IncidentStatus.LIVE ? 'error' : 'success';
  };

  const getTypeChipColor = (incidentType: IncidentType) => {
    switch (incidentType) {
      case IncidentType.ACTIVE_CRASH:
        return 'error';
      case IncidentType.SOS:
        return 'warning';
      case IncidentType.SAFE_RETURN_MISSED:
        return 'info';
      default:
        return 'default';
    }
  };

  const getDisplayStatus = (incident: Incident): IncidentStatus => {
    return optimisticUpdates[incident._id] || incident.status;
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Incident List
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={2.5}>
            <TextField
              select
              fullWidth
              label="Type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value={IncidentType.ACTIVE_CRASH}>Active Crash</MenuItem>
              <MenuItem value={IncidentType.SOS}>SOS</MenuItem>
              <MenuItem value={IncidentType.SAFE_RETURN_MISSED}>Safe Return Missed</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6} md={2.5}>
            <TextField
              select
              fullWidth
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value={IncidentStatus.LIVE}>Live</MenuItem>
              <MenuItem value={IncidentStatus.RESOLVED}>Resolved</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6} md={2.5}>
            <TextField
              fullWidth
              label="Date From"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={2.5}>
            <TextField
              fullWidth
              label="Date To"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={12} md={2}>
            <Box sx={{ display: 'flex', gap: 1, height: '56px' }}>
              <Button
                variant="contained"
                onClick={handleFilterChange}
                fullWidth
                sx={{ height: '100%' }}
              >
                Apply
              </Button>
              <Button
                variant="outlined"
                onClick={handleClearFilters}
                fullWidth
                sx={{ height: '100%' }}
              >
                Clear
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {isLoading && incidents.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Type</strong></TableCell>
                  <TableCell><strong>Rider</strong></TableCell>
                  <TableCell><strong>Location</strong></TableCell>
                  <TableCell><strong>Time</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {incidents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="text.secondary">No incidents found</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  incidents.map((incident) => {
                    const displayStatus = getDisplayStatus(incident);
                    const isOptimistic = optimisticUpdates[incident._id] !== undefined;

                    return (
                      <TableRow
                        key={incident._id}
                        hover
                        sx={{ cursor: 'pointer', opacity: isOptimistic ? 0.6 : 1 }}
                        onClick={() => navigate(`/incidents/${incident._id}`)}
                      >
                        <TableCell>
                          <Chip
                            label={incident.type.replace(/_/g, ' ')}
                            color={getTypeChipColor(incident.type) as any}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{incident.riderId?.name || 'Unknown'}</TableCell>
                        <TableCell>{incident.location.address || 'N/A'}</TableCell>
                        <TableCell>
                          {format(new Date(incident.createdAt), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={displayStatus}
                            color={getStatusChipColor(displayStatus) as any}
                            size="small"
                          />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            disabled={displayStatus === IncidentStatus.RESOLVED}
                            tabIndex={displayStatus === IncidentStatus.RESOLVED ? -1 : 0}
                            aria-disabled={displayStatus === IncidentStatus.RESOLVED}
                            onClick={() => handleResolveIncident(incident._id)}
                          >
                            {displayStatus === IncidentStatus.RESOLVED ? 'Resolved' : 'Resolve'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button variant="outlined" onClick={handleLoadMore} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Load More'}
              </Button>
            </Box>
          )}
        </>
      )}
    </Container>
  );
};
