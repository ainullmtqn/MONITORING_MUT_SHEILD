import { useEffect, useState } from 'react';
import {
  Activity,
  Lock,
  MapPin,
  Maximize2,
  Minimize2,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatCoordinates, formatOfflineDuration } from '../constants/sensors';
import { SensorNodeConfig, SensorNodeState } from '../types/sensor';
import { DoorBadge } from './DoorBadge';

interface HeaderProps {
  nodes: SensorNodeConfig[];
  selectedNodeId: string;
  selectedNodeState?: SensorNodeState | null;
  onlineNodeCount: number;
  onSelectNode: (nodeId: string) => void;
  isConnected: boolean;
  lastUpdatedAt: string;
  sampleCount: number;
  isAudioEnabled: boolean;
  onToggleAudio: () => void;
  onOpenThresholdModal: () => void;
  isOperatorUnlocked: boolean;
  onLockOperator: () => void;
}

export function Header({
  nodes,
  selectedNodeId,
  selectedNodeState,
  onlineNodeCount,
  onSelectNode,
  isConnected,
  lastUpdatedAt,
  sampleCount,
  isAudioEnabled,
  onToggleAudio,
  onOpenThresholdModal,
  isOperatorUnlocked,
  onLockOperator,
}: HeaderProps) {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if browser restricts fullscreen API
    }
  };

  return (
    <header className="bg-white border border-[#E2E5EA] rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-4 py-2 flex flex-col gap-2 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded bg-[#F4F5F7] border border-[#E2E5EA] flex items-center justify-center text-[#1E293B] shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold tracking-tight text-[#1E293B] truncate">
              Dashboard Monitoring Gas MUT IKN
            </h1>
            <p className="text-[11px] text-[#64748B] font-mono-tabular truncate">
              SCADA: MUT-IKN-SUBSURFACE • {onlineNodeCount}/{nodes.length} TITIK ONLINE • SAMPEL #{sampleCount}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isOperatorUnlocked && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#BBF7D0] bg-[#F0FDF4] text-[11px] font-medium text-[#15803D]">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Mode Operator: Aktif</span>
              <button
                type="button"
                onClick={onLockOperator}
                className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-[#BBF7D0] hover:bg-[#DCFCE7] text-[10px] font-semibold text-[#15803D] cursor-pointer"
                title="Kunci kembali akses operator"
              >
                <Lock className="w-2.5 h-2.5" />
                <span>Kunci</span>
              </button>
            </div>
          )}

          <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#E2E5EA] bg-[#F4F5F7]/60 text-xs text-[#1E293B]">
            <MapPin className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
            <span className="sr-only">Pilih titik sensor MUT IKN</span>
            <select
              value={selectedNodeId}
              onChange={(e) => onSelectNode(e.target.value)}
              className="bg-transparent text-xs font-medium text-[#1E293B] focus:outline-none cursor-pointer pr-1"
              aria-label="Filter titik sensor"
            >
              <option value="all">Semua Titik (Nilai Puncak)</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.code} | {node.name}
                </option>
              ))}
            </select>
          </label>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono-tabular ${
              isConnected
                ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
            }`}
            title="Status koneksi MQTT Live WebSocket (wss://broker.emqx.io:8084/mqtt)"
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
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors cursor-pointer ${
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
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#E2E5EA] bg-white hover:bg-[#F8FAFC] text-xs font-medium text-[#1E293B] transition-colors cursor-pointer"
            title={
              isOperatorUnlocked
                ? 'Buka pengaturan ambang batas'
                : 'Pengaturan ambang batas (terkunci PIN operator)'
            }
          >
            {!isOperatorUnlocked && (
              <Lock className="w-3 h-3 text-[#64748B]" />
            )}
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#64748B]" />
            <span>Ambang Batas</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="inline-flex items-center justify-center p-1.5 rounded border border-[#E2E5EA] bg-white hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#1E293B] transition-colors cursor-pointer"
            title={
              isFullscreen
                ? 'Keluar dari mode layar penuh'
                : 'Mode Layar Penuh (Control Room)'
            }
            aria-label={isFullscreen ? 'Keluar layar penuh' : 'Mode layar penuh'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {selectedNode && selectedNodeState && (
        <div className="pt-1.5 border-t border-[#E2E5EA] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#64748B]">
            <span className="inline-flex items-center gap-1 text-[#1E293B] font-semibold">
              <MapPin className="w-3 h-3 text-[#2563EB]" />
              {selectedNode.code} | {selectedNode.name}
            </span>
            <span>
              Koordinat: <strong className="text-[#1E293B]">{formatCoordinates(selectedNode)}</strong>
            </span>
            <span>
              Kedalaman: <strong className="text-[#1E293B]">{selectedNode.depth}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span>Pintu:</span>
              <DoorBadge door={selectedNodeState.door} />
            </span>
            {!selectedNodeState.isOnline && (
              <span className="px-1.5 py-0.5 rounded border border-[#CBD5E1] bg-[#E2E5EA] text-[#334155] font-semibold">
                {formatOfflineDuration(selectedNodeState.secondsSinceUpdate)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelectNode('all')}
            className="text-[11px] font-sans font-medium text-[#2563EB] hover:underline cursor-pointer"
          >
            Kembali ke Semua Titik
          </button>
        </div>
      )}
    </header>
  );
}
