import { Activity, MapPin, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { SensorNodeConfig } from '../types/sensor';

interface HeaderProps {
  nodes: SensorNodeConfig[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  isConnected: boolean;
  lastUpdatedAt: string;
  sampleCount: number;
  isAudioEnabled: boolean;
  onToggleAudio: () => void;
  onOpenThresholdModal: () => void;
}

export function Header({
  nodes,
  selectedNodeId,
  onSelectNode,
  isConnected,
  lastUpdatedAt,
  sampleCount,
  isAudioEnabled,
  onToggleAudio,
  onOpenThresholdModal,
}: HeaderProps) {
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <header className="bg-white border border-[#E2E5EA] rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded bg-[#F4F5F7] border border-[#E2E5EA] flex items-center justify-center text-[#1E293B] shrink-0">
          <Activity className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-semibold tracking-tight text-[#1E293B] truncate">
            Dashboard Monitoring Sensor IoT
          </h1>
          <p className="text-[11px] text-[#64748B] font-mono-tabular truncate">
            {selectedNode
              ? `${selectedNode.code}: ${selectedNode.name} • MQ-4 / MQ-135 / DHT11 • SAMPEL #${sampleCount}`
              : `MULTI-TITIK (${nodes.length} NODE) • MQ-4 / MQ-135 / DHT11 • SAMPEL #${sampleCount}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#E2E5EA] bg-[#F4F5F7]/60 text-xs text-[#1E293B]">
          <MapPin className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
          <span className="sr-only">Pilih titik sensor</span>
          <select
            value={selectedNodeId}
            onChange={(e) => onSelectNode(e.target.value)}
            className="bg-transparent text-xs font-medium text-[#1E293B] focus:outline-none cursor-pointer pr-1"
            aria-label="Filter titik sensor"
          >
            <option value="all">Semua Titik (Nilai Puncak)</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </label>

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
