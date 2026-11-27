import {
  DEFAULT_THRESHOLDS,
  MAX_HISTORY_POINTS,
  SENSOR_METADATA,
  SENSOR_NODES,
  SENSOR_ORDER,
} from '../constants/sensors';
import { supabase } from '../supabaseClient';
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
  const detail = error.code ? `[${error.code}] ${error.message ?? ''}` : error.message;
  return {
    status: 'error',
    message: detail || 'Gagal terhubung ke Supabase',
  };
}

function inferSensorKeyFromName(rawName: unknown): SensorKey {
  const s = String(rawName ?? '').toLowerCase();
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

function parseThresholdsRecord(raw: unknown): ThresholdMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const parsed = { ...DEFAULT_THRESHOLDS };

  for (const key of SENSOR_ORDER) {
    const entry = obj[key];
    if (!entry || typeof entry !== 'object') return null;
    const w = Number((entry as Record<string, unknown>).warning);
    const d = Number((entry as Record<string, unknown>).danger);
    if (!Number.isFinite(w) || !Number.isFinite(d) || w >= d) return null;
    parsed[key] = { warning: w, danger: d };
  }
  return parsed;
}

export async function checkAndLoadSupabaseInitialData(): Promise<InitialSupabaseData> {
  try {
    const [sensorRes, alertsRes, rfidRes, settingsRes] = await Promise.all([
      supabase
        .from('sensor_logs')
        .select('id, created_at, node_id, mq4, mq135, suhu, kelembapan, jarak, door, status')
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('alert_logs')
        .select('id, created_at, node_id, sensor_name, value, threshold, level')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('rfid_logs')
        .select('id, created_at, node_id, door_status, access_result')
        .order('created_at', { ascending: false })
        .limit(40),
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

    // Group recent sensor_logs per node chronologically (oldest -> newest)
    const historiesByNode: Record<string, TelemetryPoint[]> = {};
    const lastUpdatedByNode: Record<string, number | null> = {};
    const doorsByNode: Record<string, DoorStatus> = {};

    const sensorRowsDesc = (sensorRes.data ?? []) as Array<Record<string, unknown>>;
    for (let i = sensorRowsDesc.length - 1; i >= 0; i--) {
      const row = sensorRowsDesc[i];
      const nodeCode = String(row.node_id ?? '').toUpperCase();
      const node = NODE_BY_CODE.get(nodeCode);
      if (!node) continue;

      const epochMs = parseEpochMs(row.created_at);
      const doorRaw = String(row.door ?? 'LOCKED').toUpperCase();
      const door: DoorStatus = doorRaw === 'OPEN' ? 'OPEN' : 'LOCKED';

      const pt: TelemetryPoint = {
        mq4: Number(row.mq4 ?? 0),
        mq135: Number(row.mq135 ?? 0),
        temperature: Number(row.suhu ?? 0),
        humidity: Number(row.kelembapan ?? 0),
        timestamp: formatDbTimestamp(row.created_at),
        epochMs,
        jarak: typeof row.jarak === 'number' ? row.jarak : undefined,
        door,
        deviceStatus: typeof row.status === 'string' ? row.status : undefined,
      };

      const prevList = historiesByNode[node.id] ?? [];
      historiesByNode[node.id] = [...prevList.slice(-(MAX_HISTORY_POINTS - 1)), pt];
      if (epochMs > 0) {
        lastUpdatedByNode[node.id] = epochMs;
      }
      doorsByNode[node.id] = door;
    }

    const alerts: AlertLogEntry[] = (alertsRes.data ?? []).map(
      (row: Record<string, unknown>, idx: number): AlertLogEntry => {
        const nodeCode = String(row.node_id ?? 'NODE-01').toUpperCase();
        const node = NODE_BY_CODE.get(nodeCode) ?? SENSOR_NODES[0];
        const sensorKey = inferSensorKeyFromName(row.sensor_name);
        const meta = SENSOR_METADATA[sensorKey];
        const levelRaw = String(row.level ?? 'WASPADA').toUpperCase();
        const status: Exclude<SensorStatus, 'normal'> =
          levelRaw === 'BAHAYA' || levelRaw === 'DANGER' ? 'danger' : 'warning';

        return {
          id: String(row.id ?? `sb-alert-${idx}`),
          timestamp: formatDbTimestamp(row.created_at),
          nodeId: node.id,
          nodeCode: node.code,
          nodeName: node.name,
          nodeLocationTag: `${node.code} • ${node.coordinates.lat.toFixed(4)}, ${node.coordinates.lng.toFixed(4)} • ${node.depth}`,
          coordinatesText: `${node.coordinates.lat.toFixed(4)}, ${node.coordinates.lng.toFixed(4)}`,
          sensorKey,
          sensorName: String(row.sensor_name ?? meta.label),
          value: Number(row.value ?? 0),
          unit: meta.unit,
          thresholdValue: Number(row.threshold ?? 0),
          status,
        };
      }
    );

    const accessLogs: RfidAccessLogEntry[] = (rfidRes.data ?? []).map(
      (row: Record<string, unknown>, idx: number) => {
        const nodeCode = String(row.node_id ?? 'NODE-01').toUpperCase();
        const node = NODE_BY_CODE.get(nodeCode) ?? SENSOR_NODES[0];
        const doorRaw = String(row.door_status ?? 'LOCKED').toUpperCase();
        const door: DoorStatus = doorRaw === 'OPEN' ? 'OPEN' : 'LOCKED';
        const resultRaw = String(
          row.access_result ?? (door === 'OPEN' ? 'DITERIMA' : 'DITOLAK')
        ).toUpperCase();

        return {
          id: String(row.id ?? `sb-rfid-${idx}`),
          timestamp: formatDbTimestamp(row.created_at),
          nodeId: node.id,
          nodeCode: node.code,
          nodeName: node.name,
          nodeLocationTag: `${node.code} • ${node.coordinates.lat.toFixed(4)}, ${node.coordinates.lng.toFixed(4)} • ${node.depth}`,
          coordinatesText: `${node.coordinates.lat.toFixed(4)}, ${node.coordinates.lng.toFixed(4)}`,
          door,
          accessResult: resultRaw === 'DITERIMA' ? 'DITERIMA' : 'DITOLAK',
          mq4Value: 0,
        };
      }
    );

    const savedRow = settingsRes.data?.[0] as Record<string, unknown> | undefined;
    const savedThresholds = savedRow
      ? parseThresholdsRecord(savedRow.thresholds)
      : null;

    return {
      syncState: {
        status: 'connected',
        message: 'Terhubung (Mode baca riwayat & simpan pengaturan; penulisan log oleh ESP32)',
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
        message: err instanceof Error ? err.message : 'Koneksi Supabase gagal',
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

export async function saveThresholdsToSupabase(
  thresholds: ThresholdMap
): Promise<SupabaseSyncState | null> {
  try {
    const { error } = await supabase.from('settings').upsert({
      id: 'default_thresholds',
      thresholds,
      updated_at: new Date().toISOString(),
    });
    if (error) return mapSupabaseError(error);
    return {
      status: 'connected',
      message: 'Ambang batas tersimpan di Supabase',
    };
  } catch {
    return null;
  }
}
