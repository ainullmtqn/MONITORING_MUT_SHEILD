import { MapPin } from 'lucide-react';
import { Dht11Card } from '../components/Dht11Card';
import { DoorBadge } from '../components/DoorBadge';
import { SensorCard } from '../components/SensorCard';
import { TelemetryChart } from '../components/TelemetryChart';
import {
  SENSOR_METADATA,
  SENSOR_NODES,
  formatCoordinates,
  formatNodeLocation,
  formatOfflineDuration,
} from '../constants/sensors';
import { useMonitoring } from '../context/MonitoringContext';
import { SensorNodeConfig } from '../types/sensor';

function formatPeakSource(node: SensorNodeConfig, onlineCount: number): string {
  if (onlineCount === 0) return 'Menunggu sinyal node online';
  return `Tertinggi: ${node.code} (${formatNodeLocation(node)})`;
}

function formatActiveSource(node: SensorNodeConfig, isOnline: boolean): string {
  const prefix = isOnline ? 'Aktif' : 'Terakhir';
  return `${prefix}: ${node.code} (${formatNodeLocation(node)})`;
}

export function MonitoringPage() {
  const {
    nodes,
    onlineNodeCount,
    selectedNodeId,
    setSelectedNodeId,
    peakReadings,
    peakHistory,
    thresholds,
  } = useMonitoring();

  const isAllNodesMode = selectedNodeId === 'all';
  const activeNode = isAllNodesMode
    ? null
    : nodes.find((n) => n.config.id === selectedNodeId) ?? null;

  const mq4Display = activeNode
    ? {
        value: activeNode.latest.mq4,
        status: activeNode.statuses.mq4,
        sourceLabel: formatActiveSource(activeNode.config, activeNode.isOnline),
      }
    : {
        value: peakReadings.mq4.value,
        status: peakReadings.mq4.status,
        sourceLabel: formatPeakSource(peakReadings.mq4.sourceNode, onlineNodeCount),
      };

  const mq135Display = activeNode
    ? {
        value: activeNode.latest.mq135,
        status: activeNode.statuses.mq135,
        sourceLabel: formatActiveSource(activeNode.config, activeNode.isOnline),
      }
    : {
        value: peakReadings.mq135.value,
        status: peakReadings.mq135.status,
        sourceLabel: formatPeakSource(peakReadings.mq135.sourceNode, onlineNodeCount),
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
        sourceLabel:
          onlineNodeCount > 0 ? `Max: ${peakReadings.temperature.sourceNode.code}` : '--',
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
        sourceLabel:
          onlineNodeCount > 0 ? `Max: ${peakReadings.humidity.sourceNode.code}` : '--',
      };

  const chartHistory = activeNode ? activeNode.history : peakHistory;
  const activeNodeLabel = activeNode
    ? `${activeNode.config.code} | ${activeNode.config.name}`
    : `Semua Titik (${onlineNodeCount}/${nodes.length} Online — Nilai Puncak)`;
  const activeNodeLocation = activeNode
    ? formatNodeLocation(activeNode.config)
    : 'KIPP IKN • Nilai tertinggi lintas titik bawah tanah online';

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5">
      {/* Node Selector Bar */}
      <div className="bg-white border border-[#E2E5EA] rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#E2E5EA] bg-[#F4F5F7]/70 text-xs text-[#1E293B]">
            <MapPin className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
            <span className="text-[#64748B] font-medium">Titik Pantau:</span>
            <select
              value={selectedNodeId}
              onChange={(e) => setSelectedNodeId(e.target.value)}
              className="bg-transparent font-semibold text-[#1E293B] focus:outline-none cursor-pointer pr-1"
              aria-label="Pemilih titik sensor"
            >
              <option value="all">Semua Titik (Nilai Puncak)</option>
              {SENSOR_NODES.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.code} | {node.name}
                </option>
              ))}
            </select>
          </label>

          {activeNode && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono-tabular text-[#64748B]">
              <span>
                Koordinat:{' '}
                <strong className="text-[#1E293B]">
                  {formatCoordinates(activeNode.config)}
                </strong>
              </span>
              <span>
                Kedalaman:{' '}
                <strong className="text-[#1E293B]">{activeNode.config.depth}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span>Pintu:</span>
                <DoorBadge door={activeNode.door} />
              </span>
              {!activeNode.isOnline && (
                <span className="px-1.5 py-0.5 rounded border border-[#CBD5E1] bg-[#E2E5EA] text-[#334155] font-semibold">
                  {formatOfflineDuration(activeNode.secondsSinceUpdate)}
                </span>
              )}
            </div>
          )}
        </div>

        {activeNode ? (
          <button
            type="button"
            onClick={() => setSelectedNodeId('all')}
            className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
          >
            Kembali ke Semua Titik
          </button>
        ) : (
          <span className="text-[11px] font-mono-tabular text-[#64748B]">
            MODE WORST-CASE • MENAMPILKAN NILAI TERTINGGI DARI {onlineNodeCount} NODE ONLINE
          </span>
        )}
      </div>

      {/* Asymmetric Priority Sensor Cards */}
      <section
        aria-label="Ringkasan nilai sensor real-time"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[35fr_35fr_30fr] gap-2.5 shrink-0"
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

      {/* Full-Width Telemetry Chart */}
      <div className="flex-1 min-h-[280px] lg:min-h-0">
        <TelemetryChart
          history={chartHistory}
          activeNodeLabel={activeNodeLabel}
          activeNodeLocation={activeNodeLocation}
          isAllNodesMode={isAllNodesMode}
        />
      </div>
    </div>
  );
}
