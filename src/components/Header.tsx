import { Activity, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
  lastUpdatedAt: string;
  sampleCount: number;
  isAudioEnabled: boolean;
  onToggleAudio: () => void;
  onOpenThresholdModal: () => void;
}

export function Header({
  isConnected,
  lastUpdatedAt,
  sampleCount,
  isAudioEnabled,
  onToggleAudio,
  onOpenThresholdModal,
}: HeaderProps) {
  return (
    <header className="bg-white border border-[#E2E5EA] rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded bg-[#F4F5F7] border border-[#E2E5EA] flex items-center justify-center text-[#1E293B] shrink-0">
          <Activity className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-semibold tracking-tight text-[#1E293B] truncate">
            Dashboard Monitoring Sensor IoT
          </h1>
          <p className="text-[11px] text-[#64748B] font-mono-tabular truncate">
            UNIT: LAB-ENV-01 · MQ-4 / MQ-135 / DHT11 · SAMPEL #{sampleCount}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs font-mono-tabular ${
            isConnected
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
          }`}
          title="Status aliran telemetri real-time (interval 2 detik)"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-[#16A34A]' : 'bg-[#B91C1C]'
            }`}
          />
          <span className="font-medium">
            {isConnected ? 'LIVE' : 'TERPUTUS'}
          </span>
          <span className="text-[#64748B]">|</span>
          <span>{lastUpdatedAt}</span>
        </div>

        <button
          type="button"
          onClick={onToggleAudio}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors cursor-pointer ${
            isAudioEnabled
              ? 'bg-white border-[#E2E5EA] text-[#1E293B] hover:bg-[#F8FAFC]'
              : 'bg-[#F4F5F7] border-[#E2E5EA] text-[#64748B] hover:bg-[#E2E5EA]/60'
          }`}
          aria-pressed={isAudioEnabled}
          title="Aktifkan atau senyapkan suara alarm Web Audio API"
        >
          {isAudioEnabled ? (
            <Volume2 className="w-3.5 h-3.5 text-[#15803D]" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-[#64748B]" />
          )}
          <span>{isAudioEnabled ? 'Alarm: Aktif' : 'Alarm: Senyap'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenThresholdModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#E2E5EA] bg-white hover:bg-[#F8FAFC] text-xs font-medium text-[#1E293B] transition-colors cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#64748B]" />
          <span>Ambang Batas</span>
        </button>
      </div>
    </header>
  );
}
