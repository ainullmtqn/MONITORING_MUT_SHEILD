import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  SENSOR_METADATA,
  SENSOR_ORDER,
  formatNodeLocationTag,
  formatSensorValue,
} from '../constants/sensors';
import { SensorKey, SensorNodeState, SensorStatus } from '../types/sensor';

interface AlertBannerProps {
  nodes: SensorNodeState[];
  overallStatus: SensorStatus;
}

interface TriggeredItem {
  nodeLocationTag: string;
  sensorKey: SensorKey;
  value: number;
  status: Exclude<SensorStatus, 'normal'>;
}

export function AlertBanner({ nodes, overallStatus }: AlertBannerProps) {
  if (overallStatus === 'normal') {
    return (
      <div
        role="status"
        className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-md px-4 py-2 flex items-center justify-between gap-3 shrink-0"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
          <p className="text-xs sm:text-sm text-[#15803D] truncate">
            <span className="font-semibold">STATUS NORMAL:</span> Seluruh {nodes.length} titik terowongan MUT IKN berada di bawah ambang batas waspada.
          </p>
        </div>
        <span className="hidden sm:inline-block text-[11px] font-mono-tabular text-[#15803D] shrink-0">
          TIDAK ADA TINDAKAN DIPERLUKAN
        </span>
      </div>
    );
  }

  const triggeredItems: TriggeredItem[] = [];
  for (const node of nodes) {
    for (const key of SENSOR_ORDER) {
      const st = node.statuses[key];
      if (st !== 'normal') {
        triggeredItems.push({
          nodeLocationTag: formatNodeLocationTag(node.config),
          sensorKey: key,
          value: node.latest[key],
          status: st,
        });
      }
    }
  }

  triggeredItems.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'danger' ? -1 : 1;
    return b.value - a.value;
  });

  const isDanger = overallStatus === 'danger';
  const prioritized = triggeredItems.filter((item) =>
    isDanger ? item.status === 'danger' : item.status === 'warning'
  );
  const primary = prioritized[0] ?? triggeredItems[0];
  const primaryMeta = SENSOR_METADATA[primary.sensorKey];
  const advice = isDanger
    ? primaryMeta.actionAdvice.danger
    : primaryMeta.actionAdvice.warning;

  const affectedSummary = triggeredItems
    .slice(0, 2)
    .map((item) => {
      const meta = SENSOR_METADATA[item.sensorKey];
      return `[${item.nodeLocationTag}] ${meta.label} (${formatSensorValue(item.value, meta.decimals)} ${meta.unit})`;
    })
    .join(', ');

  const extraCount =
    triggeredItems.length > 2 ? ` +${triggeredItems.length - 2} lainnya` : '';

  const affectedNodesCount = new Set(prioritized.map((i) => i.nodeLocationTag)).size;

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
          <span className="font-mono-tabular font-medium">
            {affectedSummary}
            {extraCount}
          </span>
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
        {affectedNodesCount} TITIK TERPICU
      </span>
    </div>
  );
}
