import { SENSOR_METADATA, SENSOR_NODES } from '../constants/sensors';
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

export async function checkAndLoadSupabaseInitialData(): Promise<{
  syncState: SupabaseSyncState;
  alerts: AlertLogEntry[];
  accessLogs: RfidAccessLogEntry[];
  thresholds: ThresholdMap | null;
}> {
  try {
    const [alertsRes, rfidRes, settingsRes] = await Promise.all([
      supabase.from('alert_logs').select('*').limit(40),
      supabase.from('rfid_logs').select('*').limit(40),
      supabase.from('settings').select('*').limit(10),
    ]);

    const firstError = alertsRes.error || rfidRes.error || settingsRes.error;
    if (firstError) {
      return {
        syncState: mapSupabaseError(firstError),
        alerts: [],
        accessLogs: [],
        thresholds: null,
      };
    }

    const alerts: AlertLogEntry[] = (alertsRes.data ?? [])
      .map((row: Record<string, unknown>, idx: number): AlertLogEntry | null => {
        const nodeCode = String(row.node_id ?? 'NODE-01').toUpperCase();
        const node = NODE_BY_CODE.get(nodeCode) ?? SENSOR_NODES[0];
        const rawKey = String(row.sensor_key ?? row.sensor ?? 'mq4').toLowerCase();
        const sensorKey: SensorKey =
          rawKey === 'mq135' || rawKey === 'temperature' || rawKey === 'humidity'
            ? rawKey
            : rawKey === 'suhu'
              ? 'temperature'
              : rawKey === 'kelembapan'
                ? 'humidity'
                : 'mq4';
        const meta = SENSOR_METADATA[sensorKey];
        const statusRaw = String(row.status ?? 'WASPADA').toUpperCase();
        const status: Exclude<SensorStatus, 'normal'> =
          statusRaw === 'BAHAYA' || statusRaw === 'DANGER' ? 'danger' : 'warning';
        const created = row.created_at ? new Date(String(row.created_at)) : new Date();
        const ts = Number.isNaN(created.getTime())
          ? '--:--:--'
          : created.toLocaleTimeString('id-ID', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

        return {
          id: String(row.id ?? `sb-alert-${idx}`),
          timestamp: ts,
          nodeId: node.id,
          nodeCode: node.code,
          nodeName: node.name,
          nodeLocationTag: `${node.code} • ${node.coordinates.lat.toFixed(4)}, ${node.coordinates.lng.toFixed(4)} • ${node.depth}`,
          coordinatesText: `${node.coordinates.lat.toFixed(4)}, ${node.coordinates.lng.toFixed(4)}`,
          sensorKey,
          sensorName: meta.label,
          value: Number(row.value ?? 0),
          unit: meta.unit,
          thresholdValue: Number(row.threshold_value ?? 0),
          status,
        };
      })
      .filter((x): x is AlertLogEntry => x !== null);

    const accessLogs: RfidAccessLogEntry[] = (rfidRes.data ?? []).map(
      (row: Record<string, unknown>, idx: number) => {
        const nodeCode = String(row.node_id ?? 'NODE-01').toUpperCase();
        const node = NODE_BY_CODE.get(nodeCode) ?? SENSOR_NODES[0];
        const doorRaw = String(row.door ?? 'LOCKED').toUpperCase();
        const door: DoorStatus = doorRaw === 'OPEN' ? 'OPEN' : 'LOCKED';
        const created = row.created_at ? new Date(String(row.created_at)) : new Date();
        const ts = Number.isNaN(created.getTime())
          ? '--:--:--'
          : created.toLocaleTimeString('id-ID', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

        return {
          id: String(row.id ?? `sb-rfid-${idx}`),
          timestamp: ts,
          nodeId: node.id,
          nodeCode: node.code,
          nodeName: node.name,
          nodeLocationTag: `${node.code} • ${node.coordinates.lat.toFixed(4)}, ${node.coordinates.lng.toFixed(4)} • ${node.depth}`,
          coordinatesText: `${node.coordinates.lat.toFixed(4)}, ${node.coordinates.lng.toFixed(4)}`,
          door,
          accessResult: door === 'OPEN' ? 'DITERIMA' : 'DITOLAK',
          mq4Value: Number(row.mq4 ?? 0),
        };
      }
    );

    return {
      syncState: {
        status: 'connected',
        message: 'Terhubung ke Supabase (sensor_logs, alert_logs, rfid_logs, settings)',
      },
      alerts,
      accessLogs,
      thresholds: null,
    };
  } catch (err) {
    return {
      syncState: {
        status: 'error',
        message: err instanceof Error ? err.message : 'Koneksi Supabase gagal',
      },
      alerts: [],
      accessLogs: [],
      thresholds: null,
    };
  }
}

export async function insertSensorLogToSupabase(
  node: SensorNodeConfig,
  point: TelemetryPoint,
  overallStatus: SensorStatus
): Promise<SupabaseSyncState | null> {
  try {
    const { error } = await supabase.from('sensor_logs').insert({
      node_id: node.code,
      mq4: point.mq4,
      mq135: point.mq135,
      suhu: point.temperature,
      kelembapan: point.humidity,
      jarak: point.jarak ?? null,
      door: point.door ?? 'LOCKED',
      battery: point.battery ?? null,
      status:
        overallStatus === 'danger'
          ? 'BAHAYA'
          : overallStatus === 'warning'
            ? 'WASPADA'
            : 'NORMAL',
    });
    if (error) return mapSupabaseError(error);
    return {
      status: 'connected',
      message: 'Sinkronisasi Supabase aktif',
    };
  } catch {
    return null;
  }
}

export async function insertAlertLogToSupabase(
  entry: AlertLogEntry
): Promise<void> {
  try {
    await supabase.from('alert_logs').insert({
      node_id: entry.nodeCode,
      sensor_key: entry.sensorKey,
      sensor_name: entry.sensorName,
      value: entry.value,
      threshold_value: entry.thresholdValue,
      status: entry.status === 'danger' ? 'BAHAYA' : 'WASPADA',
    });
  } catch {
    // Non-blocking background sync
  }
}

export async function insertRfidLogToSupabase(
  entry: RfidAccessLogEntry
): Promise<void> {
  try {
    await supabase.from('rfid_logs').insert({
      node_id: entry.nodeCode,
      door: entry.door,
      access_result: entry.accessResult,
      mq4: entry.mq4Value,
    });
  } catch {
    // Non-blocking background sync
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
