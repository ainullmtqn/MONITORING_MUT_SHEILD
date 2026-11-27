export type SensorKey = 'mq4' | 'mq135' | 'temperature' | 'humidity';

export type SensorStatus = 'normal' | 'warning' | 'danger';

export type ChartFilter = 'all' | 'gas' | 'dht11';

export interface SensorThreshold {
  warning: number;
  danger: number;
}

export type ThresholdMap = Record<SensorKey, SensorThreshold>;

export interface SensorMeta {
  key: SensorKey;
  code: string;
  label: string;
  sublabel: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
  chartColor: string;
  actionAdvice: {
    warning: string;
    danger: string;
  };
}

export interface SensorReadingValues {
  mq4: number;
  mq135: number;
  temperature: number;
  humidity: number;
}

export interface TelemetryPoint extends SensorReadingValues {
  timestamp: string;
  epochMs: number;
}

export interface AlertLogEntry {
  id: string;
  timestamp: string;
  sensorKey: SensorKey;
  sensorName: string;
  value: number;
  unit: string;
  thresholdValue: number;
  status: Exclude<SensorStatus, 'normal'>;
}
