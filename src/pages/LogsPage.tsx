import { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { AccessLogPanel } from '../components/AccessLogPanel';
import { AlertLog } from '../components/AlertLog';
import { SENSOR_NODES } from '../constants/sensors';
import { useMonitoring } from '../context/MonitoringContext';

type LogsSubTab = 'alerts' | 'access';

export function LogsPage() {
  const { alertLogs, accessLogs, requestOperatorAction } = useMonitoring();
  const [subTab, setSubTab] = useState<LogsSubTab>('alerts');
  const [nodeFilterId, setNodeFilterId] = useState<string>('all');

  const filteredAlerts = useMemo(() => {
    if (nodeFilterId === 'all') return alertLogs;
    return alertLogs.filter((entry) => entry.nodeId === nodeFilterId);
  }, [alertLogs, nodeFilterId]);

  const filteredAccess = useMemo(() => {
    if (nodeFilterId === 'all') return accessLogs;
    return accessLogs.filter((entry) => entry.nodeId === nodeFilterId);
  }, [accessLogs, nodeFilterId]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Sub-tab switcher & node filter */}
      <div className="bg-white border border-[#E2E5EA] rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div
          role="tablist"
          aria-label="Kategori log sistem"
          className="inline-flex bg-[#F4F5F7] border border-[#E2E5EA] rounded p-0.5 gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'alerts'}
            onClick={() => setSubTab('alerts')}
            className={`px-3 py-1.5 rounded-[3px] text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              subTab === 'alerts'
                ? 'bg-white text-[#1E293B] border border-[#E2E5EA]'
                : 'text-[#64748B] hover:text-[#1E293B] border border-transparent'
            }`}
          >
            <span>Riwayat Peringatan Gas</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono-tabular font-semibold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]">
              {filteredAlerts.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'access'}
            onClick={() => setSubTab('access')}
            className={`px-3 py-1.5 rounded-[3px] text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              subTab === 'access'
                ? 'bg-white text-[#1E293B] border border-[#E2E5EA]'
                : 'text-[#64748B] hover:text-[#1E293B] border border-transparent'
            }`}
          >
            <span>Log Akses RFID</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono-tabular font-semibold bg-[#F0F9FF] text-[#0369A1] border border-[#BAE6FD]">
              {filteredAccess.length}
            </span>
          </button>
        </div>

        <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#E2E5EA] bg-[#F4F5F7]/70 text-xs text-[#1E293B]">
          <Filter className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
          <span className="text-[#64748B] font-medium">Filter Node:</span>
          <select
            value={nodeFilterId}
            onChange={(e) => setNodeFilterId(e.target.value)}
            className="bg-transparent font-semibold text-[#1E293B] focus:outline-none cursor-pointer pr-1"
            aria-label="Filter log berdasarkan node"
          >
            <option value="all">Semua Node</option>
            {SENSOR_NODES.map((node) => (
              <option key={node.id} value={node.id}>
                {node.code} — {node.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Table Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {subTab === 'alerts' ? (
          <AlertLog
            logs={filteredAlerts}
            onClearLogs={() => requestOperatorAction('clear-alerts')}
          />
        ) : (
          <AccessLogPanel
            logs={filteredAccess}
            onClearLogs={() => requestOperatorAction('clear-access')}
          />
        )}
      </div>
    </div>
  );
}
