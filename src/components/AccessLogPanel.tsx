import { KeyRound, Trash2 } from 'lucide-react';
import { formatSensorValue } from '../constants/sensors';
import { RfidAccessLogEntry } from '../types/sensor';

interface AccessLogPanelProps {
  logs: RfidAccessLogEntry[];
  onClearLogs: () => void;
  embedded?: boolean;
}

export function AccessLogPanel({
  logs,
  onClearLogs,
  embedded = false,
}: AccessLogPanelProps) {
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
          <KeyRound className="w-4 h-4 text-[#64748B] shrink-0" />
          <h2 className="text-xs sm:text-sm font-semibold text-[#1E293B] truncate">
            Log Akses RFID & Pintu
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
            title="Bersihkan log akses RFID"
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
              Belum ada aktivitas tap kartu RFID.
            </p>
            <p className="text-[11px] text-[#64748B] mt-1 font-mono-tabular">
              Setiap tap kartu (rfid: true) akan tercatat otomatis di sini.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#F4F5F7] border-b border-[#E2E5EA] text-[10px] font-mono-tabular uppercase tracking-wide text-[#64748B]">
              <tr>
                <th className="py-1.5 pl-3.5 pr-2 font-semibold">Waktu</th>
                <th className="py-1.5 px-2 font-semibold">Node & Lokasi</th>
                <th className="py-1.5 px-2 text-right font-semibold">MQ-4</th>
                <th className="py-1.5 pl-2 pr-3.5 text-right font-semibold">Akses Pintu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E5EA] text-xs">
              {logs.map((entry) => {
                const granted = entry.accessResult === 'DITERIMA';
                return (
                  <tr key={entry.id} className="hover:bg-[#F8FAFC]">
                    <td className="py-2 pl-3.5 pr-2 font-mono-tabular text-[11px] text-[#64748B] whitespace-nowrap align-top">
                      {entry.timestamp}
                    </td>
                    <td className="py-2 px-2 min-w-0 align-top">
                      <div className="font-semibold text-[#1E293B] truncate">
                        <span className="font-mono-tabular mr-1">{entry.nodeCode}</span>
                        <span className="font-normal text-[#64748B] text-[11px]">
                          • {entry.nodeName}
                        </span>
                      </div>
                      <div className="font-mono-tabular text-[10px] text-[#64748B] truncate">
                        [{entry.nodeLocationTag}]
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-[#1E293B] whitespace-nowrap align-top">
                      <span className="font-semibold">
                        {formatSensorValue(entry.mq4Value, 0)}
                      </span>{' '}
                      <span className="text-[10px] text-[#64748B]">ppm</span>
                    </td>
                    <td className="py-2 pl-2 pr-3.5 text-right whitespace-nowrap align-top">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-mono-tabular font-semibold ${
                          granted
                            ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                            : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                        }`}
                      >
                        {entry.accessResult}
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
