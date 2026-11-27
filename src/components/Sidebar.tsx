import {
  Activity,
  ClipboardList,
  MapPin,
  Radio,
  Settings,
  X,
} from 'lucide-react';
import { useMonitoring } from '../context/MonitoringContext';
import { DashboardPage } from '../types/sensor';

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: DashboardPage;
  label: string;
  Icon: typeof Activity;
}> = [
  { id: 'monitoring', label: 'Monitoring', Icon: Activity },
  { id: 'map', label: 'Peta & Titik', Icon: MapPin },
  { id: 'logs', label: 'Riwayat & Log', Icon: ClipboardList },
  { id: 'settings', label: 'Pengaturan', Icon: Settings },
];

export function Sidebar({ isMobileOpen, onCloseMobile }: SidebarProps) {
  const {
    activePage,
    setActivePage,
    unreadAlertCount,
    onlineNodeCount,
    nodes,
    connectionState,
  } = useMonitoring();

  const handleSelectPage = (page: DashboardPage) => {
    setActivePage(page);
    onCloseMobile();
  };

  const navContent = (
    <div className="h-full flex flex-col bg-white border-r border-[#E2E5EA] w-60 select-none">
      <div className="px-4 py-3.5 border-b border-[#E2E5EA] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded bg-[#1E293B] text-white flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-[#1E293B] truncate">
              MUT-IKN Monitor
            </div>
            <div className="text-[10px] font-mono-tabular text-[#64748B] truncate">
              SCADA • KIPP SUBSURFACE
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1 rounded border border-transparent hover:border-[#E2E5EA] text-[#64748B] hover:text-[#1E293B] cursor-pointer"
          aria-label="Tutup menu sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 p-2.5 space-y-1" aria-label="Navigasi utama">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activePage === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleSelectPage(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#1E293B] text-white'
                  : 'text-[#64748B] hover:bg-[#F4F5F7] hover:text-[#1E293B]'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
              </span>

              {id === 'logs' && unreadAlertCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-semibold ${
                    isActive
                      ? 'bg-[#B91C1C] text-white'
                      : 'bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]'
                  }`}
                >
                  {unreadAlertCount > 99 ? '99+' : unreadAlertCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#E2E5EA] bg-[#F4F5F7]/60 space-y-1.5 text-[11px] font-mono-tabular">
        <div className="flex items-center justify-between text-[#64748B]">
          <span>Topik MQTT</span>
          <span className="text-[#1E293B] font-semibold">ikn/mut/+</span>
        </div>
        <div className="flex items-center justify-between text-[#64748B]">
          <span>Node Online</span>
          <span className="text-[#1E293B] font-semibold">
            {onlineNodeCount}/{nodes.length}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#64748B]">
          <span>Stream</span>
          <span
            className={
              connectionState === 'connected'
                ? 'text-[#15803D] font-semibold'
                : connectionState === 'connecting'
                  ? 'text-[#B45309] font-semibold'
                  : 'text-[#B91C1C] font-semibold'
            }
          >
            {connectionState === 'connected'
              ? 'TERHUBUNG'
              : connectionState === 'connecting'
                ? 'KONEKSI...'
                : 'OFFLINE'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:block shrink-0 h-full">{navContent}</aside>

      {/* Mobile collapsible drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/35"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
