import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Lock,
  Radio,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DEFAULT_THRESHOLDS,
  MQTT_BROKER_URL,
  MQTT_TOPIC,
  NODE_OFFLINE_TIMEOUT_MS,
  SENSOR_METADATA,
  SENSOR_NODES,
  SENSOR_ORDER,
  formatNodeLocation,
} from '../constants/sensors';
import { useMonitoring } from '../context/MonitoringContext';
import { SensorKey, ThresholdMap } from '../types/sensor';

export function SettingsPage() {
  const {
    thresholds,
    updateThresholds,
    isOperatorUnlocked,
    lockOperator,
    requestOperatorAction,
    connectionState,
    onlineNodeCount,
    sampleCount,
    supabaseSync,
    recheckSupabase,
  } = useMonitoring();

  const [draft, setDraft] = useState<ThresholdMap>(thresholds);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<boolean>(false);

  useEffect(() => {
    setDraft(thresholds);
  }, [thresholds]);

  const handleFieldChange = (
    key: SensorKey,
    field: 'warning' | 'danger',
    rawValue: string
  ) => {
    const parsed = Number(rawValue);
    setDraft((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: Number.isNaN(parsed) ? 0 : parsed,
      },
    }));
    setErrorMsg(null);
    setSavedBanner(false);
  };

  const handleResetDefaults = () => {
    if (!isOperatorUnlocked) return;
    setDraft(DEFAULT_THRESHOLDS);
    updateThresholds(DEFAULT_THRESHOLDS);
    setErrorMsg(null);
    setSavedBanner(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOperatorUnlocked) {
      requestOperatorAction('unlock-only');
      return;
    }

    for (const key of SENSOR_ORDER) {
      const meta = SENSOR_METADATA[key];
      const { warning, danger } = draft[key];

      if (!Number.isFinite(warning) || !Number.isFinite(danger)) {
        setErrorMsg(`Nilai ambang batas ${meta.label} harus berupa angka valid.`);
        return;
      }
      if (warning < meta.min || danger > meta.max) {
        setErrorMsg(
          `Ambang batas ${meta.label} harus berada dalam rentang ${meta.min} – ${meta.max} ${meta.unit}.`
        );
        return;
      }
      if (warning >= danger) {
        setErrorMsg(
          `Pada ${meta.label}, batas Waspada (${warning}) harus lebih kecil dari batas Bahaya (${danger}).`
        );
        return;
      }
    }

    updateThresholds(draft);
    setErrorMsg(null);
    setSavedBanner(true);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto lab-scroll">
      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-3">
        {/* Threshold Configuration Card */}
        <section className="bg-white border border-[#E2E5EA] rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E5EA] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#64748B]" />
              <div>
                <h2 className="text-sm font-semibold text-[#1E293B]">
                  Pengaturan Ambang Batas Sensor
                </h2>
                <p className="text-[11px] text-[#64748B]">
                  Berlaku real-time untuk seluruh node bawah tanah (MQ-4, MQ-135, DHT11).
                </p>
              </div>
            </div>

            {isOperatorUnlocked ? (
              <button
                type="button"
                onClick={lockOperator}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#BBF7D0] bg-[#F0FDF4] text-xs font-medium text-[#15803D] cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Akses Terbuka • Kunci</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => requestOperatorAction('unlock-only')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#1E293B] bg-[#1E293B] hover:bg-[#334155] text-xs font-medium text-white cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Buka Kunci (PIN: 1234)</span>
              </button>
            )}
          </div>

          {!isOperatorUnlocked && (
            <div className="mx-4 mt-3 px-3 py-2 rounded border border-[#FDE68A] bg-[#FFFBEB] text-xs text-[#B45309] flex items-center justify-between gap-2">
              <span>
                Form dalam mode <strong>read-only</strong>. Buka Mode Operator untuk mengubah ambang batas.
              </span>
              <Lock className="w-3.5 h-3.5 shrink-0" />
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SENSOR_ORDER.map((key) => {
                const meta = SENSOR_METADATA[key];
                const value = draft[key];

                return (
                  <div
                    key={key}
                    className="p-3 rounded border border-[#E2E5EA] bg-[#F4F5F7]/50 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-semibold text-[#1E293B]">
                          {meta.label}
                        </span>
                        <span className="block text-[11px] text-[#64748B]">
                          {meta.sublabel}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono-tabular text-[#64748B]">
                        {meta.min}–{meta.max} {meta.unit}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="block">
                        <span className="block text-[11px] font-medium text-[#B45309] mb-1">
                          Waspada ({meta.unit})
                        </span>
                        <input
                          type="number"
                          min={meta.min}
                          max={meta.max}
                          step={meta.step}
                          disabled={!isOperatorUnlocked}
                          value={value.warning}
                          onChange={(e) =>
                            handleFieldChange(key, 'warning', e.target.value)
                          }
                          className="w-full px-2.5 py-1.5 rounded border border-[#E2E5EA] bg-white disabled:bg-[#F4F5F7] disabled:text-[#64748B] text-xs font-mono-tabular text-[#1E293B] focus:outline-none focus:border-[#B45309]"
                        />
                      </label>

                      <label className="block">
                        <span className="block text-[11px] font-medium text-[#B91C1C] mb-1">
                          Bahaya ({meta.unit})
                        </span>
                        <input
                          type="number"
                          min={meta.min}
                          max={meta.max}
                          step={meta.step}
                          disabled={!isOperatorUnlocked}
                          value={value.danger}
                          onChange={(e) =>
                            handleFieldChange(key, 'danger', e.target.value)
                          }
                          className="w-full px-2.5 py-1.5 rounded border border-[#E2E5EA] bg-white disabled:bg-[#F4F5F7] disabled:text-[#64748B] text-xs font-mono-tabular text-[#1E293B] focus:outline-none focus:border-[#B91C1C]"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            {errorMsg && (
              <div className="px-3 py-2 rounded border border-[#FECACA] bg-[#FEF2F2] text-xs text-[#B91C1C]">
                {errorMsg}
              </div>
            )}

            {savedBanner && (
              <div className="px-3 py-2 rounded border border-[#BBF7D0] bg-[#F0FDF4] text-xs text-[#15803D] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Pengaturan ambang batas berhasil disimpan dan diterapkan real-time.</span>
              </div>
            )}

            <div className="pt-2 border-t border-[#E2E5EA] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={!isOperatorUnlocked}
                onClick={handleResetDefaults}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#E2E5EA] bg-white hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-[#64748B] hover:text-[#1E293B] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Default</span>
              </button>

              <button
                type="submit"
                disabled={!isOperatorUnlocked}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded border border-[#1E293B] bg-[#1E293B] hover:bg-[#334155] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-white cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Ambang Batas</span>
              </button>
            </div>
          </form>
        </section>

        {/* Technical MQTT & Node Registry Info */}
        <section className="bg-white border border-[#E2E5EA] rounded-md shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[#E2E5EA] flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#64748B]" />
            <div>
              <h2 className="text-sm font-semibold text-[#1E293B]">
                Informasi Teknis Koneksi MQTT
              </h2>
              <p className="text-[11px] text-[#64748B]">
                Parameter protokol WebSocket & pemantauan heartbeat node.
              </p>
            </div>
          </div>

          <div className="p-4 space-y-3 text-xs">
            <dl className="divide-y divide-[#E2E5EA] border border-[#E2E5EA] rounded bg-[#F4F5F7]/40">
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <dt className="text-[#64748B]">Broker WebSocket</dt>
                <dd className="font-mono-tabular font-semibold text-[#1E293B] text-right break-all">
                  {MQTT_BROKER_URL}
                </dd>
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <dt className="text-[#64748B]">Topik Subscribe</dt>
                <dd className="font-mono-tabular font-semibold text-[#1E293B]">
                  {MQTT_TOPIC}
                </dd>
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <dt className="text-[#64748B]">Status Koneksi</dt>
                <dd className="font-mono-tabular font-semibold">
                  <span
                    className={
                      connectionState === 'connected'
                        ? 'text-[#15803D]'
                        : connectionState === 'connecting'
                          ? 'text-[#B45309]'
                          : 'text-[#B91C1C]'
                    }
                  >
                    {connectionState.toUpperCase()}
                  </span>
                </dd>
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <dt className="text-[#64748B]">Heartbeat Timeout</dt>
                <dd className="font-mono-tabular font-semibold text-[#1E293B]">
                  {NODE_OFFLINE_TIMEOUT_MS / 1000} detik (cek tiap 1 dtk)
                </dd>
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <dt className="text-[#64748B]">Node Online / Sampel</dt>
                <dd className="font-mono-tabular font-semibold text-[#1E293B]">
                  {onlineNodeCount}/{SENSOR_NODES.length} aktif • #{sampleCount}
                </dd>
              </div>
              <div className="px-3 py-2 flex items-start justify-between gap-2">
                <div>
                  <dt className="text-[#64748B]">Database Supabase</dt>
                  <button
                    type="button"
                    onClick={recheckSupabase}
                    className="mt-1 px-2 py-0.5 rounded border border-[#E2E5EA] bg-white hover:bg-[#F8FAFC] text-[10px] font-medium text-[#1E293B] cursor-pointer"
                  >
                    Uji Koneksi Ulang
                  </button>
                </div>
                <dd className="font-mono-tabular text-right">
                  <span
                    className={`font-semibold ${
                      supabaseSync.status === 'connected'
                        ? 'text-[#15803D]'
                        : supabaseSync.status === 'rls-restricted' ||
                            supabaseSync.status === 'checking'
                          ? 'text-[#B45309]'
                          : 'text-[#B91C1C]'
                    }`}
                  >
                    {supabaseSync.status === 'connected'
                      ? 'TERHUBUNG'
                      : supabaseSync.status === 'rls-restricted'
                        ? 'RLS TERBATAS'
                        : supabaseSync.status === 'checking'
                          ? 'MEMERIKSA...'
                          : 'TERPUTUS'}
                  </span>
                  <span className="block text-[10px] text-[#64748B] max-w-[230px] break-words">
                    {supabaseSync.message}
                  </span>
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="text-xs font-semibold text-[#1E293B] mb-2">
                Daftar Titik Terowongan Terdaftar (KIPP IKN)
              </h3>
              <div className="border border-[#E2E5EA] rounded divide-y divide-[#E2E5EA]">
                {SENSOR_NODES.map((node) => (
                  <div
                    key={node.id}
                    className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div>
                      <span className="font-mono-tabular font-semibold text-[#1E293B] mr-1.5">
                        {node.code}
                      </span>
                      <span className="text-[#1E293B]">{node.name}</span>
                    </div>
                    <span className="font-mono-tabular text-[#64748B] shrink-0">
                      {formatNodeLocation(node)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
