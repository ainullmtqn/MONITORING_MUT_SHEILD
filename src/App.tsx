import { useState } from 'react';
import { AlertBanner } from './components/AlertBanner';
import { AlertLog } from './components/AlertLog';
import { Header } from './components/Header';
import { SensorCard } from './components/SensorCard';
import { TelemetryChart } from './components/TelemetryChart';
import { ThresholdModal } from './components/ThresholdModal';
import { SENSOR_METADATA, SENSOR_ORDER } from './constants/sensors';
import { useAlertAudio } from './hooks/useAlertAudio';
import { useSensorStream } from './hooks/useSensorStream';

export function App() {
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
  const { isAudioEnabled, toggleAudio, triggerAlarmTone } = useAlertAudio();

  const {
    latest,
    history,
    thresholds,
    updateThresholds,
    statuses,
    overallStatus,
    alertLogs,
    clearAlertLogs,
    isConnected,
    lastUpdatedAt,
    sampleCount,
  } = useSensorStream(triggerAlarmTone);

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#F4F5F7] text-[#1E293B] p-3 lg:p-4 flex flex-col gap-3">
      <Header
        isConnected={isConnected}
        lastUpdatedAt={lastUpdatedAt}
        sampleCount={sampleCount}
        isAudioEnabled={isAudioEnabled}
        onToggleAudio={toggleAudio}
        onOpenThresholdModal={() => setIsThresholdModalOpen(true)}
      />

      <AlertBanner
        latest={latest}
        statuses={statuses}
        overallStatus={overallStatus}
      />

      <section
        aria-label="Ringkasan nilai sensor real-time"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1fr] gap-3 shrink-0"
      >
        {SENSOR_ORDER.map((key) => (
          <SensorCard
            key={key}
            meta={SENSOR_METADATA[key]}
            value={latest[key]}
            threshold={thresholds[key]}
            status={statuses[key]}
            variant={key === 'mq4' || key === 'mq135' ? 'primary' : 'compact'}
          />
        ))}
      </section>

      <section
        aria-label="Grafik telemetri dan riwayat peringatan"
        className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[65fr_35fr] gap-3"
      >
        <div className="min-h-0 h-full">
          <TelemetryChart history={history} />
        </div>
        <div className="min-h-0 h-full">
          <AlertLog logs={alertLogs} onClearLogs={clearAlertLogs} />
        </div>
      </section>

      <ThresholdModal
        isOpen={isThresholdModalOpen}
        thresholds={thresholds}
        onClose={() => setIsThresholdModalOpen(false)}
        onSave={updateThresholds}
      />
    </div>
  );
}

export default App;
