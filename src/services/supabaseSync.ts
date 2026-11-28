import {
  MAX_HISTORY_POINTS,
  SENSOR_METADATA,
  SENSOR_NODES,
  formatCoordinates,
  formatNodeLocationTag,
} from '../constants/sensors';
import { isSupabaseConfigured, supabase } from '../supabaseClient';
import {
  AlertLogEntry,
  DoorStatus,
  RfidAccessLogEntry,
  SensorKey,
  SensorNodeConfig,
  SensorStatus,
  TelemetryPoint,
  ThresholdMap,
} from '../types/sensor';
import {
  sanitizeText,
  toClampedFiniteNumber,
  validateThresholdRecord,
} from '../utils/validation';

export type SupabaseSyncStatus =
  | 'checking'
  | 'connected'
  | 'rls-restricted'
  | 'error';

export interface SupabaseSyncState {
  status: SupabaseSyncStatus;
  message: string;
}

export interface InitialSupabaseData {
  syncState: SupabaseSyncState;
  historiesByNode: Record<string, TelemetryPoint[]>;
  lastUpdatedByNode: Record<string, number | null>;
  doorsByNode: Record<string, DoorStatus>;
  alerts: AlertLogEntry[];
  accessLogs: RfidAccessLogEntry[];
  thresholds: ThresholdMap | null;
}

const NODE_BY_CODE = new Map<string, SensorNodeConfig>(
  SENSOR_NODES.map((n) => [n.code.toUpperCase(), n])
);

function mapSupabaseError(error: { code?: string; message?: string }): SupabaseSyncState {
  if (error.code === '42501') {
    return {
      status: 'rls-restricted',
      message: 'Tabel ditemukan, akses anon dibatasi RLS/GRANT (42501)',
    };
  }
  const detail = error.code
    ? `[${sanitizeText(error.code, 'ERR', 16)}] ${sanitizeText(error.message, '', 80)}`
    : sanitizeText(error.message, 'Gagal terhubung ke Supabase', 80);
  return {
    status: 'error',
    message: detail,
  };
}

function inferSensorKeyFromName(rawName: unknown): SensorKey {
  const s = sanitizeText(rawName, 'mq4', 32).toLowerCase();
  if (s.includes('135')) return 'mq135';
  if (s.includes('suhu') || s.includes('temp')) return 'temperature';
  if (s.includes('kelemb') || s.includes('humid')) return 'humidity';
  return 'mq4';
}

