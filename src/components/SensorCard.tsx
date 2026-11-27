import { Flame, Droplets, Thermometer, Wind } from 'lucide-react';
import { formatSensorValue } from '../constants/sensors';
import { SensorMeta, SensorStatus, SensorThreshold } from '../types/sensor';

interface SensorCardProps {
  meta: SensorMeta;
  value: number;
  threshold: SensorThreshold;
  status: SensorStatus;
}

const SENSOR_ICONS = {
  mq4: Flame,
  mq135: Wind,
  temperature: Thermometer,
  humidity: Droplets,
} as const;

const STATUS_STYLES: Record<
  SensorStatus,
  {
    label: string;
    badge: string;
    barColor: string;
    accentBorder: string;
  }
> = {
  normal: {
    label: 'NORMAL',
    badge: 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]',
    barColor: 'bg-[#16A34A]',
    accentBorder: 'border-[#E2E5EA]',
  },
  warning: {
    label: 'WASPADA',
    badge: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
    barColor: 'bg-[#B45309]',
    accentBorder: 'border-[#FDE68A]',
  },
  danger: {
    label: 'BAHAYA',
    badge: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
    barColor: 'bg-[#B91C1C]',
    accentBorder: 'border-[#FECACA]',
  },
};

export function SensorCard({ meta, value, threshold, status }: SensorCardProps) {
  const Icon = SENSOR_ICONS[meta.key];
  const style = STATUS_STYLES[status];

  const span = meta.max - meta.min;
  const valuePct = Math.min(100, Math.max(0, ((value - meta.min) / span) * 100));
  const warningPct = Math.min(
    100,
    Math.max(0, ((threshold.warning - meta.min) / span) * 100)
  );
  const dangerPct = Math.min(
    100,
    Math.max(0, ((threshold.danger - meta.min) / span) * 100)
  );

  return (
    <article
      className={`bg-white border ${style.accentBorder} rounded-md p-3.5 flex flex-col justify-between gap-2.5`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded bg-[#F4F5F7] border border-[#E2E5EA] flex items-center justify-center text-[#64748B] shrink-0">
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-semibold text-[#1E293B] truncate">
              {meta.label}
            </h2>
            <p className="text-[11px] text-[#64748B] truncate">{meta.sublabel}</p>
          </div>
        </div>

        <span
          className={`px-2 py-0.5 rounded border text-[10px] font-mono-tabular font-semibold tracking-wide shrink-0 ${style.badge}`}
        >
          {style.label}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl xl:text-[28px] leading-none font-semibold font-mono-tabular text-[#1E293B]">
          {formatSensorValue(value, meta.decimals)}
        </span>
        <span className="text-xs font-mono-tabular text-[#64748B]">
          {meta.unit}
        </span>
      </div>

      <div className="space-y-1.5">
        <div
          className="relative h-2.5 w-full bg-[#E2E5EA] rounded-[2px]"
          aria-label={`Skala ${meta.label}: ${formatSensorValue(value, meta.decimals)} ${meta.unit}`}
        >
          <div
            className={`h-full rounded-[2px] transition-[width] duration-300 ${style.barColor}`}
            style={{ width: `${valuePct}%` }}
          />
          <div
            className="absolute -top-[3px] w-[2px] h-4 bg-[#B45309]"
            style={{ left: `calc(${warningPct}% - 1px)` }}
            title={`Batas Waspada: ${threshold.warning} ${meta.unit}`}
          />
          <div
            className="absolute -top-[3px] w-[2px] h-4 bg-[#B91C1C]"
            style={{ left: `calc(${dangerPct}% - 1px)` }}
            title={`Batas Bahaya: ${threshold.danger} ${meta.unit}`}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[#64748B]">
          <span>{meta.min}</span>
          <div className="flex items-center gap-2.5">
            <span className="text-[#B45309]">W:{threshold.warning}</span>
            <span className="text-[#B91C1C]">B:{threshold.danger}</span>
          </div>
          <span>
            {meta.max} {meta.unit}
          </span>
        </div>
      </div>
    </article>
  );
}
