import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_THRESHOLDS,
  MAX_ALERT_LOGS,
  MAX_HISTORY_POINTS,
  POLL_INTERVAL_MS,
  SENSOR_METADATA,
  SENSOR_ORDER,
  evaluateSensorStatus,
  formatTimestamp,
} from '../constants/sensors';
import {
  AlertLogEntry,
  SensorKey,
  SensorReadingValues,
  SensorStatus,
  TelemetryPoint,
  ThresholdMap,
} from '../types/sensor';

interface SimulatorState {
  values: SensorReadingValues;
  tick: number;
  spikeTarget: SensorKey | null;
  spikeTicksRemaining: number;
  spikeLevel: 'warning' | 'danger';
}

const INITIAL_VALUES: SensorReadingValues = {
  mq4: 265,
  mq135: 190,
  temperature: 26.8,
  humidity: 58.4,
};

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Generates an initial buffer of 12 historical points so the chart is immediately
 * populated on load without waiting 20+ seconds.
 */
function buildInitialHistory(): TelemetryPoint[] {
  const now = Date.now();
  const points: TelemetryPoint[] = [];
  let current = { ...INITIAL_VALUES };

  for (let i = 11; i >= 0; i--) {
    const ts = new Date(now - i * POLL_INTERVAL_MS);
    current = {
      mq4: roundTo(clamp(current.mq4 + (Math.random() - 0.48) * 28, 160, 420), 0),
      mq135: roundTo(clamp(current.mq135 + (Math.random() - 0.48) * 20, 120, 310), 0),
      temperature: roundTo(clamp(current.temperature + (Math.random() - 0.5) * 0.6, 24.5, 30.2), 1),
      humidity: roundTo(clamp(current.humidity + (Math.random() - 0.5) * 1.4, 50.0, 68.0), 1),
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
 * Standalone telemetry fetcher.
 * Replace the body of `fetchLatestReading` with a `fetch()` call to an ESP32 REST endpoint,
 * WebSocket message buffer, or MQTT HTTP bridge when integrating physical hardware.
 *
 * Example hardware integration:
 * ```ts
 * const res = await fetch('http://192.168.1.50/api/sensors');
 * const json = await res.json();
 * return {
 *   mq4: Number(json.mq4),
 *   mq135: Number(json.mq135),
 *   temperature: Number(json.temperature),
 *   humidity: Number(json.humidity),
 *   epochMs: Date.now(),
 *   timestamp: formatTimestamp(new Date()),
 * };
 * ```
 */
export async function fetchLatestReading(
  simState: SimulatorState,
  thresholds: ThresholdMap
): Promise<TelemetryPoint> {
  simState.tick += 1;

  // Trigger realistic periodic excursions so warning/danger handling can be observed naturally
  if (simState.spikeTicksRemaining <= 0 && simState.tick % 9 === 0) {
    const candidates: SensorKey[] = ['mq4', 'mq135', 'temperature', 'humidity'];
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    simState.spikeTarget = chosen;
    simState.spikeTicksRemaining = 3 + Math.floor(Math.random() * 2);
    simState.spikeLevel = Math.random() > 0.42 ? 'danger' : 'warning';
  }

  const next: SensorReadingValues = { ...simState.values };
  const baselines: SensorReadingValues = INITIAL_VALUES;

  for (const key of SENSOR_ORDER) {
    const meta = SENSOR_METADATA[key];
    const isTarget = simState.spikeTarget === key && simState.spikeTicksRemaining > 0;

    if (isTarget) {
      const th = thresholds[key];
      const targetPeak =
        simState.spikeLevel === 'danger'
          ? th.danger + (meta.max - th.danger) * 0.22
          : th.warning + (th.danger - th.warning) * 0.55;
      const stepDelta = (targetPeak - next[key]) * 0.65 + (Math.random() - 0.35) * meta.step * 0.4;
      next[key] = roundTo(clamp(next[key] + stepDelta, meta.min, meta.max), meta.decimals);
    } else {
      // Smooth mean-reverting random walk back toward normal baseline
      const pullToBaseline = (baselines[key] - next[key]) * 0.28;
      const jitterScale = key === 'mq4' ? 32 : key === 'mq135' ? 22 : key === 'temperature' ? 0.7 : 1.8;
      const noise = (Math.random() - 0.5) * jitterScale;
      next[key] = roundTo(clamp(next[key] + pullToBaseline + noise, meta.min, meta.max), meta.decimals);
    }
  }

  if (simState.spikeTicksRemaining > 0) {
    simState.spikeTicksRemaining -= 1;
    if (simState.spikeTicksRemaining === 0) {
      simState.spikeTarget = null;
    }
  }

  simState.values = next;
  const now = new Date();

  return {
    ...next,
    epochMs: now.getTime(),
    timestamp: formatTimestamp(now),
  };
}

export interface UseSensorStreamResult {
  latest: TelemetryPoint;
  history: TelemetryPoint[];
  thresholds: ThresholdMap;
  updateThresholds: (next: ThresholdMap) => void;
  resetThresholds: () => void;
  statuses: Record<SensorKey, SensorStatus>;
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
  const initialHistory = useMemo(() => buildInitialHistory(), []);
  const [history, setHistory] = useState<TelemetryPoint[]>(initialHistory);
  const [thresholds, setThresholds] = useState<ThresholdMap>(DEFAULT_THRESHOLDS);
  const [alertLogs, setAlertLogs] = useState<AlertLogEntry[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [sampleCount, setSampleCount] = useState<number>(initialHistory.length);

  const thresholdsRef = useRef<ThresholdMap>(thresholds);
  thresholdsRef.current = thresholds;

  const onAlertStatusRef = useRef(onAlertStatus);
  onAlertStatusRef.current = onAlertStatus;

  const simRef = useRef<SimulatorState>({
    values: {
      mq4: initialHistory[initialHistory.length - 1].mq4,
      mq135: initialHistory[initialHistory.length - 1].mq135,
      temperature: initialHistory[initialHistory.length - 1].temperature,
      humidity: initialHistory[initialHistory.length - 1].humidity,
    },
    tick: 0,
    spikeTarget: null,
    spikeTicksRemaining: 0,
    spikeLevel: 'warning',
  });

  const prevStatusRef = useRef<Record<SensorKey, SensorStatus>>({
    mq4: 'normal',
    mq135: 'normal',
    temperature: 'normal',
    humidity: 'normal',
  });

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const point = await fetchLatestReading(simRef.current, thresholdsRef.current);
        if (cancelled) return;

        setIsConnected(true);
        setSampleCount((c) => c + 1);
        setHistory((prev) => [...prev.slice(-(MAX_HISTORY_POINTS - 1)), point]);

        const newEntries: AlertLogEntry[] = [];
        let highestStatus: SensorStatus = 'normal';

        for (const key of SENSOR_ORDER) {
          const val = point[key];
          const th = thresholdsRef.current[key];
          const status = evaluateSensorStatus(val, th);

          if (status === 'danger') {
            highestStatus = 'danger';
          } else if (status === 'warning' && highestStatus !== 'danger') {
            highestStatus = 'warning';
          }

          // Log when entering warning/danger or escalating from warning to danger
          const prevStatus = prevStatusRef.current[key];
          const shouldLog =
            status !== 'normal' &&
            (prevStatus !== status || status === 'danger');

          if (shouldLog) {
            const meta = SENSOR_METADATA[key];
            newEntries.push({
              id: `${point.epochMs}-${key}-${Math.random().toString(36).slice(2, 6)}`,
              timestamp: point.timestamp,
              sensorKey: key,
              sensorName: meta.label,
              value: val,
              unit: meta.unit,
              thresholdValue: status === 'danger' ? th.danger : th.warning,
              status,
            });
          }

          prevStatusRef.current[key] = status;
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

  const latest = history[history.length - 1];

  const statuses = useMemo<Record<SensorKey, SensorStatus>>(() => {
    return {
      mq4: evaluateSensorStatus(latest.mq4, thresholds.mq4),
      mq135: evaluateSensorStatus(latest.mq135, thresholds.mq135),
      temperature: evaluateSensorStatus(latest.temperature, thresholds.temperature),
      humidity: evaluateSensorStatus(latest.humidity, thresholds.humidity),
    };
  }, [latest, thresholds]);

  const overallStatus = useMemo<SensorStatus>(() => {
    const values = Object.values(statuses);
    if (values.includes('danger')) return 'danger';
    if (values.includes('warning')) return 'warning';
    return 'normal';
  }, [statuses]);

  const updateThresholds = useCallback((next: ThresholdMap) => {
    setThresholds(next);
  }, []);

  const resetThresholds = useCallback(() => {
    setThresholds(DEFAULT_THRESHOLDS);
  }, []);

  const clearAlertLogs = useCallback(() => {
    setAlertLogs([]);
  }, []);

  return {
    latest,
    history,
    thresholds,
    updateThresholds,
    resetThresholds,
    statuses,
    overallStatus,
    alertLogs,
    clearAlertLogs,
    isConnected,
    lastUpdatedAt: latest.timestamp,
    sampleCount,
  };
}
