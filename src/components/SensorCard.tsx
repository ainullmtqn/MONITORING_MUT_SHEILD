import { Droplets, Flame, Thermometer, Wind } from 'lucide-react';
import { formatSensorValue } from '../constants/sensors';
import { SensorMeta, SensorStatus, SensorThreshold } from '../types/sensor';

interface SensorCardProps {
  meta: SensorMeta;
  value: number;
  threshold: SensorThreshold;
  status: SensorStatus;
  variant?: 'primary' | 'compact';
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

export function SensorCard({
  meta,
  value,
  threshold,
  status,
  variant = 'primary',
}: SensorCardProps) {
  const Icon = SENSOR_ICONS[meta.key];
  const style = STATUS_STYLES[status];
  const isPrimary = variant === 'primary';

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
      className={`bg-white border ${style.accentBorder} rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col justify-between ${
        isPrimary ? 'p-4 gap-3' : 'p-3 gap-2'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`rounded bg-[#F4F5F7] border border-[#E2E5EA] flex items-center justify-center text-[#64748B] shrink-0 ${
              isPrimary ? 'w-8 h-8' : 'w-6 h-6'
            }`}
          >
            <Icon className={isPrimary ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
          </div>
          <div className="min-w-0">
            <h2
              className={`font-semibold text-[#1E293B] truncate ${
                isPrimary ? 'text-sm sm:text-base' : 'text-xs'
              }`}
            >
              {meta.label}
            </h2>
            <p
              className={`text-[#64748B] truncate ${
                isPrimary ? 'text-xs' : 'text-[10px]'
              }`}
            >
              {meta.sublabel}
            </p>
          </div>
        </div>

        <span
          className={`rounded border font-mono-tabular font-semibold tracking-wide shrink-0 ${
            isPrimary ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[9px]'
          } ${style.badge}`}
        >
          {style.label}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={`leading-none font-bold font-mono-tabular text-[#1E293B] ${
            isPrimary
              ? 'text-3xl xl:text-[36px]'
              : 'text-xl xl:text-2xl'
          }`}
        >
          {formatSensorValue(value, meta.decimals)}
        </span>
        <span
          className={`font-mono-tabular text-[#64748B] ${
            isPrimary ? 'text-sm' : 'text-[11px]'
          }`}
        >
          {meta.unit}
        </span>
      </div>

      <div className="space-y-1.5">
        <div
          className={`relative w-full bg-[#E2E5EA] rounded-[2px] ${
            isPrimary ? 'h-3' : 'h-2'
          }`}
          aria-label={`Skala ${meta.label}: ${formatSensorValue(value, meta.decimals)} ${meta.unit}`}
        >
          {isPrimary && (
            <>
              <div
                className="absolute inset-y-0 bg-[#FFFBEB]"
                style={{
                  left: `${warningPct}%`,
                  width: `${Math.max(0, dangerPct - warningPct)}%`,
                }}
              />
              <div
                className="absolute inset-y-0 right-0 bg-[#FEF2F2]"
                style={{ left: `${dangerPct}%` }}
              />
            </>
          )}

          <div
            className={`relative h-full rounded-[2px] transition-[width] duration-300 ${style.barColor}`}
            style={{ width: `${valuePct}%` }}
          />
          <div
            className={`absolute w-[2px] bg-[#B45309] ${
              isPrimary ? '-top-[3px] h-[18px]' : '-top-[2px] h-3'
            }`}
            style={{ left: `calc(${warningPct}% - 1px)` }}
            title={`Batas Waspada: ${threshold.warning} ${meta.unit}`}
          />
          <div
            className={`absolute w-[2px] bg-[#B91C1C] ${
              isPrimary ? '-top-[3px] h-[18px]' : '-top-[2px] h-3'
            }`}
            style={{ left: `calc(${dangerPct}% - 1px)` }}
            title={`Batas Bahaya: ${threshold.danger} ${meta.unit}`}
          />
        </div>

        <div
          className={`flex items-center justify-between font-mono-tabular text-[#64748B] ${
            isPrimary ? 'text-[11px]' : 'text-[10px]'
          }`}
        >
          <span>{meta.min}</span>
          <div className="flex items-center gap-2">
            <span className="text-[#B45309]">W:{threshold.warning}</span>
            <span className="text-[#B91C1C]">B:{threshold.danger}</span>
          </div>
          <span>
            {meta.max} {isPrimary ? meta.unit : ''}
          </span>
        </div>
      </div>
    </article>
  );
}
