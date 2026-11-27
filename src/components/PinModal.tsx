import { Lock, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OPERATOR_PIN } from '../constants/sensors';

interface PinModalProps {
  isOpen: boolean;
  actionDescription: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function PinModal({
  isOpen,
  actionDescription,
  onClose,
  onSuccess,
}: PinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.trim() === OPERATOR_PIN) {
      onSuccess();
      onClose();
    } else {
      setError('PIN operator tidak valid. Silakan coba lagi.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/35 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
    >
      <div className="bg-white border border-[#E2E5EA] rounded-md shadow-[0_4px_12px_rgba(15,23,42,0.08)] w-full max-w-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E5EA] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#1E293B]" />
            <h2
              id="pin-modal-title"
              className="text-sm font-semibold text-[#1E293B]"
            >
              Verifikasi PIN Operator
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded border border-transparent hover:border-[#E2E5EA] hover:bg-[#F4F5F7] text-[#64748B] hover:text-[#1E293B] cursor-pointer"
            aria-label="Tutup modal PIN"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <p className="text-xs text-[#64748B]">
            Masukkan 4 digit PIN operator untuk{' '}
            <span className="font-medium text-[#1E293B]">{actionDescription}</span>.
          </p>

          <label className="block">
            <span className="block text-[11px] font-medium text-[#1E293B] mb-1">
              PIN Operator (4 Digit)
            </span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                setError(null);
              }}
              placeholder="••••"
              className="w-full px-3 py-2 rounded border border-[#E2E5EA] bg-white text-center text-base tracking-[0.4em] font-mono-tabular text-[#1E293B] focus:outline-none focus:border-[#1E293B]"
            />
          </label>

          <p className="text-[11px] font-mono-tabular text-[#64748B] bg-[#F4F5F7] border border-[#E2E5EA] rounded px-2.5 py-1.5">
            Catatan pengujian: PIN default operator adalah <strong>1234</strong>
          </p>

          {error && (
            <div className="px-2.5 py-1.5 rounded border border-[#FECACA] bg-[#FEF2F2] text-xs text-[#B91C1C]">
              {error}
            </div>
          )}

          <div className="pt-1 flex items-center justify-end gap-2">
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
              Buka Akses
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
