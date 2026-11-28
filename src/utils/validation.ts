import { DEFAULT_THRESHOLDS, SENSOR_METADATA, SENSOR_ORDER } from '../constants/sensors';
import { ThresholdMap } from '../types/sensor';

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"'`]/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

export function sanitizeText(
  raw: unknown,
  fallback = '',
  maxLen = 64
): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
}

export function toClampedFiniteNumber(
  raw: unknown,
  min: number,
  max: number
): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

export function validateThresholdRecord(raw: unknown): ThresholdMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const parsed = { ...DEFAULT_THRESHOLDS };

  for (const key of SENSOR_ORDER) {
    const entry = obj[key];
    if (!entry || typeof entry !== 'object') return null;
    const meta = SENSOR_METADATA[key];
    const w = toClampedFiniteNumber(
      (entry as Record<string, unknown>).warning,
      meta.min,
      meta.max
    );
    const d = toClampedFiniteNumber(
      (entry as Record<string, unknown>).danger,
      meta.min,
      meta.max
    );
    if (w === null || d === null || w >= d) return null;
    parsed[key] = { warning: w, danger: d };
  }

  return parsed;
}
