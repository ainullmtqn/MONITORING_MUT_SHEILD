export type SensorKey = 'mq4' | 'mq135' | 'temperature' | 'humidity';

export type SensorStatus = 'normal' | 'warning' | 'danger';

export type NodeHealthStatus = SensorStatus | 'offline';

export type DoorStatus = 'OPEN' | 'LOCKED';

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

export interface MqttSensorPayload {
  node_id?: string;
  mq4?: number;
  mq135?: number;
  suhu?: number;
  kelembapan?: number;
  jarak?: number;
  rfid?: boolean;
  door?: string;
  battery?: number;
  status?: string;
}

export interface TelemetryPoint extends SensorReadingValues {
  timestamp: string;
  epochMs: number;
  jarak?: number;
  rfid?: boolean;
  door?: DoorStatus;
  battery?: number;
  deviceStatus?: string;
  mq4Source?: string;
  mq135Source?: string;
  temperatureSource?: string;
  humiditySource?: string;
}

export interface NodeCoordinates {
  lat: number;
  lng: number;
}

export interface SensorNodeConfig {
  id: string;
  code: string;
  name: string;
  coordinates: NodeCoordinates;
  depth: string;
}

export interface SensorNodeState {
  config: SensorNodeConfig;
  latest: TelemetryPoint;
  history: TelemetryPoint[];
  statuses: Record<SensorKey, SensorStatus>;
  overallStatus: NodeHealthStatus;
  isOnline: boolean;
  lastUpdatedMs: number | null;
  secondsSinceUpdate: number | null;
  battery: number | null;
  door: DoorStatus;
}

export interface PeakSensorReading {
  value: number;
  status: SensorStatus;
  sourceNode: SensorNodeConfig;
}

export type PeakReadingsMap = Record<SensorKey, PeakSensorReading>;

export interface AlertLogEntry {
  id: string;
  timestamp: string;
  nodeId: string;
  nodeCode: string;
  nodeName: string;
  nodeLocationTag: string;
  coordinatesText: string;
  sensorKey: SensorKey;
  sensorName: string;
  value: number;
  unit: string;
  thresholdValue: number;
  status: Exclude<SensorStatus, 'normal'>;
}

export interface RfidAccessLogEntry {
  id: string;
  timestamp: string;
  nodeId: string;
  nodeCode: string;
  nodeName: string;
  nodeLocationTag: string;
  coordinatesText: string;
  door: DoorStatus;
  accessResult: 'DITERIMA' | 'DITOLAK';
  mq4Value: number;
}

export interface RfidToastNotification {
  id: string;
  nodeCode: string;
  granted: boolean;
  message: string;
}
