import { ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { RfidToastNotification } from '../types/sensor';

interface RfidToastContainerProps {
  toasts: RfidToastNotification[];
  onDismiss: (id: string) => void;
}

export function RfidToastContainer({
  toasts,
  onDismiss,
}: RfidToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none px-3 sm:px-0"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto rounded-md border shadow-[0_2px_6px_rgba(15,23,42,0.08)] px-3.5 py-2.5 flex items-start justify-between gap-2.5 text-xs ${
            toast.granted
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
          }`}
        >
          <div className="flex items-start gap-2 min-w-0">
            {toast.granted ? (
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <p className="font-medium leading-snug">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="p-0.5 rounded hover:bg-black/5 shrink-0 cursor-pointer"
            aria-label="Tutup notifikasi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
