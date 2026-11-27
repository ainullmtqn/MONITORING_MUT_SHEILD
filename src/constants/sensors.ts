import {
  SensorKey,
  SensorMeta,
  SensorNodeConfig,
  SensorStatus,
  ThresholdMap,
} from '../types/sensor';

export const SENSOR_ORDER: SensorKey[] = ['mq4', 'mq135', 'temperature', 'humidity'];

export const SENSOR_NODES: SensorNodeConfig[] = [
  {
    id: 'node-01',
    code: 'NODE-01',
    name: 'MUT Sumbu Kebangsaan Barat',
    coordinates: { lat: -0.9652, lng: 116.7038 },
    depth: '-4.5 m',
    baseline: { mq4: 245, mq135: 170, temperature: 25.6, humidity: 64.0 },
  },
  {
    id: 'node-02',
    code: 'NODE-02',
    name: 'MUT Sektor Istana Garuda',
    coordinates: { lat: -0.9624, lng: 116.7045 },
    depth: '-5.0 m',
    baseline: { mq4: 310, mq135: 198, temperature: 26.2, humidity: 66.5 },
  },
  {
    id: 'node-03',
    code: 'NODE-03',
    name: 'MUT Simpang Titik Nol',
    coordinates: { lat: -0.9730, lng: 116.7094 },
    depth: '-4.0 m',
    baseline: { mq4: 275, mq135: 185, temperature: 25.1, humidity: 62.5 },
  },
  {
    id: 'node-04',
    code: 'NODE-04',
    name: 'MUT Kawasan Kemenko 1',
    coordinates: { lat: -0.9685, lng: 116.7062 },
    depth: '-4.8 m',
    baseline: { mq4: 205, mq135: 158, temperature: 25.8, humidity: 63.0 },
  },
];

export function formatCoordinates(node: SensorNodeConfig): string {
  return `${node.coordinates.lat.toFixed(4)}, ${node.coordinates.lng.toFixed(4)}`;
}

export function formatNodeLocation(node: SensorNodeConfig): string {
  return `${formatCoordinates(node)} • ${node.depth}`;
}

export function formatNodeLocationTag(node: SensorNodeConfig): string {
  return `${node.code} • ${formatNodeLocation(node)}`;
}

export const SENSOR_METADATA: Record<SensorKey, SensorMeta> = {
  mq4: {
    key: 'mq4',
    code: 'MQ-4',
    label: 'MQ-4',
    sublabel: 'Gas Metana (CH₄) Terowongan',
    unit: 'ppm',
    min: 0,
    max: 2000,
    step: 10,
    decimals: 0,
    chartColor: '#2563EB',
    actionAdvice: {
      warning: 'Aktifkan kipas ventilasi terowongan MUT dan periksa segel pipa gas utilitas.',
      danger: 'Kebocoran metana kritis! Isolasi katup sektor MUT, evakuasi teknisi, dan jalankan purge fan maksimal!',
    },
  },
  mq135: {
    key: 'mq135',
    code: 'MQ-135',
    label: 'MQ-135',
    sublabel: 'Kualitas Udara Terowongan (VOC/CO₂)',
    unit: 'ppm',
    min: 0,
    max: 1000,
    step: 10,
    decimals: 0,
    chartColor: '#16A34A',
    actionAdvice: {
      warning: 'Tingkatkan sirkulasi udara segar ke dalam segmen terowongan MUT.',
      danger: 'Akumulasi gas berbahaya di terowongan! Tunda akses teknisi dan buka damper ventilasi darurat.',
    },
  },
  temperature: {
    key: 'temperature',
    code: 'DHT11',
    label: 'DHT11 - Suhu',
    sublabel: 'Temperatur Terowongan MUT',
    unit: '°C',
    min: 0,
    max: 60,
    step: 0.5,
    decimals: 1,
    chartColor: '#D97706',
    actionAdvice: {
      warning: 'Periksa beban termal jalur kabel daya dan sistem aliran udara MUT.',
      danger: 'Suhu terowongan berlebih! Periksa potensi hotspot kabel utilitas dan aktifkan pendinginan.',
    },
  },
  humidity: {
    key: 'humidity',
    code: 'DHT11',
    label: 'DHT11 - Kelembapan',
    sublabel: 'Kelembapan Relatif (RH)',
    unit: '%',
    min: 0,
    max: 100,
    step: 1,
    decimals: 1,
    chartColor: '#475569',
    actionAdvice: {
      warning: 'Aktifkan unit dehumidifier terowongan untuk menjaga panel sensor dan kabel.',
      danger: 'Kelembapan ekstrem di segmen bawah tanah! Periksa rembesan air tanah dan proteksi panel.',
    },
  },
};

export const DEFAULT_THRESHOLDS: ThresholdMap = {
  mq4: { warning: 500, danger: 1000 },
  mq135: { warning: 350, danger: 700 },
  temperature: { warning: 32, danger: 38 },
  humidity: { warning: 75, danger: 85 },
};

export const MAX_HISTORY_POINTS = 20;
export const MAX_ALERT_LOGS = 80;
export const POLL_INTERVAL_MS = 2000;

export const STATUS_PRIORITY: Record<SensorStatus, number> = {
  normal: 1,
  warning: 2,
  danger: 3,
};

export function evaluateSensorStatus(
  value: number,
  threshold: { warning: number; danger: number }
): SensorStatus {
  if (value >= threshold.danger) return 'danger';
  if (value >= threshold.warning) return 'warning';
  return 'normal';
}

export function getHighestStatus(statuses: SensorStatus[]): SensorStatus {
  if (statuses.includes('danger')) return 'danger';
  if (statuses.includes('warning')) return 'warning';
  return 'normal';
}

export function formatSensorValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('id-ID', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
