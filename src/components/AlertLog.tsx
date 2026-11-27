import { ClipboardList, Trash2 } from 'lucide-react';
import { SENSOR_METADATA, formatSensorValue } from '../constants/sensors';
import { AlertLogEntry } from '../types/sensor';

interface AlertLogProps {
  logs: AlertLogEntry[];
  onClearLogs: () => void;
  embedded?: boolean;
}

export function AlertLog({ logs, onClearLogs, embedded = false }: AlertLogProps) {
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
          <ClipboardList className="w-4 h-4 text-[#64748B] shrink-0" />
          <h2 className="text-xs sm:text-sm font-semibold text-[#1E293B] truncate">
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

      <div className="flex-1 min-h-0 overflow-y-auto lab-scroll">
        {logs.length === 0 ? (
          <div className="h-full min-h-[140px] flex flex-col items-center justify-center p-4 text-center">
            <p className="text-xs font-medium text-[#64748B]">
              Belum ada catatan pelanggaran ambang batas.
            </p>
            <p className="text-[11px] text-[#64748B] mt-1 font-mono-tabular">
              Log lokasi & koordinat tercatat otomatis saat WASPADA / BAHAYA.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#F4F5F7] border-b border-[#E2E5EA] text-[10px] font-mono-tabular uppercase tracking-wide text-[#64748B]">
              <tr>
                <th className="py-1.5 pl-3.5 pr-2 font-semibold">Waktu</th>
                <th className="py-1.5 px-2 font-semibold">Lokasi & Sensor</th>
                <th className="py-1.5 px-2 text-right font-semibold">Nilai</th>
                <th className="py-1.5 pl-2 pr-3.5 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E5EA] text-xs">
              {logs.map((entry) => {
                const meta = SENSOR_METADATA[entry.sensorKey];
                const isDanger = entry.status === 'danger';
                return (
                  <tr key={entry.id} className="hover:bg-[#F8FAFC]">
                    <td className="py-2 pl-3.5 pr-2 font-mono-tabular text-[11px] text-[#64748B] whitespace-nowrap align-top">
                      {entry.timestamp}
                    </td>
                    <td className="py-2 px-2 min-w-0 align-top">
                      <div className="font-semibold text-[#1E293B] truncate">
                        {entry.sensorName}{' '}
                        <span className="font-normal text-[#64748B] text-[11px]">
                          • {entry.nodeName}
                        </span>
                      </div>
                      <div className="font-mono-tabular text-[10px] text-[#64748B] truncate">
                        [{entry.nodeLocationTag}]
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular whitespace-nowrap align-top">
                      <div className="font-semibold text-[#1E293B]">
                        {formatSensorValue(entry.value, meta.decimals)} {entry.unit}
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        ≥{entry.thresholdValue}
                      </div>
                    </td>
                    <td className="py-2 pl-2 pr-3.5 text-right whitespace-nowrap align-top">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-mono-tabular font-semibold ${
                          isDanger
                            ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                            : 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]'
                        }`}
                      >
                        {isDanger ? 'BAHAYA' : 'WASPADA'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
