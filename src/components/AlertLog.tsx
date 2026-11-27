import { ClipboardList, Trash2 } from 'lucide-react';
import { SENSOR_METADATA, formatSensorValue } from '../constants/sensors';
import { AlertLogEntry } from '../types/sensor';

interface AlertLogProps {
  logs: AlertLogEntry[];
  onClearLogs: () => void;
}

export function AlertLog({ logs, onClearLogs }: AlertLogProps) {
  return (
    <section className="bg-white border border-[#E2E5EA] rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col min-h-[200px] lg:min-h-0 flex-1">
      <div className="px-3.5 py-2 border-b border-[#E2E5EA] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="w-4 h-4 text-[#64748B] shrink-0" />
          <h2 className="text-sm font-semibold text-[#1E293B] truncate">
            Riwayat Peringatan
          </h2>
          <span className="px-1.5 py-0.5 text-[11px] font-mono-tabular bg-[#F4F5F7] border border-[#E2E5EA] rounded text-[#64748B]">
            {logs.length}
          </span>
        </div>

        {logs.length > 0 && (
          <button
            type="button"
            onClick={onClearLogs}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#E2E5EA] bg-white hover:bg-[#F8FAFC] text-[11px] text-[#64748B] hover:text-[#1E293B] transition-colors cursor-pointer"
            title="Bersihkan log riwayat peringatan"
          >
            <Trash2 className="w-3 h-3" />
            <span>Bersihkan</span>
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lab-scroll divide-y divide-[#E2E5EA]">
        {logs.length === 0 ? (
          <div className="h-full min-h-[120px] flex flex-col items-center justify-center p-4 text-center">
            <p className="text-xs font-medium text-[#64748B]">
              Belum ada catatan pelanggaran ambang batas.
            </p>
            <p className="text-[11px] text-[#64748B] mt-1 font-mono-tabular">
              Log tercatat otomatis per titik saat WASPADA / BAHAYA.
            </p>
          </div>
        ) : (
          logs.map((entry) => {
            const meta = SENSOR_METADATA[entry.sensorKey];
            const isDanger = entry.status === 'danger';
            return (
              <div
                key={entry.id}
                className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs hover:bg-[#F8FAFC]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="font-mono-tabular text-[11px] text-[#64748B]">
                      {entry.timestamp}
                    </span>
                    <span className="font-mono-tabular text-[10px] font-medium px-1.5 py-0.2 rounded bg-[#F4F5F7] border border-[#E2E5EA] text-[#1E293B]">
                      {entry.nodeName}
                    </span>
                    <span className="font-semibold text-[#1E293B]">
                      {entry.sensorName}
                    </span>
                  </div>
                  <div className="font-mono-tabular text-[11px] text-[#64748B] mt-0.5">
                    Nilai:{' '}
                    <span className="text-[#1E293B] font-semibold">
                      {formatSensorValue(entry.value, meta.decimals)} {entry.unit}
                    </span>{' '}
                    (Batas ≥ {entry.thresholdValue} {entry.unit})
                  </div>
                </div>

                <span
                  className={`px-2 py-0.5 rounded border text-[10px] font-mono-tabular font-semibold shrink-0 ${
                    isDanger
                      ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                      : 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]'
                  }`}
                >
                  {isDanger ? 'BAHAYA' : 'WASPADA'}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
