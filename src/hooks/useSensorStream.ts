import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import {
  DEFAULT_THRESHOLDS,
  MAX_ALERT_LOGS,
  MAX_HISTORY_POINTS,
  MQTT_BROKER_URL,
  MQTT_TOPIC,
  NODE_HEALTH_PRIORITY,
  NODE_OFFLINE_TIMEOUT_MS,
  SENSOR_METADATA,
  SENSOR_NODES,
  SENSOR_ORDER,
  STATUS_PRIORITY,
  evaluateSensorStatus,
  formatCoordinates,
  formatNodeLocationTag,
  formatTimestamp,
  getHighestStatus,
} from '../constants/sensors';
import {
  SupabaseSyncState,
  checkAndLoadSupabaseInitialData,
  insertAlertLogToSupabase,
  insertRfidLogToSupabase,
  insertSensorLogToSupabase,
  saveThresholdsToSupabase,
} from '../services/supabaseSync';
import {
  AlertLogEntry,
  DoorStatus,
  MqttConnectionState,
  MqttSensorPayload,
  NodeHealthStatus,
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

function isNodeOnlineAt(lastUpdatedMs: number | null, nowMs: number): boolean {
  return lastUpdatedMs !== null && nowMs - lastUpdatedMs <= NODE_OFFLINE_TIMEOUT_MS;
}

function buildPeakSnapshot(
  latestByNode: Record<string, TelemetryPoint>,
  lastUpdatedByNode: Record<string, number | null>,
  timestamp: string,
  epochMs: number
): TelemetryPoint {
  const onlineNodes = SENSOR_NODES.filter((n) =>
    isNodeOnlineAt(lastUpdatedByNode[n.id], epochMs)
  );
  const pool = onlineNodes.length > 0 ? onlineNodes : [SENSOR_NODES[0]];
  const firstNode = pool[0];
  const firstPt =
    onlineNodes.length > 0 ? latestByNode[firstNode.id] : createEmptyPoint();
  const firstTag =
    onlineNodes.length > 0 ? formatNodeLocationTag(firstNode) : 'Tidak ada node online';

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
  onlineNodeCount: number;
  peakReadings: PeakReadingsMap;
  peakHistory: TelemetryPoint[];
  thresholds: ThresholdMap;
  updateThresholds: (next: ThresholdMap) => void;
  resetThresholds: () => void;
  overallStatus: SensorStatus;
  isAlarmAcknowledged: boolean;
  acknowledgeAlarm: () => void;
  alertLogs: AlertLogEntry[];
  clearAlertLogs: () => void;
  accessLogs: RfidAccessLogEntry[];
  clearAccessLogs: () => void;
  toasts: RfidToastNotification[];
  dismissToast: (id: string) => void;
  connectionState: MqttConnectionState;
  isConnected: boolean;
  lastUpdatedAt: string;
  sampleCount: number;
  supabaseSync: SupabaseSyncState;
  recheckSupabase: () => void;
}

const SUPABASE_TELEMETRY_SYNC_INTERVAL_MS = 10000;

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

  const initialNullMap = useMemo(() => {
    return Object.fromEntries(SENSOR_NODES.map((node) => [node.id, null]));
  }, []);

  const [historiesByNode, setHistoriesByNode] =
    useState<Record<string, TelemetryPoint[]>>(initialHistories);
  const [doorByNode, setDoorByNode] = useState<Record<string, DoorStatus>>(initialDoors);
  const [batteryByNode, setBatteryByNode] =
    useState<Record<string, number | null>>(initialNullMap);
  const [lastUpdatedByNode, setLastUpdatedByNode] =
    useState<Record<string, number | null>>(initialNullMap);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [peakHistory, setPeakHistory] = useState<TelemetryPoint[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdMap>(DEFAULT_THRESHOLDS);
  const [alertLogs, setAlertLogs] = useState<AlertLogEntry[]>([]);
  const [accessLogs, setAccessLogs] = useState<RfidAccessLogEntry[]>([]);
  const [toasts, setToasts] = useState<RfidToastNotification[]>([]);
  const [connectionState, setConnectionState] =
    useState<MqttConnectionState>('connecting');
  const [sampleCount, setSampleCount] = useState<number>(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('--:--:--');
  const [isAlarmAcknowledged, setIsAlarmAcknowledged] = useState<boolean>(false);
  const [supabaseSync, setSupabaseSync] = useState<SupabaseSyncState>({
    status: 'checking',
    message: 'Memeriksa koneksi database Supabase...',
  });

  const thresholdsRef = useRef<ThresholdMap>(thresholds);
  thresholdsRef.current = thresholds;

  const onAlertStatusRef = useRef(onAlertStatus);
  onAlertStatusRef.current = onAlertStatus;

  const acknowledgedRef = useRef<boolean>(isAlarmAcknowledged);
  acknowledgedRef.current = isAlarmAcknowledged;

  const receivedNodesRef = useRef<Set<string>>(new Set());
  const latestByNodeRef = useRef<Record<string, TelemetryPoint>>(
    Object.fromEntries(SENSOR_NODES.map((node) => [node.id, createEmptyPoint()]))
  );
  const lastUpdatedRef = useRef<Record<string, number | null>>({ ...initialNullMap });
  const lastSupabaseLogRef = useRef<Record<string, number>>({});
  const doorRef = useRef<Record<string, DoorStatus>>({ ...initialDoors });
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

  const acknowledgeAlarm = useCallback(() => {
    acknowledgedRef.current = true;
    setIsAlarmAcknowledged(true);
  }, []);

  const runSupabaseCheck = useCallback(() => {
    setSupabaseSync({
      status: 'checking',
      message: 'Memeriksa koneksi database Supabase...',
    });
    void checkAndLoadSupabaseInitialData().then((res) => {
      setSupabaseSync(res.syncState);
      if (res.alerts.length > 0) {
        setAlertLogs((prev) =>
          prev.length === 0 ? res.alerts : [...prev, ...res.alerts].slice(0, MAX_ALERT_LOGS)
        );
      }
      if (res.accessLogs.length > 0) {
        setAccessLogs((prev) =>
          prev.length === 0
            ? res.accessLogs
            : [...prev, ...res.accessLogs].slice(0, MAX_ALERT_LOGS)
        );
      }
    });
  }, []);

  // Load initial historical alerts / RFID logs from Supabase on mount
  useEffect(() => {
    runSupabaseCheck();
  }, [runSupabaseCheck]);

  // 1-second heartbeat monitor to detect nodes offline > 15s
  useEffect(() => {
    const heartbeatTimer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(heartbeatTimer);
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
      setConnectionState('connected');
      client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
        if (err && !disposed) {
          setConnectionState('disconnected');
        }
      });
    });

    client.on('reconnect', () => {
      if (!disposed) setConnectionState('connecting');
    });

    client.on('offline', () => {
      if (!disposed) setConnectionState('disconnected');
    });

    client.on('close', () => {
      if (!disposed) setConnectionState('disconnected');
    });

    client.on('error', () => {
      if (!disposed) setConnectionState('disconnected');
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
      const batteryPct = toValidNumber(payload.battery, 0, 100);
      const roundedBattery = batteryPct !== null ? Math.round(batteryPct) : null;
      const isRfidTap = payload.rfid === true;

      doorRef.current[targetNode.id] = currentDoor;
      lastUpdatedRef.current[targetNode.id] = epochMs;

      setDoorByNode((prev) =>
        prev[targetNode.id] === currentDoor
          ? prev
          : { ...prev, [targetNode.id]: currentDoor }
      );
      if (roundedBattery !== null) {
        setBatteryByNode((prev) => ({
          ...prev,
          [targetNode.id]: roundedBattery,
        }));
      }
      setLastUpdatedByNode((prev) => ({
        ...prev,
        [targetNode.id]: epochMs,
      }));
      setNowMs(epochMs);

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
        battery: roundedBattery ?? undefined,
        deviceStatus: typeof payload.status === 'string' ? payload.status : undefined,
      };

      const isFirstForNode = !receivedNodesRef.current.has(targetNode.id);
      if (isFirstForNode) {
        receivedNodesRef.current.add(targetNode.id);
      }

      latestByNodeRef.current[targetNode.id] = point;

      setConnectionState('connected');
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
        lastUpdatedRef.current,
        timestamp,
        epochMs
      );
      setPeakHistory((prev) => [
        ...prev.slice(-(MAX_HISTORY_POINTS - 1)),
        peakSnapshot,
      ]);

      const coordinatesText = formatCoordinates(targetNode);
      const locationTag = formatNodeLocationTag(targetNode);

      if (isRfidTap) {
        const granted = currentDoor === 'OPEN';
        const accessEntry: RfidAccessLogEntry = {
          id: `rfid-${epochMs}-${targetNode.id}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp,
          nodeId: targetNode.id,
          nodeCode: targetNode.code,
          nodeName: targetNode.name,
          nodeLocationTag: locationTag,
          coordinatesText,
          door: currentDoor,
          accessResult: granted ? 'DITERIMA' : 'DITOLAK',
          mq4Value: mq4,
        };
        setAccessLogs((prev) => [accessEntry, ...prev].slice(0, MAX_ALERT_LOGS));
        void insertRfidLogToSupabase(accessEntry);

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
      let hasNewSpikeOrEscalation = false;

      for (const key of SENSOR_ORDER) {
        const val = point[key];
        const th = thresholdsRef.current[key];
        const status = evaluateSensorStatus(val, th);

        if (STATUS_PRIORITY[status] > STATUS_PRIORITY[highestStatus]) {
          highestStatus = status;
        }

        const prevStatus = prevStatusRef.current[targetNode.id][key];
        if (
          status !== 'normal' &&
          STATUS_PRIORITY[status] > STATUS_PRIORITY[prevStatus]
        ) {
          hasNewSpikeOrEscalation = true;
        }

        const shouldLog =
          status !== 'normal' && (prevStatus !== status || status === 'danger');

        if (shouldLog) {
          const meta = SENSOR_METADATA[key];
          const entry: AlertLogEntry = {
            id: `${epochMs}-${targetNode.id}-${key}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp,
            nodeId: targetNode.id,
            nodeCode: targetNode.code,
            nodeName: targetNode.name,
            nodeLocationTag: locationTag,
            coordinatesText,
            sensorKey: key,
            sensorName: meta.label,
            value: val,
            unit: meta.unit,
            thresholdValue: status === 'danger' ? th.danger : th.warning,
            status,
          };
          newEntries.push(entry);
          void insertAlertLogToSupabase(entry);
        }

        prevStatusRef.current[targetNode.id][key] = status;
      }

      if (newEntries.length > 0) {
        setAlertLogs((prev) => [...newEntries, ...prev].slice(0, MAX_ALERT_LOGS));
      }

      // Throttled Supabase sensor_logs sync (every 10s per node or on alert)
      const lastLoggedAt = lastSupabaseLogRef.current[targetNode.id] ?? 0;
      if (
        hasNewSpikeOrEscalation ||
        epochMs - lastLoggedAt >= SUPABASE_TELEMETRY_SYNC_INTERVAL_MS
      ) {
        lastSupabaseLogRef.current[targetNode.id] = epochMs;
        void insertSensorLogToSupabase(targetNode, point, highestStatus).then(
          (res) => {
            if (res && !disposed) {
              setSupabaseSync(res);
            }
          }
        );
      }

      if (hasNewSpikeOrEscalation && acknowledgedRef.current) {
        acknowledgedRef.current = false;
        setIsAlarmAcknowledged(false);
      }

      if (highestStatus !== 'normal' && !acknowledgedRef.current) {
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
      const lastMs = lastUpdatedByNode[config.id];
      const isOnline = isNodeOnlineAt(lastMs, nowMs);
      const secondsSinceUpdate =
        lastMs !== null ? Math.max(0, Math.floor((nowMs - lastMs) / 1000)) : null;

      const statuses: Record<SensorKey, SensorStatus> = {
        mq4: evaluateSensorStatus(latest.mq4, thresholds.mq4),
        mq135: evaluateSensorStatus(latest.mq135, thresholds.mq135),
        temperature: evaluateSensorStatus(latest.temperature, thresholds.temperature),
        humidity: evaluateSensorStatus(latest.humidity, thresholds.humidity),
      };

      const overallStatus: NodeHealthStatus = isOnline
        ? getHighestStatus(Object.values(statuses))
        : 'offline';

      return {
        config,
        latest,
        history,
        statuses,
        overallStatus,
        isOnline,
        lastUpdatedMs: lastMs,
        secondsSinceUpdate,
        battery: batteryByNode[config.id] ?? null,
        door: doorByNode[config.id] ?? 'LOCKED',
      };
    });
  }, [historiesByNode, thresholds, doorByNode, batteryByNode, lastUpdatedByNode, nowMs]);

  const sortedNodes = useMemo<SensorNodeState[]>(() => {
    return [...nodes].sort((a, b) => {
      const priorityDiff =
        NODE_HEALTH_PRIORITY[b.overallStatus] - NODE_HEALTH_PRIORITY[a.overallStatus];
      if (priorityDiff !== 0) return priorityDiff;
      const mq4Diff = b.latest.mq4 - a.latest.mq4;
      if (mq4Diff !== 0) return mq4Diff;
      return b.latest.mq135 - a.latest.mq135;
    });
  }, [nodes]);

  const onlineNodes = useMemo(
    () => nodes.filter((n) => n.isOnline),
    [nodes]
  );

  const peakReadings = useMemo<PeakReadingsMap>(() => {
    const emptyFallback = createEmptyPoint();
    if (onlineNodes.length === 0) {
      const result = {} as PeakReadingsMap;
      for (const key of SENSOR_ORDER) {
        result[key] = {
          value: emptyFallback[key],
          status: 'normal',
          sourceNode: SENSOR_NODES[0],
        };
      }
      return result;
    }

    const result = {} as PeakReadingsMap;
    for (const key of SENSOR_ORDER) {
      let bestNode = onlineNodes[0];
      for (let i = 1; i < onlineNodes.length; i++) {
        if (onlineNodes[i].latest[key] > bestNode.latest[key]) {
          bestNode = onlineNodes[i];
        }
      }
      result[key] = {
        value: bestNode.latest[key],
        status: bestNode.statuses[key],
        sourceNode: bestNode.config,
      };
    }
    return result;
  }, [onlineNodes]);

  const overallStatus = useMemo<SensorStatus>(() => {
    const onlineStatuses = onlineNodes
      .map((n) => n.overallStatus)
      .filter((s): s is SensorStatus => s !== 'offline');
    return getHighestStatus(onlineStatuses);
  }, [onlineNodes]);

  useEffect(() => {
    if (overallStatus === 'normal' && isAlarmAcknowledged) {
      acknowledgedRef.current = false;
      setIsAlarmAcknowledged(false);
    }
  }, [overallStatus, isAlarmAcknowledged]);

  const updateThresholds = useCallback((next: ThresholdMap) => {
    setThresholds(next);
    void saveThresholdsToSupabase(next).then((res) => {
      if (res) setSupabaseSync(res);
    });
  }, []);

  const resetThresholds = useCallback(() => {
    setThresholds(DEFAULT_THRESHOLDS);
    void saveThresholdsToSupabase(DEFAULT_THRESHOLDS).then((res) => {
      if (res) setSupabaseSync(res);
    });
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
    onlineNodeCount: onlineNodes.length,
    peakReadings,
    peakHistory,
    thresholds,
    updateThresholds,
    resetThresholds,
    overallStatus,
    isAlarmAcknowledged,
    acknowledgeAlarm,
    alertLogs,
    clearAlertLogs,
    accessLogs,
    clearAccessLogs,
    toasts,
    dismissToast,
    connectionState,
    isConnected: connectionState === 'connected',
    lastUpdatedAt,
    sampleCount,
    supabaseSync,
    recheckSupabase: runSupabaseCheck,
  };
}
