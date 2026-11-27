import { useState } from 'react';
import { AlertBanner } from './components/AlertBanner';
import { AlertLog } from './components/AlertLog';
import { Dht11Card } from './components/Dht11Card';
import { Header } from './components/Header';
import { NodeStatusPanel } from './components/NodeStatusPanel';
import { SensorCard } from './components/SensorCard';
import { TelemetryChart } from './components/TelemetryChart';
import { ThresholdModal } from './components/ThresholdModal';
import {
  SENSOR_METADATA,
  SENSOR_NODES,
  formatNodeLocation,
} from './constants/sensors';
import { useAlertAudio } from './hooks/useAlertAudio';
import { useSensorStream } from './hooks/useSensorStream';
import { SensorNodeConfig } from './types/sensor';

function formatPeakSource(node: SensorNodeConfig): string {
  return `Tertinggi: ${node.code} (${formatNodeLocation(node)})`;
}

function formatActiveSource(node: SensorNodeConfig): string {
  return `Aktif: ${node.code} (${formatNodeLocation(node)})`;
}

export function App() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('all');
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
  const { isAudioEnabled, toggleAudio, triggerAlarmTone } = useAlertAudio();

  const {
    nodes,
    sortedNodes,
    peakReadings,
    peakHistory,
    thresholds,
    updateThresholds,
    overallStatus,
    alertLogs,
    clearAlertLogs,
    isConnected,
    lastUpdatedAt,
    sampleCount,
  } = useSensorStream(triggerAlarmTone);

  const isAllNodesMode = selectedNodeId === 'all';
  const activeNode = isAllNodesMode
    ? null
    : nodes.find((n) => n.config.id === selectedNodeId) ?? null;

  const mq4Display = activeNode
    ? {
        value: activeNode.latest.mq4,
        status: activeNode.statuses.mq4,
        sourceLabel: formatActiveSource(activeNode.config),
      }
    : {
        value: peakReadings.mq4.value,
        status: peakReadings.mq4.status,
        sourceLabel: formatPeakSource(peakReadings.mq4.sourceNode),
      };

  const mq135Display = activeNode
    ? {
        value: activeNode.latest.mq135,
        status: activeNode.statuses.mq135,
        sourceLabel: formatActiveSource(activeNode.config),
      }
    : {
        value: peakReadings.mq135.value,
        status: peakReadings.mq135.status,
        sourceLabel: formatPeakSource(peakReadings.mq135.sourceNode),
      };

  const tempDisplay = activeNode
    ? {
        value: activeNode.latest.temperature,
        status: activeNode.statuses.temperature,
        sourceLabel: activeNode.config.code,
      }
    : {
        value: peakReadings.temperature.value,
        status: peakReadings.temperature.status,
        sourceLabel: `Max: ${peakReadings.temperature.sourceNode.code}`,
      };

  const humidityDisplay = activeNode
    ? {
        value: activeNode.latest.humidity,
        status: activeNode.statuses.humidity,
        sourceLabel: activeNode.config.code,
      }
    : {
        value: peakReadings.humidity.value,
        status: peakReadings.humidity.status,
        sourceLabel: `Max: ${peakReadings.humidity.sourceNode.code}`,
      };

  const chartHistory = activeNode ? activeNode.history : peakHistory;
  const activeNodeLabel = activeNode
    ? `${activeNode.config.code} | ${activeNode.config.name}`
    : `Semua Titik (${nodes.length} Node MUT — Nilai Puncak)`;
  const activeNodeLocation = activeNode
    ? formatNodeLocation(activeNode.config)
    : 'KIPP IKN • Nilai tertinggi lintas semua titik bawah tanah';

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#F4F5F7] text-[#1E293B] p-3 lg:p-4 flex flex-col gap-3">
      <Header
        nodes={SENSOR_NODES}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        isConnected={isConnected}
        lastUpdatedAt={lastUpdatedAt}
        sampleCount={sampleCount}
        isAudioEnabled={isAudioEnabled}
        onToggleAudio={toggleAudio}
        onOpenThresholdModal={() => setIsThresholdModalOpen(true)}
      />

      <AlertBanner nodes={nodes} overallStatus={overallStatus} />

      <section
        aria-label="Ringkasan nilai sensor real-time"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[35fr_35fr_30fr] gap-3 shrink-0"
      >
        <SensorCard
          meta={SENSOR_METADATA.mq4}
          value={mq4Display.value}
          threshold={thresholds.mq4}
          status={mq4Display.status}
          sourceLabel={mq4Display.sourceLabel}
        />
        <SensorCard
          meta={SENSOR_METADATA.mq135}
          value={mq135Display.value}
          threshold={thresholds.mq135}
          status={mq135Display.status}
          sourceLabel={mq135Display.sourceLabel}
        />
        <Dht11Card
          temperature={tempDisplay.value}
          humidity={humidityDisplay.value}
          tempThreshold={thresholds.temperature}
          humidityThreshold={thresholds.humidity}
          tempStatus={tempDisplay.status}
          humidityStatus={humidityDisplay.status}
          tempSourceLabel={tempDisplay.sourceLabel}
          humiditySourceLabel={humidityDisplay.sourceLabel}
        />
      </section>

      <section
        aria-label="Grafik telemetri, status titik bawah tanah, dan riwayat peringatan"
        className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[65fr_35fr] gap-3"
      >
        <div className="min-h-0 h-full">
          <TelemetryChart
            history={chartHistory}
            activeNodeLabel={activeNodeLabel}
            activeNodeLocation={activeNodeLocation}
            isAllNodesMode={isAllNodesMode}
          />
        </div>

        <div className="min-h-0 h-full flex flex-col gap-3">
          <NodeStatusPanel
            sortedNodes={sortedNodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
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