function formatDbTimestamp(raw: unknown): string {
  if (!raw) return '--:--:--';
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString('id-ID', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function parseEpochMs(raw: unknown): number {
  if (!raw) return 0;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export interface MappedSensorRow {
  node: SensorNodeConfig;
  point: TelemetryPoint;
  door: DoorStatus;
}

export function mapSensorLogRow(
  row: Record<string, unknown>
): MappedSensorRow | null {
  const nodeCode = sanitizeText(row.node_id, '', 16).toUpperCase();
  const node = NODE_BY_CODE.get(nodeCode);
  if (!node) return null;

  const mq4 = toClampedFiniteNumber(
    row.mq4,
    SENSOR_METADATA.mq4.min,
    SENSOR_METADATA.mq4.max
  );
  const mq135 = toClampedFiniteNumber(
    row.mq135,
    SENSOR_METADATA.mq135.min,
    SENSOR_METADATA.mq135.max
  );
  const temperature = toClampedFiniteNumber(
    row.suhu,
    SENSOR_METADATA.temperature.min,
    SENSOR_METADATA.temperature.max
  );
  const humidity = toClampedFiniteNumber(
    row.kelembapan,
    SENSOR_METADATA.humidity.min,
    SENSOR_METADATA.humidity.max
  );

  if (
    mq4 === null ||
    mq135 === null ||
    temperature === null ||
    humidity === null
  ) {
    return null;
  }

  const epochMs = parseEpochMs(row.created_at);
  const doorRaw = sanitizeText(row.door, 'LOCKED', 10).toUpperCase();
  const door: DoorStatus = doorRaw === 'OPEN' ? 'OPEN' : 'LOCKED';
  const jarak = toClampedFiniteNumber(row.jarak, 0, 500);
  const deviceStatus = sanitizeText(row.status, '', 16) || undefined;

  return {
    node,
    door,
    point: {
      mq4,
      mq135,
      temperature,
      humidity,
      timestamp: formatDbTimestamp(row.created_at),
      epochMs,
      jarak: jarak ?? undefined,
      door,
      deviceStatus,
    },
  };
}

export function mapAlertLogRow(
  row: Record<string, unknown>,
  fallbackIdx = 0
): AlertLogEntry | null {
  const nodeCode = sanitizeText(row.node_id, 'NODE-01', 16).toUpperCase();
  const node = NODE_BY_CODE.get(nodeCode);
  if (!node) return null;

  const sensorKey = inferSensorKeyFromName(row.sensor_name);
  const meta = SENSOR_METADATA[sensorKey];
  const value = toClampedFiniteNumber(row.value, meta.min, meta.max);
  const thresholdValue = toClampedFiniteNumber(row.threshold, meta.min, meta.max);
  if (value === null || thresholdValue === null) return null;

  const levelRaw = sanitizeText(row.level, 'WASPADA', 16).toUpperCase();
  const status: Exclude<SensorStatus, 'normal'> =
    levelRaw === 'BAHAYA' || levelRaw === 'DANGER' ? 'danger' : 'warning';

  return {
    id: sanitizeText(row.id, `sb-alert-${fallbackIdx}`, 64),
    timestamp: formatDbTimestamp(row.created_at),
    nodeId: node.id,
    nodeCode: node.code,
    nodeName: node.name,
    nodeLocationTag: formatNodeLocationTag(node),
    coordinatesText: formatCoordinates(node),
    sensorKey,
    sensorName: sanitizeText(row.sensor_name, meta.label, 32),
    value,
    unit: meta.unit,
    thresholdValue,
    status,
  };
}

export function mapRfidLogRow(
  row: Record<string, unknown>,
  fallbackIdx = 0
): RfidAccessLogEntry | null {
  const nodeCode = sanitizeText(row.node_id, 'NODE-01', 16).toUpperCase();
  const node = NODE_BY_CODE.get(nodeCode);
  if (!node) return null;

  const doorRaw = sanitizeText(row.door_status, 'LOCKED', 10).toUpperCase();
  const door: DoorStatus = doorRaw === 'OPEN' ? 'OPEN' : 'LOCKED';
  const resultRaw = sanitizeText(
    row.access_result,
    door === 'OPEN' ? 'DITERIMA' : 'DITOLAK',
    16
  ).toUpperCase();

  return {
    id: sanitizeText(row.id, `sb-rfid-${fallbackIdx}`, 64),
    timestamp: formatDbTimestamp(row.created_at),
    nodeId: node.id,
    nodeCode: node.code,
    nodeName: node.name,
    nodeLocationTag: formatNodeLocationTag(node),
    coordinatesText: formatCoordinates(node),
    door,
    accessResult: resultRaw === 'DITERIMA' ? 'DITERIMA' : 'DITOLAK',
    mq4Value: 0,
  };
}

/**
 * Pure read-only initial loader from Supabase.
 * Web frontend NEVER writes telemetry, alerts, or RFID logs to Supabase.
 */
export async function checkAndLoadSupabaseInitialData(): Promise<InitialSupabaseData> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      syncState: {
        status: 'error',
        message: 'Konfigurasi .env Supabase (VITE_SUPABASE_URL / ANON_KEY) belum disetel',
      },
      historiesByNode: {},
      lastUpdatedByNode: {},
      doorsByNode: {},
      alerts: [],
      accessLogs: [],
      thresholds: null,
    };
  }

  try {
    const [sensorRes, alertsRes, rfidRes, settingsRes] = await Promise.all([
      supabase
        .from('sensor_logs')
        .select('id, created_at, node_id, mq4, mq135, suhu, kelembapan, jarak, door, status')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('alert_logs')
        .select('id, created_at, node_id, sensor_name, value, threshold, level')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('rfid_logs')
        .select('id, created_at, node_id, door_status, access_result')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('settings')
        .select('id, thresholds, updated_at')
        .eq('id', 'default_thresholds')
        .limit(1),
    ]);

    const firstError =
      sensorRes.error || alertsRes.error || rfidRes.error || settingsRes.error;
    if (firstError) {
      return {
        syncState: mapSupabaseError(firstError),
        historiesByNode: {},
        lastUpdatedByNode: {},
        doorsByNode: {},
        alerts: [],
        accessLogs: [],
        thresholds: null,
      };
    }

    const historiesByNode: Record<string, TelemetryPoint[]> = {};
    const lastUpdatedByNode: Record<string, number | null> = {};
    const doorsByNode: Record<string, DoorStatus> = {};

    // Reverse descending rows to chronological order (oldest -> newest) for charts
    const sensorRowsDesc = (sensorRes.data ?? []) as Array<Record<string, unknown>>;
    for (let i = sensorRowsDesc.length - 1; i >= 0; i--) {
      const mapped = mapSensorLogRow(sensorRowsDesc[i]);
      if (!mapped) continue;

      const prevList = historiesByNode[mapped.node.id] ?? [];
      historiesByNode[mapped.node.id] = [
        ...prevList.slice(-(MAX_HISTORY_POINTS - 1)),
        mapped.point,
      ];
      if (mapped.point.epochMs > 0) {
        lastUpdatedByNode[mapped.node.id] = mapped.point.epochMs;
      }
      doorsByNode[mapped.node.id] = mapped.door;
    }

    const alerts = ((alertsRes.data ?? []) as Array<Record<string, unknown>>)
      .map((row, idx) => mapAlertLogRow(row, idx))
      .filter((entry): entry is AlertLogEntry => entry !== null);

    const accessLogs = ((rfidRes.data ?? []) as Array<Record<string, unknown>>)
      .map((row, idx) => mapRfidLogRow(row, idx))
      .filter((entry): entry is RfidAccessLogEntry => entry !== null);

    const savedRow = settingsRes.data?.[0] as Record<string, unknown> | undefined;
    const savedThresholds = savedRow
      ? validateThresholdRecord(savedRow.thresholds)
      : null;

    return {
      syncState: {
        status: 'connected',
        message: 'Terhubung Read-Only + Realtime (ESP32 menulis langsung ke Supabase)',
      },
      historiesByNode,
      lastUpdatedByNode,
      doorsByNode,
      alerts,
      accessLogs,
      thresholds: savedThresholds,
    };
  } catch (err) {
    return {
      syncState: {
        status: 'error',
        message:
          err instanceof Error
            ? sanitizeText(err.message, 'Koneksi Supabase gagal', 80)
            : 'Koneksi Supabase gagal',
      },
      historiesByNode: {},
      lastUpdatedByNode: {},
      doorsByNode: {},
      alerts: [],
      accessLogs: [],
      thresholds: null,
    };
  }
}
