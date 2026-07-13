import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

interface RMSPoint {
  tx: number;
  accel: number;
  gyro: number;
  impact: number;
  impulse: number;
}

interface RMSSignalChartProps {
  rmsData: RMSPoint[];
  irmsMax: number;
}

export const RMSSignalChart: React.FC<RMSSignalChartProps> = ({ rmsData, irmsMax }) => {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={rmsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="tx"
          label={{ value: 'Time (ms)', position: 'insideBottom', offset: -5 }}
        />
        <YAxis
          yAxisId="left"
          label={{ value: 'RMS Impact (g) / Impulse (g·s)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          label={{ value: 'RMS Accel (g) / Gyro (rad/s)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle' } }}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            let unit = '';
            if (name.includes('Accel') || name.includes('Impact')) {
              unit = ' g';
            } else if (name.includes('Gyro')) {
              unit = ' rad/s';
            } else if (name.includes('Impulse')) {
              unit = ' g·s';
            }
            return value.toFixed(2) + unit;
          }}
          labelFormatter={(label) => `Time: ${label} ms`}
        />
        <Legend />

        {/* Bars for impact and impulse */}
        <Bar
          yAxisId="left"
          dataKey="impact"
          fill="#8884d8"
          name="RMS Impact"
        />
        <Bar
          yAxisId="left"
          dataKey="impulse"
          fill="#82ca9d"
          name="RMS Impulse"
        />

        {/* Lines for accel and gyro on secondary axis */}
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="accel"
          stroke="#ff7300"
          name="RMS Accel"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="gyro"
          stroke="#ff0000"
          name="RMS Gyro"
          strokeWidth={2}
          dot={false}
        />

        {/* Mark irms_max */}
        {(() => {
          const maxPoint = rmsData.reduce((max, point) =>
            point.impact > max.impact ? point : max
          , rmsData[0]);

          return (
            <ReferenceLine
              yAxisId="left"
              y={irmsMax}
              stroke="red"
              strokeDasharray="3 3"
              label={{
                value: `Peak RMS: ${irmsMax.toFixed(2)}`,
                position: 'right',
                fill: 'red',
              }}
            />
          );
        })()}
      </ComposedChart>
    </ResponsiveContainer>
  );
};
