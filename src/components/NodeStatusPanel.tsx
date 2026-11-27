import { Layers } from 'lucide-react';
import { formatSensorValue } from '../constants/sensors';
import { SensorNodeState } from '../types/sensor';
import { STATUS_STYLES } from './ThresholdGaugeBar';

interface NodeStatusPanelProps {
  sortedNodes: SensorNodeState[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}

export function NodeStatusPanel({
  sortedNodes,
  selectedNodeId,
  onSelectNode,
}: NodeStatusPanelProps) {
  return (
    <section className="bg-white border border-[#E2E5EA] rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col shrink-0 max-h-[215px]">
      <div className="px-3.5 py-2 border-b border-[#E2E5EA] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-[#64748B] shrink-0" />
          <h2 className="text-sm font-semibold text-[#1E293B] truncate">
            Status Titik Sensor
          </h2>
          <span className="px-1.5 py-0.5 text-[11px] font-mono-tabular bg-[#F4F5F7] border border-[#E2E5EA] rounded text-[#64748B]">
            {sortedNodes.length}
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

      <div className="overflow-y-auto lab-scroll">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#F4F5F7] border-b border-[#E2E5EA] text-[10px] font-mono-tabular uppercase tracking-wide text-[#64748B]">
            <tr>
              <th className="py-1.5 pl-3.5 pr-2 font-semibold">Nama Titik</th>
              <th className="py-1.5 px-2 text-right font-semibold">MQ-4</th>
              <th className="py-1.5 px-2 text-right font-semibold">MQ-135</th>
              <th className="py-1.5 pl-2 pr-3.5 text-right font-semibold">Status</th>
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
                  title={`Klik untuk fokus ke ${node.config.name}`}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#EFF6FF] hover:bg-[#DBEAFE]/60'
                      : 'hover:bg-[#F8FAFC]'
                  }`}
                >
                  <td className="py-1.5 pl-3.5 pr-2 font-medium text-[#1E293B] truncate max-w-[140px]">
                    <span className={isSelected ? 'font-semibold text-[#1D4ED8]' : ''}>
                      {node.config.name}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono-tabular text-[#1E293B] whitespace-nowrap">
                    {formatSensorValue(node.latest.mq4, 0)}
                    <span className="text-[10px] text-[#64748B] ml-0.5">ppm</span>
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono-tabular text-[#1E293B] whitespace-nowrap">
                    {formatSensorValue(node.latest.mq135, 0)}
                    <span className="text-[10px] text-[#64748B] ml-0.5">ppm</span>
                  </td>
                  <td className="py-1.5 pl-2 pr-3.5 text-right whitespace-nowrap">
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
