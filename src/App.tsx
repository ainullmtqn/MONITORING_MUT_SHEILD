import { useState } from 'react';
import { AlertBanner } from './components/AlertBanner';
import { Header } from './components/Header';
import { RfidToastContainer } from './components/RfidToastContainer';
import { Sidebar } from './components/Sidebar';
import { MonitoringProvider, useMonitoring } from './context/MonitoringContext';
import { LogsPage } from './pages/LogsPage';
import { MapAndNodesPage } from './pages/MapAndNodesPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { SettingsPage } from './pages/SettingsPage';

function DashboardShell() {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const {
    activePage,
    nodes,
    overallStatus,
    isAlarmAcknowledged,
    acknowledgeAlarm,
    toasts,
    dismissToast,
  } = useMonitoring();

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#F4F5F7] text-[#1E293B] flex">
      <RfidToastContainer toasts={toasts} onDismiss={dismissToast} />

      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <Header onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)} />

        <AlertBanner
          nodes={nodes}
          overallStatus={overallStatus}
          isAlarmAcknowledged={isAlarmAcknowledged}
          onAcknowledgeAlarm={acknowledgeAlarm}
        />

        <main className="flex-1 min-h-0 p-3 lg:p-4 flex flex-col overflow-y-auto lg:overflow-hidden">
          {activePage === 'monitoring' && <MonitoringPage />}
          {activePage === 'map' && <MapAndNodesPage />}
          {activePage === 'logs' && <LogsPage />}
          {activePage === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <MonitoringProvider>
      <DashboardShell />
    </MonitoringProvider>
  );
}

export default App;
