import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_THRESHOLDS,
  MAX_ALERT_LOGS,
  MAX_HISTORY_POINTS,
  POLL_INTERVAL_MS,
  SENSOR_METADATA,
  SENSOR_NODES,
  SENSOR_ORDER,
  STATUS_PRIORITY,
  evaluateSensorStatus,
  formatTimestamp,
  getHighestStatus,
} from '../constants/sensors';
import {
  AlertLogEntry,
  PeakReadingsMap,
  SensorKey,
  SensorNodeConfig,
  SensorNodeState,
  SensorReadingValues,
  SensorStatus,
  TelemetryPoint,
  ThresholdMap,
} from '../types/sensor';

interface NodeSimulatorState {
  values: SensorReadingValues;
  spikeSensor: SensorKey | null;
  spikeTicksRemaining: number;
  spikeLevel: 'warning' | 'danger';
}

interface MultiNodeSimulator {
  tick: number;
  byNode: Record<string, NodeSimulatorState>;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function buildInitialNodeHistory(node: SensorNodeConfig): TelemetryPoint[] {
  const now = Date.now();
  const points: TelemetryPoint[] = [];
  let current = { ...node.baseline };

  for (let i = 11; i >= 0; i--) {
    const ts = new Date(now - i * POLL_INTERVAL_MS);
    current = {
      mq4: roundTo(clamp(current.mq4 + (Math.random() - 0.48) * 28, 120, 440), 0),
      mq135: roundTo(clamp(current.mq135 + (Math.random() - 0.48) * 18, 100, 310), 0),
      temperature: roundTo(
        clamp(current.temperature + (Math.random() - 0.5) * 0.5, 23.5, 30.8),
        1
      ),
      humidity: roundTo(
        clamp(current.humidity + (Math.random() - 0.5) * 1.3, 46.0, 69.0),
        1
      ),
    };
    points.push({
      ...current,
      epochMs: ts.getTime(),
      timestamp: formatTimestamp(ts),
    });
  }

  return points;
}

/**
 * Standalone multi-node telemetry fetcher.
 * Replace the body of `fetchLatestNodeReadings` with a `fetch()` call to an
 * ESP32 gateway REST API, WebSocket state snapshot, or MQTT HTTP bridge when
 * connecting physical sensor nodes.
 */
export async function fetchLatestNodeReadings(
  sim: MultiNodeSimulator,
  nodes: SensorNodeConfig[],
  thresholds: ThresholdMap
): Promise<Record<string, TelemetryPoint>> {
  sim.tick += 1;

  // Periodically inject an excursion on one node (prioritizing MQ-4/MQ-135)
  // so multi-node worst-case tracking and auto-sorting can be observed naturally.
  if (sim.tick % 5 === 0) {
    const activeSpikes = nodes.filter(
      (n) => sim.byNode[n.id].spikeTicksRemaining > 0
    );
    if (activeSpikes.length < 2) {
      const targetNode = nodes[Math.floor(Math.random() * nodes.length)];
      const nodeSim = sim.byNode[targetNode.id];
      if (nodeSim.spikeTicksRemaining <= 0) {
        const weightedSensors: SensorKey[] = [
          'mq4',
          'mq4',
          'mq135',
          'mq135',
          'temperature',
          'humidity',
        ];
        nodeSim.spikeSensor =
          weightedSensors[Math.floor(Math.random() * weightedSensors.length)];
        nodeSim.spikeTicksRemaining = 3 + Math.floor(Math.random() * 3);
        nodeSim.spikeLevel = Math.random() > 0.48 ? 'danger' : 'warning';
      }
    }
  }

  const now = new Date();
  const timestamp = formatTimestamp(now);
  const epochMs = now.getTime();
  const readings: Record<string, TelemetryPoint> = {};

  for (const node of nodes) {
    const nodeSim = sim.byNode[node.id];
    const next: SensorReadingValues = { ...nodeSim.values };

    for (const key of SENSOR_ORDER) {
      const meta = SENSOR_METADATA[key];
      const isSpike =
        nodeSim.spikeSensor === key && nodeSim.spikeTicksRemaining > 0;

      if (isSpike) {
        const th = thresholds[key];
        const targetPeak =
          nodeSim.spikeLevel === 'danger'
            ? th.danger + (meta.max - th.danger) * 0.24
            : th.warning + (th.danger - th.warning) * 0.55;
        const delta =
          (targetPeak - next[key]) * 0.62 +
          (Math.random() - 0.35) * meta.step * 0.4;
        next[key] = roundTo(clamp(next[key] + delta, meta.min, meta.max), meta.decimals);
      } else {
        const pull = (node.baseline[key] - next[key]) * 0.28;
        const jitterScale =
          key === 'mq4'
            ? 30
            : key === 'mq135'
              ? 20
              : key === 'temperature'
                ? 0.6
                : 1.6;
        const noise = (Math.random() - 0.5) * jitterScale;
        next[key] = roundTo(clamp(next[key] + pull + noise, meta.min, meta.max), meta.decimals);
      }
    }

    if (nodeSim.spikeTicksRemaining > 0) {
      nodeSim.spikeTicksRemaining -= 1;
      if (nodeSim.spikeTicksRemaining === 0) {
        nodeSim.spikeSensor = null;
      }
    }

    nodeSim.values = next;
    readings[node.id] = {
      ...next,
      epochMs,
      timestamp,
    };
  }

  return readings;
}

function buildPeakHistory(
  historiesByNode: Record<string, TelemetryPoint[]>,
  nodes: SensorNodeConfig[]
): TelemetryPoint[] {
  const sampleLen = historiesByNode[nodes[0].id]?.length ?? 0;
  const peakPoints: TelemetryPoint[] = [];

  for (let i = 0; i < sampleLen; i++) {
    const first = historiesByNode[nodes[0].id][i];
    const peakPoint: TelemetryPoint = {
      mq4: first.mq4,
      mq135: first.mq135,
      temperature: first.temperature,
      humidity: first.humidity,
      timestamp: first.timestamp,
      epochMs: first.epochMs,
      mq4Source: nodes[0].name,
      mq135Source: nodes[0].name,
      temperatureSource: nodes[0].name,
      humiditySource: nodes[0].name,
    };

    for (let nIdx = 1; nIdx < nodes.length; nIdx++) {
      const node = nodes[nIdx];
      const pt = historiesByNode[node.id][i];
      if (!pt) continue;

      if (pt.mq4 > peakPoint.mq4) {
        peakPoint.mq4 = pt.mq4;
        peakPoint.mq4Source = node.name;
      }
      if (pt.mq135 > peakPoint.mq135) {
        peakPoint.mq135 = pt.mq135;
        peakPoint.mq135Source = node.name;
      }
      if (pt.temperature > peakPoint.temperature) {
        peakPoint.temperature = pt.temperature;
        peakPoint.temperatureSource = node.name;
      }
      if (pt.humidity > peakPoint.humidity) {
        peakPoint.humidity = pt.humidity;
        peakPoint.humiditySource = node.name;
      }
    }

    peakPoints.push(peakPoint);
  }

  return peakPoints;
}

export interface UseSensorStreamResult {
  nodes: SensorNodeState[];
  sortedNodes: SensorNodeState[];
  peakReadings: PeakReadingsMap;
  peakHistory: TelemetryPoint[];
  thresholds: ThresholdMap;
  updateThresholds: (next: ThresholdMap) => void;
  resetThresholds: () => void;
  overallStatus: SensorStatus;
  alertLogs: AlertLogEntry[];
  clearAlertLogs: () => void;
  isConnected: boolean;
  lastUpdatedAt: string;
  sampleCount: number;
}

export function useSensorStream(
  onAlertStatus?: (status: SensorStatus) => void
): UseSensorStreamResult {
  const initialHistories = useMemo(() => {
    const map: Record<string, TelemetryPoint[]> = {};
    for (const node of SENSOR_NODES) {
      map[node.id] = buildInitialNodeHistory(node);
    }
    return map;
  }, []);

  const [historiesByNode, setHistoriesByNode] =
    useState<Record<string, TelemetryPoint[]>>(initialHistories);
  const [thresholds, setThresholds] = useState<ThresholdMap>(DEFAULT_THRESHOLDS);
  const [alertLogs, setAlertLogs] = useState<AlertLogEntry[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [sampleCount, setSampleCount] = useState<number>(
    initialHistories[SENSOR_NODES[0].id].length
  );

  const thresholdsRef = useRef<ThresholdMap>(thresholds);
  thresholdsRef.current = thresholds;

  const onAlertStatusRef = useRef(onAlertStatus);
  onAlertStatusRef.current = onAlertStatus;

  const simRef = useRef<MultiNodeSimulator>({
    tick: 0,
    byNode: Object.fromEntries(
      SENSOR_NODES.map((node) => {
        const hist = initialHistories[node.id];
        const last = hist[hist.length - 1];
        return [
          node.id,
          {
            values: {
              mq4: last.mq4,
              mq135: last.mq135,
              temperature: last.temperature,
              humidity: last.humidity,
            },
            spikeSensor: null,
            spikeTicksRemaining: 0,
            spikeLevel: 'warning' as const,
          },
        ];
      })
    ),
  });

  const prevStatusRef = useRef<Record<string, Record<SensorKey, SensorStatus>>>(
    Object.fromEntries(
      SENSOR_NODES.map((node) => [
        node.id,
        { mq4: 'normal', mq135: 'normal', temperature: 'normal', humidity: 'normal' },
      ])
    )
  );

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const readings = await fetchLatestNodeReadings(
          simRef.current,
          SENSOR_NODES,
          thresholdsRef.current
        );
        if (cancelled) return;

        setIsConnected(true);
        setSampleCount((c) => c + 1);
        setHistoriesByNode((prev) => {
          const updated: Record<string, TelemetryPoint[]> = {};
          for (const node of SENSOR_NODES) {
            const point = readings[node.id];
            updated[node.id] = [
              ...(prev[node.id] ?? []).slice(-(MAX_HISTORY_POINTS - 1)),
              point,
            ];
          }
          return updated;
        });

        const newEntries: AlertLogEntry[] = [];
        let highestStatus: SensorStatus = 'normal';

        for (const node of SENSOR_NODES) {
          const point = readings[node.id];
          for (const key of SENSOR_ORDER) {
            const val = point[key];
            const th = thresholdsRef.current[key];
            const status = evaluateSensorStatus(val, th);

            if (STATUS_PRIORITY[status] > STATUS_PRIORITY[highestStatus]) {
              highestStatus = status;
            }

            const prevStatus = prevStatusRef.current[node.id][key];
            const shouldLog =
              status !== 'normal' &&
              (prevStatus !== status || status === 'danger');

            if (shouldLog) {
              const meta = SENSOR_METADATA[key];
              newEntries.push({
                id: `${point.epochMs}-${node.id}-${key}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp: point.timestamp,
                nodeId: node.id,
                nodeName: node.name,
                sensorKey: key,
                sensorName: meta.label,
                value: val,
                unit: meta.unit,
                thresholdValue: status === 'danger' ? th.danger : th.warning,
                status,
              });
            }

            prevStatusRef.current[node.id][key] = status;
          }
        }

        if (newEntries.length > 0) {
          setAlertLogs((prev) => [...newEntries, ...prev].slice(0, MAX_ALERT_LOGS));
        }

        if (highestStatus !== 'normal') {
          onAlertStatusRef.current?.(highestStatus);
        }
      } catch {
        if (!cancelled) {
          setIsConnected(false);
        }
      }
    };

    const intervalId = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const nodes = useMemo<SensorNodeState[]>(() => {
    return SENSOR_NODES.map((config) => {
      const history = historiesByNode[config.id] ?? [];
      const latest = history[history.length - 1];
      const statuses: Record<SensorKey, SensorStatus> = {
        mq4: evaluateSensorStatus(latest.mq4, thresholds.mq4),
        mq135: evaluateSensorStatus(latest.mq135, thresholds.mq135),
        temperature: evaluateSensorStatus(latest.temperature, thresholds.temperature),
        humidity: evaluateSensorStatus(latest.humidity, thresholds.humidity),
      };
      return {
        config,
        latest,
        history,
        statuses,
        overallStatus: getHighestStatus(Object.values(statuses)),
      };
    });
  }, [historiesByNode, thresholds]);

  const sortedNodes = useMemo<SensorNodeState[]>(() => {
    return [...nodes].sort((a, b) => {
      const priorityDiff =
        STATUS_PRIORITY[b.overallStatus] - STATUS_PRIORITY[a.overallStatus];
      if (priorityDiff !== 0) return priorityDiff;
      const mq4Diff = b.latest.mq4 - a.latest.mq4;
      if (mq4Diff !== 0) return mq4Diff;
      return b.latest.mq135 - a.latest.mq135;
    });
  }, [nodes]);

  const peakReadings = useMemo<PeakReadingsMap>(() => {
    const result = {} as PeakReadingsMap;
    for (const key of SENSOR_ORDER) {
      let bestNode = nodes[0];
      for (let i = 1; i < nodes.length; i++) {
        if (nodes[i].latest[key] > bestNode.latest[key]) {
          bestNode = nodes[i];
        }
      }
      result[key] = {
        value: bestNode.latest[key],
        status: bestNode.statuses[key],
        sourceNodeId: bestNode.config.id,
        sourceNodeName: bestNode.config.name,
        sourceShortName: bestNode.config.shortName,
      };
    }
    return result;
  }, [nodes]);

  const peakHistory = useMemo<TelemetryPoint[]>(() => {
    return buildPeakHistory(historiesByNode, SENSOR_NODES);
  }, [historiesByNode]);

  const overallStatus = useMemo<SensorStatus>(() => {
    return getHighestStatus(nodes.map((n) => n.overallStatus));
  }, [nodes]);

  const updateThresholds = useCallback((next: ThresholdMap) => {
    setThresholds(next);
  }, []);

  const resetThresholds = useCallback(() => {
    setThresholds(DEFAULT_THRESHOLDS);
  }, []);

  const clearAlertLogs = useCallback(() => {
    setAlertLogs([]);
  }, []);

  const lastUpdatedAt = nodes[0]?.latest.timestamp ?? '--:--:--';

  return {
    nodes,
    sortedNodes,
    peakReadings,
    peakHistory,
    thresholds,
    updateThresholds,
    resetThresholds,
    overallStatus,
    alertLogs,
    clearAlertLogs,
    isConnected,
    lastUpdatedAt,
    sampleCount,
  };
}
