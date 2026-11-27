import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  SENSOR_METADATA,
  SENSOR_ORDER,
  formatSensorValue,
} from '../constants/sensors';
import { SensorReadingValues, SensorStatus } from '../types/sensor';

interface AlertBannerProps {
  latest: SensorReadingValues;
  statuses: Record<keyof SensorReadingValues, SensorStatus>;
  overallStatus: SensorStatus;
}

export function AlertBanner({
  latest,
  statuses,
  overallStatus,
}: AlertBannerProps) {
  const dangerSensors = SENSOR_ORDER.filter((k) => statuses[k] === 'danger');
  const warningSensors = SENSOR_ORDER.filter((k) => statuses[k] === 'warning');

  if (overallStatus === 'normal') {
    return (
      <div
        role="status"
        className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-md px-4 py-2 flex items-center justify-between gap-3 shrink-0"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
          <p className="text-xs sm:text-sm text-[#15803D] truncate">
            <span className="font-semibold">STATUS NORMAL:</span> Seluruh 4 kanal sensor berada di bawah ambang batas waspada.
          </p>
        </div>
        <span className="hidden sm:inline-block text-[11px] font-mono-tabular text-[#15803D] shrink-0">
          TIDAK ADA TINDAKAN DIPERLUKAN
        </span>
      </div>
    );
  }

  const isDanger = overallStatus === 'danger';
  const prioritizedKeys = isDanger ? dangerSensors : warningSensors;
  const primaryMeta = SENSOR_METADATA[prioritizedKeys[0]];
  const advice = isDanger
    ? primaryMeta.actionAdvice.danger
    : primaryMeta.actionAdvice.warning;

  const affectedSummary = [...dangerSensors, ...warningSensors]
    .map((key) => {
      const meta = SENSOR_METADATA[key];
      return `${meta.label} (${formatSensorValue(latest[key], meta.decimals)} ${meta.unit})`;
    })
    .join(', ');

  return (
    <div
      role="alert"
      className={`rounded-md border px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 ${
        isDanger
          ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
          : 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]'
      }`}
    >
      <div className="flex items-start sm:items-center gap-2.5 min-w-0">
        {isDanger ? (
          <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
        )}
        <div className="text-xs sm:text-sm min-w-0">
          <span className="font-semibold mr-1.5">
            {isDanger ? 'PERINGATAN BAHAYA:' : 'PERINGATAN WASPADA:'}
          </span>
          <span className="font-mono-tabular font-medium">{affectedSummary}</span>
          <span className="mx-1.5 text-[#64748B]">—</span>
          <span className="font-medium">Saran: {advice}</span>
        </div>
      </div>

      <span
        className={`self-start sm:self-center text-[11px] font-mono-tabular font-semibold px-2 py-0.5 rounded border shrink-0 ${
          isDanger
            ? 'bg-white border-[#FECACA] text-[#B91C1C]'
            : 'bg-white border-[#FDE68A] text-[#B45309]'
        }`}
      >
        {prioritizedKeys.length} SENSOR TERPICU
      </span>
    </div>
  );
}
