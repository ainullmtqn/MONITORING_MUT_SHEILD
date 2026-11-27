import { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import {
  DEFAULT_THRESHOLDS,
  SENSOR_METADATA,
  SENSOR_ORDER,
} from '../constants/sensors';
import { SensorKey, ThresholdMap } from '../types/sensor';

interface ThresholdModalProps {
  isOpen: boolean;
  thresholds: ThresholdMap;
  onClose: () => void;
  onSave: (next: ThresholdMap) => void;
}

export function ThresholdModal({
  isOpen,
  thresholds,
  onClose,
  onSave,
}: ThresholdModalProps) {
  const [draft, setDraft] = useState<ThresholdMap>(thresholds);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(thresholds);
      setErrorMsg(null);
    }
  }, [isOpen, thresholds]);

  if (!isOpen) return null;

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
  };

  const handleResetDefaults = () => {
    setDraft(DEFAULT_THRESHOLDS);
    setErrorMsg(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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

    onSave(draft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/35 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="threshold-modal-title"
    >
      <div className="bg-white border border-[#E2E5EA] rounded-md w-full max-w-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E5EA] flex items-center justify-between">
          <div>
            <h2
              id="threshold-modal-title"
              className="text-sm font-semibold text-[#1E293B]"
            >
              Pengaturan Ambang Batas Sensor
            </h2>
            <p className="text-[11px] text-[#64748B]">
              Konfigurasi nilai pemicu status Waspada dan Bahaya secara langsung.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded border border-transparent hover:border-[#E2E5EA] hover:bg-[#F4F5F7] text-[#64748B] hover:text-[#1E293B] cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-3 max-h-[68vh] overflow-y-auto lab-scroll">
            {SENSOR_ORDER.map((key) => {
              const meta = SENSOR_METADATA[key];
              const value = draft[key];

              return (
                <div
                  key={key}
                  className="p-3 rounded border border-[#E2E5EA] bg-[#F4F5F7]/50"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <span className="text-xs font-semibold text-[#1E293B]">
                        {meta.label}
                      </span>
                      <span className="text-[11px] text-[#64748B] ml-2">
                        {meta.sublabel}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono-tabular text-[#64748B]">
                      Rentang: {meta.min}–{meta.max} {meta.unit}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-[11px] font-medium text-[#B45309] mb-1">
                        Batas Waspada ({meta.unit})
                      </span>
                      <input
                        type="number"
                        min={meta.min}
                        max={meta.max}
                        step={meta.step}
                        value={value.warning}
                        onChange={(e) =>
                          handleFieldChange(key, 'warning', e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 rounded border border-[#E2E5EA] bg-white text-xs font-mono-tabular text-[#1E293B] focus:outline-none focus:border-[#B45309]"
                      />
                    </label>

                    <label className="block">
                      <span className="block text-[11px] font-medium text-[#B91C1C] mb-1">
                        Batas Bahaya ({meta.unit})
                      </span>
                      <input
                        type="number"
                        min={meta.min}
                        max={meta.max}
                        step={meta.step}
                        value={value.danger}
                        onChange={(e) =>
                          handleFieldChange(key, 'danger', e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 rounded border border-[#E2E5EA] bg-white text-xs font-mono-tabular text-[#1E293B] focus:outline-none focus:border-[#B91C1C]"
                      />
                    </label>
                  </div>
                </div>
              );
            })}

            {errorMsg && (
              <div className="px-3 py-2 rounded border border-[#FECACA] bg-[#FEF2F2] text-xs text-[#B91C1C]">
                {errorMsg}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-[#E2E5EA] bg-[#F4F5F7]/60 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#E2E5EA] bg-white hover:bg-[#F8FAFC] text-xs font-medium text-[#64748B] hover:text-[#1E293B] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Default</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded border border-[#E2E5EA] bg-white hover:bg-[#F8FAFC] text-xs font-medium text-[#1E293B] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded border border-[#1E293B] bg-[#1E293B] hover:bg-[#334155] text-xs font-medium text-white cursor-pointer"
              >
                Simpan Pengaturan
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
