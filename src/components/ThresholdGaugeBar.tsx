import { SensorMeta, SensorStatus, SensorThreshold } from '../types/sensor';

export const STATUS_STYLES: Record<
  SensorStatus,
  {
    label: string;
    badge: string;
    barColor: string;
    accentBorder: string;
    textColor: string;
  }
> = {
  normal: {
    label: 'NORMAL',
    badge: 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]',
    barColor: 'bg-[#16A34A]',
    accentBorder: 'border-[#E2E5EA]',
    textColor: 'text-[#15803D]',
  },
  warning: {
    label: 'WASPADA',
    badge: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
    barColor: 'bg-[#B45309]',
    accentBorder: 'border-[#FDE68A]',
    textColor: 'text-[#B45309]',
  },
  danger: {
    label: 'BAHAYA',
    badge: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
    barColor: 'bg-[#B91C1C]',
    accentBorder: 'border-[#FECACA]',
    textColor: 'text-[#B91C1C]',
  },
};

interface ThresholdGaugeBarProps {
  meta: SensorMeta;
  value: number;
  threshold: SensorThreshold;
  status: SensorStatus;
  size?: 'primary' | 'compact';
  showMaxUnit?: boolean;
}

export function ThresholdGaugeBar({
  meta,
  value,
  threshold,
  status,
  size = 'primary',
  showMaxUnit = true,
}: ThresholdGaugeBarProps) {
  const style = STATUS_STYLES[status];
  const isPrimary = size === 'primary';

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
    <div className="space-y-1">
      <div
        className={`relative w-full bg-[#E2E5EA] rounded-[2px] ${
          isPrimary ? 'h-3' : 'h-2'
        }`}
        aria-label={`Skala ${meta.label}: ${value.toFixed(meta.decimals)} ${meta.unit}`}
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
          {meta.max}
          {showMaxUnit ? ` ${meta.unit}` : ''}
        </span>
      </div>
    </div>
  );
}
