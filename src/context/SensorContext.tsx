import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PinModal } from '../components/PinModal';
import { useAlertAudio } from '../hooks/useAlertAudio';
import { useSensorStream, UseSensorStreamResult } from '../hooks/useSensorStream';
import { DashboardPage } from '../types/sensor';

export type ProtectedAction = 'unlock-only' | 'clear-alerts' | 'clear-access';

const ACTION_DESCRIPTIONS: Record<ProtectedAction, string> = {
  'unlock-only': 'mengaktifkan Mode Operator dan pengaturan sistem',
  'clear-alerts': 'membersihkan tabel Riwayat Peringatan Gas',
  'clear-access': 'membersihkan tabel Log Akses RFID',
};

export interface SensorContextValue extends UseSensorStreamResult {
  activePage: DashboardPage;
  setActivePage: (page: DashboardPage) => void;
  selectedNodeId: string;
  setSelectedNodeId: (nodeId: string) => void;
  focusNodeInMonitoring: (nodeId: string) => void;
  isAudioEnabled: boolean;
  toggleAudio: () => void;
  isOperatorUnlocked: boolean;
  lockOperator: () => void;
  requestOperatorAction: (action: ProtectedAction) => void;
  unreadAlertCount: number;
}

export const SensorContext = createContext<SensorContextValue | null>(null);

export function SensorProvider({ children }: { children: ReactNode }) {
  const [activePage, setActivePageState] = useState<DashboardPage>('monitoring');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('all');
  const [isOperatorUnlocked, setIsOperatorUnlocked] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<ProtectedAction | null>(null);
  const [unreadAlertCount, setUnreadAlertCount] = useState<number>(0);

  const { isAudioEnabled, toggleAudio, triggerAlarmTone } = useAlertAudio();
  const stream = useSensorStream(triggerAlarmTone);

  const prevAlertLengthRef = useRef<number>(0);
  const activePageRef = useRef<DashboardPage>(activePage);
  activePageRef.current = activePage;

  useEffect(() => {
    const currLen = stream.alertLogs.length;
    const prevLen = prevAlertLengthRef.current;

    if (currLen > prevLen && activePageRef.current !== 'logs') {
      setUnreadAlertCount((c) => c + (currLen - prevLen));
    } else if (currLen === 0) {
      setUnreadAlertCount(0);
    }

    prevAlertLengthRef.current = currLen;
  }, [stream.alertLogs.length]);

  const setActivePage = useCallback((page: DashboardPage) => {
    setActivePageState(page);
    if (page === 'logs') {
      setUnreadAlertCount(0);
    }
  }, []);

  const focusNodeInMonitoring = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setActivePageState('monitoring');
  }, []);

  const executeProtectedAction = useCallback(
    (action: ProtectedAction) => {
      if (action === 'clear-alerts') {
        stream.clearAlertLogs();
      } else if (action === 'clear-access') {
        stream.clearAccessLogs();
      }
    },
    [stream]
  );

  const requestOperatorAction = useCallback(
    (action: ProtectedAction) => {
      if (isOperatorUnlocked) {
        executeProtectedAction(action);
      } else {
        setPendingAction(action);
      }
    },
    [isOperatorUnlocked, executeProtectedAction]
  );

  const handlePinSuccess = useCallback(() => {
    setIsOperatorUnlocked(true);
    if (pendingAction) {
      executeProtectedAction(pendingAction);
      setPendingAction(null);
    }
  }, [pendingAction, executeProtectedAction]);

  const lockOperator = useCallback(() => {
    setIsOperatorUnlocked(false);
  }, []);

  return (
    <SensorContext.Provider
      value={{
        ...stream,
        activePage,
        setActivePage,
        selectedNodeId,
        setSelectedNodeId,
        focusNodeInMonitoring,
        isAudioEnabled,
        toggleAudio,
        isOperatorUnlocked,
        lockOperator,
        requestOperatorAction,
        unreadAlertCount,
      }}
    >
      {children}

      <PinModal
        isOpen={pendingAction !== null}
        actionDescription={
          pendingAction ? ACTION_DESCRIPTIONS[pendingAction] : ''
        }
        onClose={() => setPendingAction(null)}
        onSuccess={handlePinSuccess}
      />
    </SensorContext.Provider>
  );
}

export function useSensorContext(): SensorContextValue {
  const ctx = useContext(SensorContext);
  if (!ctx) {
    throw new Error('useSensorContext must be used within SensorProvider');
  }
  return ctx;
}
