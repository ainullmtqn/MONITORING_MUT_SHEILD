import { Cpu, Droplets, Thermometer } from 'lucide-react';
import { SENSOR_METADATA, formatSensorValue } from '../constants/sensors';
import { SensorStatus, SensorThreshold } from '../types/sensor';
import { STATUS_STYLES, ThresholdGaugeBar } from './ThresholdGaugeBar';

interface Dht11CardProps {
  temperature: number;
  humidity: number;
  tempThreshold: SensorThreshold;
  humidityThreshold: SensorThreshold;
  tempStatus: SensorStatus;
  humidityStatus: SensorStatus;
  tempSourceLabel?: string;
  humiditySourceLabel?: string;
}

function getCombinedStatus(a: SensorStatus, b: SensorStatus): SensorStatus {
  if (a === 'danger' || b === 'danger') return 'danger';
  if (a === 'warning' || b === 'warning') return 'warning';
  return 'normal';
}

export function Dht11Card({
  temperature,
  humidity,
  tempThreshold,
  humidityThreshold,
  tempStatus,
  humidityStatus,
  tempSourceLabel,
  humiditySourceLabel,
}: Dht11CardProps) {
  const combinedStatus = getCombinedStatus(tempStatus, humidityStatus);
  const style = STATUS_STYLES[combinedStatus];

  const channels = [
    {
      key: 'temperature' as const,
      shortLabel: 'Suhu',
      Icon: Thermometer,
      meta: SENSOR_METADATA.temperature,
      value: temperature,
      threshold: tempThreshold,
      status: tempStatus,
      sourceLabel: tempSourceLabel,
    },
    {
      key: 'humidity' as const,
      shortLabel: 'Kelembapan',
      Icon: Droplets,
      meta: SENSOR_METADATA.humidity,
      value: humidity,
      threshold: humidityThreshold,
      status: humidityStatus,
      sourceLabel: humiditySourceLabel,
    },
  ];

  return (
    <article
      className={`bg-white border ${style.accentBorder} rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-3 flex flex-col justify-between gap-2 md:col-span-2 lg:col-span-1`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded bg-[#F4F5F7] border border-[#E2E5EA] flex items-center justify-center text-[#64748B] shrink-0">
            <Cpu className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-semibold text-[#1E293B] truncate">
              DHT11
            </h2>
            <p className="text-[11px] text-[#64748B] truncate">
              Suhu & Kelembapan
            </p>
          </div>
        </div>

        <span
          className={`px-2 py-0.5 rounded border text-[10px] font-mono-tabular font-semibold tracking-wide shrink-0 ${style.badge}`}
        >
          {style.label}
        </span>
      </div>

      <div className="space-y-1.5">
        {channels.map(
          ({
            key,
            shortLabel,
            Icon,
            meta,
            value,
            threshold,
            status,
            sourceLabel,
          }) => {
            const chStyle = STATUS_STYLES[status];
            return (
              <div
                key={key}
                className="rounded border border-[#E2E5EA] bg-[#F4F5F7]/45 px-2.5 py-1.5 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                    <span className="text-xs font-medium text-[#64748B] truncate">
                      {shortLabel}
                    </span>
                    {sourceLabel && (
                      <span className="text-[10px] font-mono-tabular text-[#64748B] truncate hidden sm:inline">
                        ({sourceLabel})
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 font-mono-tabular shrink-0">
                    <span className="text-base font-bold text-[#1E293B]">
                      {formatSensorValue(value, meta.decimals)}
                    </span>
                    <span className="text-[11px] text-[#64748B]">{meta.unit}</span>
                    {status !== 'normal' && (
                      <span className={`ml-1 text-[10px] font-semibold ${chStyle.textColor}`}>
                        • {chStyle.label}
                      </span>
                    )}
                  </div>
                </div>

                <ThresholdGaugeBar
                  meta={meta}
                  value={value}
                  threshold={threshold}
                  status={status}
                  size="compact"
                  showMaxUnit={false}
                />
              </div>
            );
          }
        )}
      </div>
    </article>
  );
}
