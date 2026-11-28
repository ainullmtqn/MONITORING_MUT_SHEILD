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
import { supabase } from '../supabaseClient';
import {
  InitialSupabaseData,
  SupabaseSyncState,
  checkAndLoadSupabaseInitialData,
  mapAlertLogRow,
  mapRfidLogRow,
  mapSensorLogRow,
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
import {
  sanitizeText,
  toClampedFiniteNumber,
  validateThresholdRecord,
} from '../utils/validation';

const THRESHOLDS_STORAGE_KEY = 'mut_ikn_thresholds_v1';
const REALTIME_FALLBACK_POLL_MS = 10000;

function readInitialThresholds(): ThresholdMap {
  if (typeof window === 'undefined') return DEFAULT_THRESHOLDS;
  try {
    const raw = window.localStorage.getItem(THRESHOLDS_STORAGE_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const parsed = validateThresholdRecord(JSON.parse(raw));
    return parsed ?? DEFAULT_THRESHOLDS;
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function persistThresholdsToStorage(next: ThresholdMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THRESHOLDS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota / private-mode restrictions
  }
}

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

function normalizeDoorStatus(raw: unknown, fallback: DoorStatus = 'LOCKED'): DoorStatus {
  const upper = sanitizeText(raw, '', 10).toUpperCase();
  if (upper === 'OPEN') return 'OPEN';
  if (upper === 'LOCKED') return 'LOCKED';
  return fallback;
}

function resolveTargetNode(
  payload: MqttSensorPayload,
  topic: string
): SensorNodeConfig | undefined {
  const topicSegment = sanitizeText(topic.split('/').pop(), '', 16).toUpperCase();
  const payloadId = sanitizeText(payload.node_id, '', 16).toUpperCase();
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

function mergeUniqueById<T extends { id: string }>(
  incoming: T[],
  existing: T[],
  limit: number
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of [...incoming, ...existing]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
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
  const [thresholds, setThresholds] = useState<ThresholdMap>(readInitialThresholds);
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

  const isRealtimeSubscribedRef = useRef<boolean>(false);
  const receivedNodesRef = useRef<Set<string>>(new Set());
  const latestByNodeRef = useRef<Record<string, TelemetryPoint>>(
    Object.fromEntries(SENSOR_NODES.map((node) => [node.id, createEmptyPoint()]))
  );
  const lastUpdatedRef = useRef<Record<string, number | null>>({ ...initialNullMap });
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

  const showRfidToast = useCallback((nodeCode: string, granted: boolean) => {
    const toastId = `toast-${Date.now()}-${nodeCode}-${Math.random().toString(36).slice(2, 6)}`;
    const toast: RfidToastNotification = {
      id: toastId,
      nodeCode,
      granted,
      message: granted
        ? `Akses RFID Diterima — [${nodeCode}] Pintu Terbuka (5 detik)`
        : `Akses RFID Ditolak — [${nodeCode}] Kondisi Gas Berbahaya!`,
    };
    setToasts((prev) => [toast, ...prev].slice(0, 3));
    toastTimersRef.current[toastId] = window.setTimeout(() => {
      delete toastTimersRef.current[toastId];
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, 5000);
  }, []);

  const applySupabaseSnapshot = useCallback((res: InitialSupabaseData) => {
    setSupabaseSync(res.syncState);

    if (Object.keys(res.historiesByNode).length > 0) {
      setHistoriesByNode((prev) => {
        const next = { ...prev };
        for (const [nodeId, pts] of Object.entries(res.historiesByNode)) {
          if (pts.length === 0) continue;
          const newestDbPt = pts[pts.length - 1];
          const currentLatest = latestByNodeRef.current[nodeId];
          if (
            !receivedNodesRef.current.has(nodeId) ||
            newestDbPt.epochMs > currentLatest.epochMs
          ) {
            next[nodeId] = pts;
            latestByNodeRef.current[nodeId] = newestDbPt;
            receivedNodesRef.current.add(nodeId);
          }
        }
        return next;
      });

      setPeakHistory((prev) => {
        if (prev.length > 0) return prev;
        const allPts = Object.entries(res.historiesByNode).flatMap(
          ([nodeId, pts]) => {
            const cfg = SENSOR_NODES.find((n) => n.id === nodeId);
            const tag = cfg ? formatNodeLocationTag(cfg) : nodeId;
            return pts.map((pt) => ({
              ...pt,
              mq4Source: tag,
              mq135Source: tag,
              temperatureSource: tag,
              humiditySource: tag,
            }));
          }
        );
        allPts.sort((a, b) => a.epochMs - b.epochMs);
        return allPts.slice(-MAX_HISTORY_POINTS);
      });
    }

    if (Object.keys(res.lastUpdatedByNode).length > 0) {
      setLastUpdatedByNode((prev) => {
        const next = { ...prev };
        for (const [nodeId, ts] of Object.entries(res.lastUpdatedByNode)) {
          if (ts !== null && (next[nodeId] === null || ts > (next[nodeId] ?? 0))) {
            next[nodeId] = ts;
            lastUpdatedRef.current[nodeId] = ts;
          }
        }
        return next;
      });
    }

    if (Object.keys(res.doorsByNode).length > 0) {
      setDoorByNode((prev) => ({ ...res.doorsByNode, ...prev }));
    }

    if (res.alerts.length > 0) {
      setAlertLogs((prev) => mergeUniqueById(res.alerts, prev, MAX_ALERT_LOGS));
    }

    if (res.accessLogs.length > 0) {
      setAccessLogs((prev) => mergeUniqueById(res.accessLogs, prev, MAX_ALERT_LOGS));
    }

    // Only adopt Supabase settings if user hasn't saved a local override yet
    if (res.thresholds && typeof window !== 'undefined') {
      try {
        if (!window.localStorage.getItem(THRESHOLDS_STORAGE_KEY)) {
          setThresholds(res.thresholds);
        }
      } catch {
        setThresholds(res.thresholds);
      }
    }
  }, []);

  const runSupabaseCheck = useCallback(() => {
    setSupabaseSync({
      status: 'checking',
      message: 'Memeriksa koneksi database Supabase...',
    });
    void checkAndLoadSupabaseInitialData().then(applySupabaseSnapshot);
  }, [applySupabaseSnapshot]);

  // 1. Load startup history & subscribe to Supabase Realtime + fallback polling
  useEffect(() => {
    runSupabaseCheck();

    const sb = supabase;
    if (!sb) return;

    const channel = sb
      .channel('mut-ikn-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_logs' },
        (payload) => {
          const mapped = mapSensorLogRow(
            (payload.new ?? {}) as Record<string, unknown>
          );
          if (!mapped) return;

          const epochMs = mapped.point.epochMs || Date.now();
          const point: TelemetryPoint = { ...mapped.point, epochMs };
          const nodeId = mapped.node.id;
          const isFirst = !receivedNodesRef.current.has(nodeId);
          receivedNodesRef.current.add(nodeId);
          latestByNodeRef.current[nodeId] = point;
          lastUpdatedRef.current[nodeId] = epochMs;
          doorRef.current[nodeId] = mapped.door;

          setHistoriesByNode((prev) => {
            const cur = prev[nodeId] ?? [];
            const lastEpoch = cur[cur.length - 1]?.epochMs ?? 0;
            if (epochMs <= lastEpoch && !isFirst) return prev;
            return {
              ...prev,
              [nodeId]: isFirst
                ? [point]
                : [...cur.slice(-(MAX_HISTORY_POINTS - 1)), point],
            };
          });
          setLastUpdatedByNode((prev) => ({ ...prev, [nodeId]: epochMs }));
          setDoorByNode((prev) => ({ ...prev, [nodeId]: mapped.door }));
          setLastUpdatedAt(point.timestamp);
          setSampleCount((c) => c + 1);
          setPeakHistory((prev) => [
            ...prev.slice(-(MAX_HISTORY_POINTS - 1)),
            buildPeakSnapshot(
              latestByNodeRef.current,
              lastUpdatedRef.current,
              point.timestamp,
              epochMs
            ),
          ]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alert_logs' },
        (payload) => {
          const entry = mapAlertLogRow(
            (payload.new ?? {}) as Record<string, unknown>
          );
          if (!entry) return;
          setAlertLogs((prev) => mergeUniqueById([entry], prev, MAX_ALERT_LOGS));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rfid_logs' },
        (payload) => {
          const entry = mapRfidLogRow(
            (payload.new ?? {}) as Record<string, unknown>
          );
          if (!entry) return;
          setAccessLogs((prev) => mergeUniqueById([entry], prev, MAX_ALERT_LOGS));
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isRealtimeSubscribedRef.current = true;
          setSupabaseSync({
            status: 'connected',
            message: 'Terhubung Read-Only + Realtime aktif (postgres_changes)',
          });
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          isRealtimeSubscribedRef.current = false;
        }
      });

    // Lightweight fallback polling when Supabase Realtime is not subscribed
    const fallbackTimer = window.setInterval(() => {
      if (!isRealtimeSubscribedRef.current) {
        void checkAndLoadSupabaseInitialData().then(applySupabaseSnapshot);
      }
    }, REALTIME_FALLBACK_POLL_MS);

    return () => {
      isRealtimeSubscribedRef.current = false;
      window.clearInterval(fallbackTimer);
      void sb.removeChannel(channel);
    };
  }, [runSupabaseCheck, applySupabaseSnapshot]);

  // 2. 1-second heartbeat monitor to detect nodes offline > 15s
  useEffect(() => {
    const heartbeatTimer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(heartbeatTimer);
  }, []);

  // 3. MQTT Live WebSocket listener (zero DB writes from browser)
  useEffect(() => {
    let disposed = false;

    const client: MqttClient = mqtt.connect(MQTT_BROKER_URL, {
      clientId: `mut-ikn-web-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 2000,
      connectTimeout: 10000,
      keepalive: 120,
      reschedulePings: true,
    });

    const handleTabResume = () => {
      if (disposed) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      setNowMs(Date.now());
      if (!client.connected) {
        setConnectionState('connecting');
        client.reconnect();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleTabResume);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleTabResume);
      window.addEventListener('online', handleTabResume);
    }

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

    client.on('message', (topic, messageBuffer, packet) => {
      if (disposed) return;

      let payload: MqttSensorPayload;
      try {
        payload = JSON.parse(messageBuffer.toString()) as MqttSensorPayload;
      } catch {
        return;
      }

      const targetNode = resolveTargetNode(payload, topic);
      if (!targetNode) return;
      const isRetained = Boolean(packet?.retain);

      const mq4 = toClampedFiniteNumber(
        payload.mq4,
        SENSOR_METADATA.mq4.min,
        SENSOR_METADATA.mq4.max
      );
      const mq135 = toClampedFiniteNumber(
        payload.mq135,
        SENSOR_METADATA.mq135.min,
        SENSOR_METADATA.mq135.max
      );
      const temperature = toClampedFiniteNumber(
        payload.suhu,
        SENSOR_METADATA.temperature.min,
        SENSOR_METADATA.temperature.max
      );
      const humidity = toClampedFiniteNumber(
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
      const batteryPct = toClampedFiniteNumber(payload.battery, 0, 100);
      const roundedBattery = batteryPct !== null ? Math.round(batteryPct) : null;
      const isRfidTap = !isRetained && payload.rfid === true;

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

      const jarak = toClampedFiniteNumber(payload.jarak, 0, 500);
      const deviceStatus = sanitizeText(payload.status, '', 16) || undefined;

      const point: TelemetryPoint = {
        mq4,
        mq135,
        temperature,
        humidity,
        timestamp,
        epochMs,
        jarak: jarak ?? undefined,
        rfid: isRfidTap,
        door: currentDoor,
        battery: roundedBattery ?? undefined,
        deviceStatus,
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
        showRfidToast(targetNode.code, granted);

        if (!isRealtimeSubscribedRef.current) {
          const accessEntry: RfidAccessLogEntry = {
            id: `mqtt-rfid-${epochMs}-${targetNode.id}`,
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
          setAccessLogs((prev) =>
            mergeUniqueById([accessEntry], prev, MAX_ALERT_LOGS)
          );
        }
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
          !isRealtimeSubscribedRef.current &&
          status !== 'normal' &&
          (prevStatus !== status || status === 'danger');

        if (shouldLog) {
          const meta = SENSOR_METADATA[key];
          newEntries.push({
            id: `mqtt-alert-${epochMs}-${targetNode.id}-${key}`,
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
          });
        }

        prevStatusRef.current[targetNode.id][key] = status;
      }

      if (newEntries.length > 0) {
        setAlertLogs((prev) => mergeUniqueById(newEntries, prev, MAX_ALERT_LOGS));
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
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleTabResume);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleTabResume);
        window.removeEventListener('online', handleTabResume);
      }
      Object.values(toastTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      toastTimersRef.current = {};
      client.removeAllListeners();
      client.end(true);
    };
  }, [showRfidToast]);

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
    const validated = validateThresholdRecord(next);
    if (!validated) return;
    setThresholds(validated);
    persistThresholdsToStorage(validated);
  }, []);

  const resetThresholds = useCallback(() => {
    setThresholds(DEFAULT_THRESHOLDS);
    persistThresholdsToStorage(DEFAULT_THRESHOLDS);
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
