import { Battery, BatteryLow, Layers } from 'lucide-react';
import {
  formatNodeLocation,
  formatOfflineDuration,
  formatSensorValue,
} from '../constants/sensors';
import { SensorNodeState } from '../types/sensor';
import { DoorBadge } from './DoorBadge';
import { STATUS_STYLES } from './ThresholdGaugeBar';

interface NodeStatusPanelProps {
  sortedNodes: SensorNodeState[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  embedded?: boolean;
}

function BatteryIndicator({ battery }: { battery: number | null }) {
  const isLow = battery !== null && battery < 20;
  const Icon = isLow ? BatteryLow : Battery;
  const colorClass =
    battery === null
      ? 'text-[#64748B]'
      : isLow
        ? 'text-[#B91C1C] font-semibold'
        : 'text-[#15803D]';

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-mono-tabular ${colorClass}`}
      title={
        battery === null
          ? 'Daya baterai belum dilaporkan ESP32'
          : `Level baterai: ${battery}%`
      }
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span>{battery === null ? '--%' : `${battery}%`}</span>
    </span>
  );
}

export function NodeStatusPanel({
  sortedNodes,
  selectedNodeId,
  onSelectNode,
  embedded = false,
}: NodeStatusPanelProps) {
  const onlineCount = sortedNodes.filter((n) => n.isOnline).length;

  return (
    <section
      className={`flex flex-col min-h-0 flex-1 ${
        embedded
          ? ''
          : 'bg-white border border-[#E2E5EA] rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
      }`}
    >
      <div className="px-3.5 py-2 border-b border-[#E2E5EA] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-[#64748B] shrink-0" />
          <h2 className="text-xs sm:text-sm font-semibold text-[#1E293B] truncate">
            Status Titik Bawah Tanah (IKN)
          </h2>
          <span className="px-1.5 py-0.5 text-[10px] font-mono-tabular bg-[#F4F5F7] border border-[#E2E5EA] rounded text-[#64748B]">
            {onlineCount}/{sortedNodes.length} ONLINE
          </span>
        </div>

        {selectedNodeId !== 'all' && (
          <button
            type="button"
            onClick={() => onSelectNode('all')}
            className="px-2 py-0.5 rounded border border-[#E2E5EA] bg-[#F4F5F7] hover:bg-[#E2E5EA]/60 text-[11px] font-medium text-[#1E293B] cursor-pointer shrink-0"
          >
            Semua Titik
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lab-scroll">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#F4F5F7] border-b border-[#E2E5EA] text-[10px] font-mono-tabular uppercase tracking-wide text-[#64748B]">
            <tr>
              <th className="py-1.5 pl-3 pr-1.5 font-semibold">Titik & Daya</th>
              <th className="py-1.5 px-1.5 text-right font-semibold">MQ-4</th>
              <th className="py-1.5 px-1.5 text-right font-semibold">MQ-135</th>
              <th className="py-1.5 px-1.5 text-center font-semibold">Pintu</th>
              <th className="py-1.5 pl-1.5 pr-3 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E5EA] text-xs">
            {sortedNodes.map((node) => {
              const style = STATUS_STYLES[node.overallStatus];
              const isSelected = selectedNodeId === node.config.id;
              return (
                <tr
                  key={node.config.id}
                  onClick={() => onSelectNode(node.config.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectNode(node.config.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  title={`Klik untuk fokus ke ${node.config.code} | ${node.config.name}`}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#EFF6FF] hover:bg-[#DBEAFE]/60'
                      : 'hover:bg-[#F8FAFC]'
                  }`}
                >
                  <td className="py-2 pl-3 pr-1.5 max-w-[165px]">
                    <div
                      className={`text-xs truncate ${
                        isSelected ? 'font-semibold text-[#1D4ED8]' : 'font-medium text-[#1E293B]'
                      }`}
                    >
                      <span className="font-mono-tabular font-semibold mr-1">
                        {node.config.code}
                      </span>
                      <span>{node.config.name}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-[10px] font-mono-tabular text-[#64748B]">
                      <span className="truncate">{formatNodeLocation(node.config)}</span>
                      <BatteryIndicator battery={node.battery} />
                    </div>
                    {!node.isOnline && (
                      <div className="text-[10px] font-mono-tabular text-[#475569] mt-0.5">
                        {formatOfflineDuration(node.secondsSinceUpdate)}
                      </div>
                    )}
                  </td>
                  <td
                    className={`py-2 px-1.5 text-right font-mono-tabular whitespace-nowrap align-middle ${
                      node.isOnline ? 'text-[#1E293B]' : 'text-[#94A3B8]'
                    }`}
                  >
                    {node.isOnline ? (
                      <>
                        {formatSensorValue(node.latest.mq4, 0)}
                        <span className="text-[10px] text-[#64748B] ml-0.5">ppm</span>
                      </>
                    ) : (
                      '--'
                    )}
                  </td>
                  <td
                    className={`py-2 px-1.5 text-right font-mono-tabular whitespace-nowrap align-middle ${
                      node.isOnline ? 'text-[#1E293B]' : 'text-[#94A3B8]'
                    }`}
                  >
                    {node.isOnline ? (
                      <>
                        {formatSensorValue(node.latest.mq135, 0)}
                        <span className="text-[10px] text-[#64748B] ml-0.5">ppm</span>
                      </>
                    ) : (
                      '--'
                    )}
                  </td>
                  <td className="py-2 px-1.5 text-center whitespace-nowrap align-middle">
                    <DoorBadge door={node.door} />
                  </td>
                  <td className="py-2 pl-1.5 pr-3 text-right whitespace-nowrap align-middle">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-mono-tabular font-semibold ${style.badge}`}
                    >
                      {style.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
