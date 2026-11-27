import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import {
  DEFAULT_THRESHOLDS,
  MAX_ALERT_LOGS,
  MAX_HISTORY_POINTS,
  MQTT_BROKER_URL,
  MQTT_TOPIC,
  SENSOR_METADATA,
  SENSOR_NODES,
  SENSOR_ORDER,
  STATUS_PRIORITY,
  evaluateSensorStatus,
  formatNodeLocationTag,
  formatTimestamp,
  getHighestStatus,
} from '../constants/sensors';
import {
  AlertLogEntry,
  DoorStatus,
  MqttSensorPayload,
  PeakReadingsMap,
  RfidAccessLogEntry,
  RfidToastNotification,
  SensorKey,
  SensorNodeConfig,
  SensorNodeState,
  SensorStatus,
  TelemetryPoint,
  ThresholdMap,
} from '../types/sensor';

function createEmptyPoint(): TelemetryPoint {
  return {
    mq4: 0,
    mq135: 0,
    temperature: 0,
    humidity: 0,
    timestamp: '--:--:--',
    epochMs: 0,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function toValidNumber(raw: unknown, min: number, max: number): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return clamp(parsed, min, max);
}

function normalizeDoorStatus(raw: unknown, fallback: DoorStatus = 'LOCKED'): DoorStatus {
  if (typeof raw !== 'string') return fallback;
  const upper = raw.trim().toUpperCase();
  if (upper === 'OPEN') return 'OPEN';
  if (upper === 'LOCKED') return 'LOCKED';
  return fallback;
}

function resolveTargetNode(
  payload: MqttSensorPayload,
  topic: string
): SensorNodeConfig | undefined {
  const topicSegment = topic.split('/').pop()?.trim().toUpperCase() ?? '';
  const payloadId =
    typeof payload.node_id === 'string'
      ? payload.node_id.trim().toUpperCase()
      : '';
  const candidate = payloadId || topicSegment;

  return SENSOR_NODES.find(
    (node) =>
      node.code.toUpperCase() === candidate ||
      node.id.toUpperCase() === candidate
  );
}

function buildPeakSnapshot(
  latestByNode: Record<string, TelemetryPoint>,
  receivedNodeIds: Set<string>,
  timestamp: string,
  epochMs: number
): TelemetryPoint {
  const activeNodes = SENSOR_NODES.filter((n) => receivedNodeIds.has(n.id));
  const pool = activeNodes.length > 0 ? activeNodes : SENSOR_NODES;
  const firstNode = pool[0];
  const firstPt = latestByNode[firstNode.id];
  const firstTag = formatNodeLocationTag(firstNode);

  const snapshot: TelemetryPoint = {
    mq4: firstPt.mq4,
    mq135: firstPt.mq135,
    temperature: firstPt.temperature,
    humidity: firstPt.humidity,
    timestamp,
    epochMs,
    mq4Source: firstTag,
    mq135Source: firstTag,
    temperatureSource: firstTag,
    humiditySource: firstTag,
  };

  for (let i = 1; i < pool.length; i++) {
    const node = pool[i];
    const pt = latestByNode[node.id];
    const tag = formatNodeLocationTag(node);

    if (pt.mq4 > snapshot.mq4) {
      snapshot.mq4 = pt.mq4;
      snapshot.mq4Source = tag;
    }
    if (pt.mq135 > snapshot.mq135) {
      snapshot.mq135 = pt.mq135;
      snapshot.mq135Source = tag;
    }
    if (pt.temperature > snapshot.temperature) {
      snapshot.temperature = pt.temperature;
      snapshot.temperatureSource = tag;
    }
    if (pt.humidity > snapshot.humidity) {
      snapshot.humidity = pt.humidity;
      snapshot.humiditySource = tag;
    }
  }

  return snapshot;
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
  accessLogs: RfidAccessLogEntry[];
  clearAccessLogs: () => void;
  toasts: RfidToastNotification[];
  dismissToast: (id: string) => void;
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
      map[node.id] = [createEmptyPoint()];
    }
    return map;
  }, []);

  const initialDoors = useMemo(() => {
    return Object.fromEntries(
      SENSOR_NODES.map((node) => [node.id, 'LOCKED' as DoorStatus])
    );
  }, []);

  const [historiesByNode, setHistoriesByNode] =
    useState<Record<string, TelemetryPoint[]>>(initialHistories);
  const [doorByNode, setDoorByNode] = useState<Record<string, DoorStatus>>(initialDoors);
  const [peakHistory, setPeakHistory] = useState<TelemetryPoint[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdMap>(DEFAULT_THRESHOLDS);
  const [alertLogs, setAlertLogs] = useState<AlertLogEntry[]>([]);
  const [accessLogs, setAccessLogs] = useState<RfidAccessLogEntry[]>([]);
  const [toasts, setToasts] = useState<RfidToastNotification[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [sampleCount, setSampleCount] = useState<number>(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('--:--:--');
  const [receivedIdsSnapshot, setReceivedIdsSnapshot] = useState<string[]>([]);

  const thresholdsRef = useRef<ThresholdMap>(thresholds);
  thresholdsRef.current = thresholds;

  const onAlertStatusRef = useRef(onAlertStatus);
  onAlertStatusRef.current = onAlertStatus;

  const receivedNodesRef = useRef<Set<string>>(new Set());
  const latestByNodeRef = useRef<Record<string, TelemetryPoint>>(
    Object.fromEntries(SENSOR_NODES.map((node) => [node.id, createEmptyPoint()]))
  );
  const doorRef = useRef<Record<string, DoorStatus>>(initialDoors);
  const toastTimersRef = useRef<Record<string, number>>({});

  const prevStatusRef = useRef<Record<string, Record<SensorKey, SensorStatus>>>(
    Object.fromEntries(
      SENSOR_NODES.map((node) => [
        node.id,
        { mq4: 'normal', mq135: 'normal', temperature: 'normal', humidity: 'normal' },
      ])
    )
  );

  const dismissToast = useCallback((id: string) => {
    if (toastTimersRef.current[id]) {
      window.clearTimeout(toastTimersRef.current[id]);
      delete toastTimersRef.current[id];
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    let disposed = false;

    const client: MqttClient = mqtt.connect(MQTT_BROKER_URL, {
      clientId: `mut-ikn-web-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      keepalive: 30,
    });

    client.on('connect', () => {
      if (disposed) return;
      setIsConnected(true);
      client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
        if (err && !disposed) {
          setIsConnected(false);
        }
      });
    });

    client.on('reconnect', () => {
      if (!disposed) setIsConnected(false);
    });

    client.on('offline', () => {
      if (!disposed) setIsConnected(false);
    });

    client.on('close', () => {
      if (!disposed) setIsConnected(false);
    });

    client.on('error', () => {
      if (!disposed) setIsConnected(false);
    });

    client.on('message', (topic, messageBuffer) => {
      if (disposed) return;

      let payload: MqttSensorPayload;
      try {
        payload = JSON.parse(messageBuffer.toString()) as MqttSensorPayload;
      } catch {
        return;
      }

      const targetNode = resolveTargetNode(payload, topic);
      if (!targetNode) return;

      const mq4 = toValidNumber(
        payload.mq4,
        SENSOR_METADATA.mq4.min,
        SENSOR_METADATA.mq4.max
      );
      const mq135 = toValidNumber(
        payload.mq135,
        SENSOR_METADATA.mq135.min,
        SENSOR_METADATA.mq135.max
      );
      const temperature = toValidNumber(
        payload.suhu,
        SENSOR_METADATA.temperature.min,
        SENSOR_METADATA.temperature.max
      );
      const humidity = toValidNumber(
        payload.kelembapan,
        SENSOR_METADATA.humidity.min,
        SENSOR_METADATA.humidity.max
      );

      if (
        mq4 === null ||
        mq135 === null ||
        temperature === null ||
        humidity === null
      ) {
        return;
      }

      const now = new Date();
      const timestamp = formatTimestamp(now);
      const epochMs = now.getTime();
      const currentDoor = normalizeDoorStatus(
        payload.door,
        doorRef.current[targetNode.id] ?? 'LOCKED'
      );
      const isRfidTap = payload.rfid === true;

      doorRef.current[targetNode.id] = currentDoor;
      setDoorByNode((prev) =>
        prev[targetNode.id] === currentDoor
          ? prev
          : { ...prev, [targetNode.id]: currentDoor }
      );

      const point: TelemetryPoint = {
        mq4,
        mq135,
        temperature,
        humidity,
        timestamp,
        epochMs,
        jarak: typeof payload.jarak === 'number' ? payload.jarak : undefined,
        rfid: isRfidTap,
        door: currentDoor,
        deviceStatus: typeof payload.status === 'string' ? payload.status : undefined,
      };

      const isFirstForNode = !receivedNodesRef.current.has(targetNode.id);
      if (isFirstForNode) {
        receivedNodesRef.current.add(targetNode.id);
        setReceivedIdsSnapshot(Array.from(receivedNodesRef.current));
      }

      latestByNodeRef.current[targetNode.id] = point;

      setIsConnected(true);
      setSampleCount((c) => c + 1);
      setLastUpdatedAt(timestamp);

      setHistoriesByNode((prev) => {
        const currentList = prev[targetNode.id] ?? [];
        const nextList = isFirstForNode
          ? [point]
          : [...currentList.slice(-(MAX_HISTORY_POINTS - 1)), point];
        return {
          ...prev,
          [targetNode.id]: nextList,
        };
      });

      const peakSnapshot = buildPeakSnapshot(
        latestByNodeRef.current,
        receivedNodesRef.current,
        timestamp,
        epochMs
      );
      setPeakHistory((prev) => [
        ...prev.slice(-(MAX_HISTORY_POINTS - 1)),
        peakSnapshot,
      ]);

      if (isRfidTap) {
        const granted = currentDoor === 'OPEN';
        const accessEntry: RfidAccessLogEntry = {
          id: `rfid-${epochMs}-${targetNode.id}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp,
          nodeId: targetNode.id,
          nodeCode: targetNode.code,
          nodeName: targetNode.name,
          nodeLocationTag: formatNodeLocationTag(targetNode),
          door: currentDoor,
          accessResult: granted ? 'DITERIMA' : 'DITOLAK',
          mq4Value: mq4,
        };
        setAccessLogs((prev) => [accessEntry, ...prev].slice(0, MAX_ALERT_LOGS));

        const toastId = `toast-${epochMs}-${targetNode.id}-${Math.random().toString(36).slice(2, 6)}`;
        const toast: RfidToastNotification = {
          id: toastId,
          nodeCode: targetNode.code,
          granted,
          message: granted
            ? `Akses RFID Diterima — [${targetNode.code}] Pintu Terbuka (5 detik)`
            : `Akses RFID Ditolak — [${targetNode.code}] Kondisi Gas Berbahaya!`,
        };
        setToasts((prev) => [toast, ...prev].slice(0, 3));
        toastTimersRef.current[toastId] = window.setTimeout(() => {
          delete toastTimersRef.current[toastId];
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, 5000);
      }

      const newEntries: AlertLogEntry[] = [];
      let highestStatus: SensorStatus = 'normal';

      for (const key of SENSOR_ORDER) {
        const val = point[key];
        const th = thresholdsRef.current[key];
        const status = evaluateSensorStatus(val, th);

        if (STATUS_PRIORITY[status] > STATUS_PRIORITY[highestStatus]) {
          highestStatus = status;
        }

        const prevStatus = prevStatusRef.current[targetNode.id][key];
        const shouldLog =
          status !== 'normal' && (prevStatus !== status || status === 'danger');

        if (shouldLog) {
          const meta = SENSOR_METADATA[key];
          newEntries.push({
            id: `${epochMs}-${targetNode.id}-${key}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp,
            nodeId: targetNode.id,
            nodeCode: targetNode.code,
            nodeName: targetNode.name,
            nodeLocationTag: formatNodeLocationTag(targetNode),
            sensorKey: key,
            sensorName: meta.label,
            value: val,
            unit: meta.unit,
            thresholdValue: status === 'danger' ? th.danger : th.warning,
            status,
          });
        }

        prevStatusRef.current[targetNode.id][key] = status;
      }

      if (newEntries.length > 0) {
        setAlertLogs((prev) => [...newEntries, ...prev].slice(0, MAX_ALERT_LOGS));
      }

      if (highestStatus !== 'normal') {
        onAlertStatusRef.current?.(highestStatus);
      }
    });

    return () => {
      disposed = true;
      Object.values(toastTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      toastTimersRef.current = {};
      client.removeAllListeners();
      client.end(true);
    };
  }, []);

  const nodes = useMemo<SensorNodeState[]>(() => {
    return SENSOR_NODES.map((config) => {
      const history = historiesByNode[config.id] ?? [createEmptyPoint()];
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
        door: doorByNode[config.id] ?? 'LOCKED',
      };
    });
  }, [historiesByNode, thresholds, doorByNode]);

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
    const receivedSet = new Set(receivedIdsSnapshot);
    const activePool = nodes.filter((n) => receivedSet.has(n.config.id));
    const pool = activePool.length > 0 ? activePool : nodes;

    const result = {} as PeakReadingsMap;
    for (const key of SENSOR_ORDER) {
      let bestNode = pool[0];
      for (let i = 1; i < pool.length; i++) {
        if (pool[i].latest[key] > bestNode.latest[key]) {
          bestNode = pool[i];
        }
      }
      result[key] = {
        value: bestNode.latest[key],
        status: bestNode.statuses[key],
        sourceNode: bestNode.config,
      };
    }
    return result;
  }, [nodes, receivedIdsSnapshot]);

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

  const clearAccessLogs = useCallback(() => {
    setAccessLogs([]);
  }, []);

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
    accessLogs,
    clearAccessLogs,
    toasts,
    dismissToast,
    isConnected,
    lastUpdatedAt,
    sampleCount,
  };
}
