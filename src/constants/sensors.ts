import { SensorKey, SensorMeta, SensorStatus, ThresholdMap } from '../types/sensor';

export const SENSOR_ORDER: SensorKey[] = ['mq4', 'mq135', 'temperature', 'humidity'];

export const SENSOR_METADATA: Record<SensorKey, SensorMeta> = {
  mq4: {
    key: 'mq4',
    code: 'MQ-4',
    label: 'MQ-4',
    sublabel: 'Gas Metana (CH₄)',
    unit: 'ppm',
    min: 0,
    max: 2000,
    step: 10,
    decimals: 0,
    chartColor: '#2563EB',
    actionAdvice: {
      warning: 'Periksa segel pipa gas dan tingkatkan sirkulasi exhaust fan.',
      danger: 'Segera tutup katup sumber gas, evakuasi area, dan aktifkan ventilasi darurat!',
    },
  },
  mq135: {
    key: 'mq135',
    code: 'MQ-135',
    label: 'MQ-135',
    sublabel: 'Kualitas Udara (VOC/CO₂)',
    unit: 'ppm',
    min: 0,
    max: 1000,
    step: 10,
    decimals: 0,
    chartColor: '#0F766E',
    actionAdvice: {
      warning: 'Aktifkan blower sirkulasi udara segar untuk menurunkan konsentrasi polutan.',
      danger: 'Kualitas udara kritis! Hentikan aktivitas proses kimia dan buka ventilasi penuh.',
    },
  },
  temperature: {
    key: 'temperature',
    code: 'DHT11',
    label: 'DHT11 - Suhu',
    sublabel: 'Temperatur Ruang',
    unit: '°C',
    min: 0,
    max: 60,
    step: 0.5,
    decimals: 1,
    chartColor: '#D97706',
    actionAdvice: {
      warning: 'Periksa sistem pendingin HVAC dan beban kerja peralatan di ruangan.',
      danger: 'Suhu berlebih! Aktifkan pendingin cadangan dan periksa potensi overheat perangkat.',
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
      warning: 'Aktifkan dehumidifier untuk mencegah kondensasi pada panel elektronik.',
      danger: 'Kelembapan ekstrem! Lindungi modul elektronik sensitif dan periksa kebocoran uap/air.',
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
export const MAX_ALERT_LOGS = 60;
export const POLL_INTERVAL_MS = 2000;

export function evaluateSensorStatus(
  value: number,
  threshold: { warning: number; danger: number }
): SensorStatus {
  if (value >= threshold.danger) return 'danger';
  if (value >= threshold.warning) return 'warning';
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
