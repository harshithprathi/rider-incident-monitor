import React, { useState } from 'react';
import { Paper, Typography, Box, ToggleButton, ToggleButtonGroup, Alert } from '@mui/material';
import { CrashData, UnfilteredData } from '../types';
import { ImpactForceChart } from './ImpactForceChart';
import { RMSSignalChart } from './RMSSignalChart';

interface CrashAnalysisPanelProps {
  processedData?: CrashData;
  unfilteredData?: UnfilteredData;
}

export const CrashAnalysisPanel: React.FC<CrashAnalysisPanelProps> = ({
  processedData,
  unfilteredData,
}) => {
  const [dataMode, setDataMode] = useState<'processed' | 'raw'>('processed');

  if (!processedData) {
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Crash Analysis
        </Typography>
        <Alert severity="info">No sensor data available</Alert>
      </Paper>
    );
  }

  const handleDataModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newMode: 'processed' | 'raw' | null
  ) => {
    if (newMode !== null) {
      setDataMode(newMode);
    }
  };

  const impactData = dataMode === 'processed' 
    ? processedData.impact 
    : unfilteredData?.impact || processedData.impact;

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          Crash Analysis
        </Typography>

        {unfilteredData && (
          <ToggleButtonGroup
            value={dataMode}
            exclusive
            onChange={handleDataModeChange}
            size="small"
          >
            <ToggleButton value="processed">CFC180 Filtered</ToggleButton>
            <ToggleButton value="raw">Raw Data</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>

      {/* Impact Force Chart */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" gutterBottom>
          Impact Force Over Time
        </Typography>
        <ImpactForceChart
          impactData={impactData}
          iMax={processedData.i_max}
        />
      </Box>

      {/* RMS Signal Quality Chart */}
      <Box>
        <Typography variant="subtitle1" gutterBottom>
          RMS Signal Quality
        </Typography>
        <RMSSignalChart
          rmsData={processedData.rms}
          irmsMax={processedData.irms_max}
        />
      </Box>
    </Paper>
  );
};
