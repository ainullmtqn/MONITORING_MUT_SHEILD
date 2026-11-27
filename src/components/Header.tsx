import { useEffect, useState } from 'react';
import {
  Lock,
  Maximize2,
  Menu,
  Minimize2,
  ShieldCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useMonitoring } from '../context/MonitoringContext';
import { DashboardPage } from '../types/sensor';

interface HeaderProps {
  onOpenMobileSidebar: () => void;
}

const PAGE_TITLES: Record<DashboardPage, { title: string; subtitle: string }> = {
  monitoring: {
    title: 'Monitoring Telemetri Real-Time',
    subtitle: 'Prioritas Sensor Gas Metana (MQ-4) & Kualitas Udara (MQ-135)',
  },
  map: {
    title: 'Peta & Status Titik Bawah Tanah',
    subtitle: 'Sebaran Node Terowongan Utilitas (MUT) Kawasan KIPP IKN',
  },
  logs: {
    title: 'Riwayat Peringatan & Log Akses RFID',
    subtitle: 'Audit kejadian gas melewati ambang batas dan akses pintu sektor',
  },
  settings: {
    title: 'Pengaturan Ambang Batas & Sistem MQTT',
    subtitle: 'Konfigurasi batas Waspada/Bahaya dan informasi koneksi broker',
  },
};

export function Header({ onOpenMobileSidebar }: HeaderProps) {
  const {
    activePage,
    connectionState,
    lastUpdatedAt,
    sampleCount,
    isAudioEnabled,
    toggleAudio,
    isOperatorUnlocked,
    lockOperator,
    requestOperatorAction,
  } = useMonitoring();

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

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
      // Ignore if fullscreen API is blocked by browser
    }
  };

  const meta = PAGE_TITLES[activePage];

  const statusConfig =
    connectionState === 'connected'
      ? {
          wrapper: 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]',
          dot: 'bg-[#16A34A]',
          label: `MQTT LIVE | ${lastUpdatedAt}`,
        }
      : connectionState === 'connecting'
        ? {
            wrapper: 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]',
            dot: 'bg-[#D97706]',
            label: 'MENGHUBUNGKAN',
          }
        : {
            wrapper: 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]',
            dot: 'bg-[#B91C1C]',
            label: 'TERPUTUS',
          };

  return (
    <header className="bg-white border-b border-[#E2E5EA] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-1.5 rounded border border-[#E2E5EA] bg-[#F4F5F7] text-[#1E293B] hover:bg-[#E2E5EA]/60 cursor-pointer shrink-0"
          aria-label="Buka menu navigasi"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-semibold tracking-tight text-[#1E293B] truncate">
            {meta.title}
          </h1>
          <p className="text-[11px] text-[#64748B] truncate">
            {meta.subtitle}{' '}
            <span className="font-mono-tabular text-[#64748B]">
              • SAMPEL #{sampleCount}
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono-tabular font-medium ${statusConfig.wrapper}`}
          title="Status koneksi MQTT WebSocket (wss://broker.emqx.io:8084/mqtt)"
        >
          <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
          <span>{statusConfig.label}</span>
        </div>

        {isOperatorUnlocked ? (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#BBF7D0] bg-[#F0FDF4] text-xs font-medium text-[#15803D]">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Mode Operator: Aktif</span>
            <span className="sm:hidden">Operator</span>
            <button
              type="button"
              onClick={lockOperator}
              className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-[#BBF7D0] hover:bg-[#DCFCE7] text-[10px] font-semibold text-[#15803D] cursor-pointer"
              title="Kunci kembali akses operator"
            >
              <Lock className="w-2.5 h-2.5" />
              <span>Kunci</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => requestOperatorAction('unlock-only')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#E2E5EA] bg-white hover:bg-[#F8FAFC] text-xs font-medium text-[#1E293B] transition-colors cursor-pointer"
            title="Buka Mode Operator (PIN: 1234)"
          >
            <Lock className="w-3.5 h-3.5 text-[#64748B]" />
            <span>Mode Operator</span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleAudio}
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
          <span>{isAudioEnabled ? 'Alarm: Aktif' : 'Alarm: Mute'}</span>
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
    </header>
  );
}
