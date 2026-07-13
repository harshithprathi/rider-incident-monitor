import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

interface ImpactPoint {
  tx: number;
  iX: number;
  iY: number;
  iZ: number;
}

interface ImpactForceChartProps {
  impactData: ImpactPoint[];
  iMax: number;
}

export const ImpactForceChart: React.FC<ImpactForceChartProps> = ({ impactData, iMax }) => {
  // Calculate resultant force for each point
  const chartData = useMemo(() => {
    return impactData.map((point) => ({
      tx: point.tx,
      iX: point.iX,
      iY: point.iY,
      iZ: point.iZ,
      resultant: Math.sqrt(point.iX ** 2 + point.iY ** 2 + point.iZ ** 2),
    }));
  }, [impactData]);

  // Find the peak point
  const peakPoint = useMemo(() => {
    return chartData.reduce((max, point) => 
      point.resultant > max.resultant ? point : max
    , chartData[0]);
  }, [chartData]);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="tx"
          label={{ value: 'Time (ms)', position: 'insideBottom', offset: -5 }}
        />
        <YAxis
          label={{ value: 'Impact Force (g)', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip
          formatter={(value: number) => value.toFixed(2) + ' g'}
          labelFormatter={(label) => `Time: ${label} ms`}
        />
        <Legend />
        
        <Line
          type="monotone"
          dataKey="iX"
          stroke="#8884d8"
          name="Force X"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="iY"
          stroke="#82ca9d"
          name="Force Y"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="iZ"
          stroke="#ffc658"
          name="Force Z"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="resultant"
          stroke="#ff7300"
          name="Resultant"
          strokeWidth={3}
          dot={false}
        />
        
        {/* Highlight peak force */}
        <ReferenceLine
          x={peakPoint.tx}
          stroke="red"
          strokeDasharray="3 3"
          label={{
            value: `Peak: ${iMax.toFixed(2)}g`,
            position: 'top',
            fill: 'red',
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
