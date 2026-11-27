import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SENSOR_METADATA } from '../constants/sensors';
import { ChartFilter, SensorKey, TelemetryPoint } from '../types/sensor';

interface TelemetryChartProps {
  history: TelemetryPoint[];
}

const FILTER_TABS: { id: ChartFilter; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'gas', label: 'Gas ppm' },
  { id: 'dht11', label: 'DHT11' },
];

const SERIES_BY_FILTER: Record<ChartFilter, SensorKey[]> = {
  all: ['mq4', 'mq135', 'temperature', 'humidity'],
  gas: ['mq4', 'mq135'],
  dht11: ['temperature', 'humidity'],
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number;
    color?: string;
  }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white border border-[#E2E5EA] rounded px-3 py-2 text-xs">
      <div className="font-mono-tabular text-[11px] text-[#64748B] border-b border-[#E2E5EA] pb-1 mb-1.5">
        Waktu: {label}
      </div>
      <div className="space-y-1">
        {payload.map((entry) => {
          const key = entry.dataKey as SensorKey | undefined;
          if (!key || !(key in SENSOR_METADATA)) return null;
          const meta = SENSOR_METADATA[key];
          return (
            <div
              key={key}
              className="flex items-center justify-between gap-4 font-mono-tabular"
            >
              <span className="flex items-center gap-1.5 text-[#1E293B]">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: meta.chartColor }}
                />
                {meta.label}
              </span>
              <span className="font-semibold text-[#1E293B]">
                {Number(entry.value ?? 0).toFixed(meta.decimals)} {meta.unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TelemetryChart({ history }: TelemetryChartProps) {
  const [filter, setFilter] = useState<ChartFilter>('all');
  const activeSeries = SERIES_BY_FILTER[filter];
  const showGasAxis = filter === 'all' || filter === 'gas';
  const showDhtAxis = filter === 'all' || filter === 'dht11';

  return (
    <section className="bg-white border border-[#E2E5EA] rounded-md p-3.5 flex flex-col min-h-[260px] lg:min-h-0 h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#E2E5EA] shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-[#1E293B]">
            Grafik Telemetri Real-Time
          </h2>
          <p className="text-[11px] text-[#64748B] font-mono-tabular">
            20 SAMPEL TERAKHIR · GARIS DATAR TANPA INTERPOLASI AREA
          </p>
        </div>

        <div
          className="inline-flex bg-[#F4F5F7] border border-[#E2E5EA] rounded p-0.5"
          role="tablist"
          aria-label="Filter metrik grafik"
        >
          {FILTER_TABS.map((tab) => {
            const selected = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 rounded-[3px] text-xs font-medium transition-colors cursor-pointer ${
                  selected
                    ? 'bg-white text-[#1E293B] border border-[#E2E5EA]'
                    : 'text-[#64748B] hover:text-[#1E293B] border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[11px] text-[#64748B] shrink-0">
        {activeSeries.map((key) => {
          const meta = SENSOR_METADATA[key];
          return (
            <div key={key} className="flex items-center gap-1.5 font-mono-tabular">
              <span
                className="w-3 h-[2px] inline-block"
                style={{ backgroundColor: meta.chartColor }}
              />
              <span className="text-[#1E293B] font-medium">{meta.label}</span>
              <span>({meta.unit})</span>
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={history}
            margin={{ top: 8, right: 10, left: -12, bottom: 2 }}
          >
            <CartesianGrid
              stroke="#E2E5EA"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              tick={{
                fontSize: 11,
                fill: '#64748B',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
              axisLine={{ stroke: '#E2E5EA' }}
              tickLine={{ stroke: '#E2E5EA' }}
              minTickGap={22}
            />

            {showGasAxis && (
              <YAxis
                yAxisId="gas"
                orientation="left"
                tick={{
                  fontSize: 11,
                  fill: '#64748B',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
                axisLine={{ stroke: '#E2E5EA' }}
                tickLine={false}
                width={46}
              />
            )}

            {showDhtAxis && (
              <YAxis
                yAxisId="dht"
                orientation={filter === 'dht11' ? 'left' : 'right'}
                domain={[0, 100]}
                tick={{
                  fontSize: 11,
                  fill: '#64748B',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
                axisLine={{ stroke: '#E2E5EA' }}
                tickLine={false}
                width={38}
              />
            )}

            <Tooltip content={<ChartTooltip />} />

            {showGasAxis && (
              <>
                <Line
                  yAxisId="gas"
                  type="linear"
                  dataKey="mq4"
                  stroke={SENSOR_METADATA.mq4.chartColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="gas"
                  type="linear"
                  dataKey="mq135"
                  stroke={SENSOR_METADATA.mq135.chartColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </>
            )}

            {showDhtAxis && (
              <>
                <Line
                  yAxisId="dht"
                  type="linear"
                  dataKey="temperature"
                  stroke={SENSOR_METADATA.temperature.chartColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="dht"
                  type="linear"
                  dataKey="humidity"
                  stroke={SENSOR_METADATA.humidity.chartColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
