import { Lock, LockOpen } from 'lucide-react';
import { DoorStatus } from '../types/sensor';

interface DoorBadgeProps {
  door: DoorStatus;
}

export function DoorBadge({ door }: DoorBadgeProps) {
  const isOpen = door === 'OPEN';

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono-tabular font-semibold whitespace-nowrap ${
        isOpen
          ? 'bg-[#F0F9FF] border-[#BAE6FD] text-[#0369A1]'
          : 'bg-[#F4F5F7] border-[#E2E5EA] text-[#64748B]'
      }`}
      title={isOpen ? 'Pintu sektor MUT terbuka' : 'Pintu sektor MUT terkunci'}
    >
      {isOpen ? (
        <LockOpen className="w-2.5 h-2.5 shrink-0" />
      ) : (
        <Lock className="w-2.5 h-2.5 shrink-0" />
      )}
      <span>{isOpen ? 'TERBUKA' : 'TERKUNCI'}</span>
    </span>
  );
}
