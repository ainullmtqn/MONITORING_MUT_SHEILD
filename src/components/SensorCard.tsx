import { Flame, Wind } from 'lucide-react';
import { formatSensorValue } from '../constants/sensors';
import { SensorMeta, SensorStatus, SensorThreshold } from '../types/sensor';
import { STATUS_STYLES, ThresholdGaugeBar } from './ThresholdGaugeBar';

interface SensorCardProps {
  meta: SensorMeta;
  value: number;
  threshold: SensorThreshold;
  status: SensorStatus;
}

const GAS_ICONS = {
  mq4: Flame,
  mq135: Wind,
} as const;

export function SensorCard({ meta, value, threshold, status }: SensorCardProps) {
  const Icon = meta.key === 'mq4' || meta.key === 'mq135' ? GAS_ICONS[meta.key] : Wind;
  const style = STATUS_STYLES[status];

  return (
    <article
      className={`bg-white border ${style.accentBorder} rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4 flex flex-col justify-between gap-3`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded bg-[#F4F5F7] border border-[#E2E5EA] flex items-center justify-center text-[#64748B] shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-[#1E293B] truncate">
              {meta.label}
            </h2>
            <p className="text-xs text-[#64748B] truncate">{meta.sublabel}</p>
          </div>
        </div>

        <span
          className={`px-2 py-0.5 rounded border text-[11px] font-mono-tabular font-semibold tracking-wide shrink-0 ${style.badge}`}
        >
          {style.label}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl xl:text-[36px] leading-none font-bold font-mono-tabular text-[#1E293B]">
          {formatSensorValue(value, meta.decimals)}
        </span>
        <span className="text-sm font-mono-tabular text-[#64748B]">
          {meta.unit}
        </span>
      </div>

      <ThresholdGaugeBar
        meta={meta}
        value={value}
        threshold={threshold}
        status={status}
        size="primary"
      />
    </article>
  );
}
