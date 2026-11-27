import { useState } from 'react';
import { AlertBanner } from './components/AlertBanner';
import { AlertLog } from './components/AlertLog';
import { Dht11Card } from './components/Dht11Card';
import { Header } from './components/Header';
import { SensorCard } from './components/SensorCard';
import { TelemetryChart } from './components/TelemetryChart';
import { ThresholdModal } from './components/ThresholdModal';
import { SENSOR_METADATA } from './constants/sensors';
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
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.8fr_1.8fr_1.4fr] gap-3 shrink-0"
      >
        <SensorCard
          meta={SENSOR_METADATA.mq4}
          value={latest.mq4}
          threshold={thresholds.mq4}
          status={statuses.mq4}
        />
        <SensorCard
          meta={SENSOR_METADATA.mq135}
          value={latest.mq135}
          threshold={thresholds.mq135}
          status={statuses.mq135}
        />
        <Dht11Card
          temperature={latest.temperature}
          humidity={latest.humidity}
          tempThreshold={thresholds.temperature}
          humidityThreshold={thresholds.humidity}
          tempStatus={statuses.temperature}
          humidityStatus={statuses.humidity}
        />
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
