import { useCallback, useEffect, useRef, useState } from 'react';
import { SensorStatus } from '../types/sensor';

const AUDIO_STORAGE_KEY = 'mut_ikn_audio_enabled_v1';

function readInitialAudioPreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(AUDIO_STORAGE_KEY);
    if (raw === 'false') return false;
    if (raw === 'true') return true;
    return true;
  } catch {
    return true;
  }
}

interface UseAlertAudioReturn {
  isAudioEnabled: boolean;
  toggleAudio: () => void;
  triggerAlarmTone: (status: SensorStatus) => void;
}

/**
 * Custom hook that synthesizes clean laboratory-instrument alert tones
 * using the Web Audio API without external audio files, persisting preference
 * in localStorage.
 */
export function useAlertAudio(): UseAlertAudioReturn {
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(
    readInitialAudioPreference
  );
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastToneTimeRef = useRef<number>(0);

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume().catch(() => {
        // Browser may require a user gesture before resuming audio
      });
    }
    return audioCtxRef.current;
  }, []);

  useEffect(() => {
    const handleFirstInteraction = () => {
      if (isAudioEnabled) {
        ensureAudioContext();
      }
    };
    window.addEventListener('pointerdown', handleFirstInteraction, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
    };
  }, [ensureAudioContext, isAudioEnabled]);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const playBeep = useCallback(
    (frequency: number, startOffsetSec: number, durationSec: number, peakGain: number) => {
      const ctx = ensureAudioContext();
      if (!ctx || ctx.state !== 'running') return;

      const now = ctx.currentTime + startOffsetSec;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + durationSec + 0.02);
    },
    [ensureAudioContext]
  );

  const toggleAudio = useCallback(() => {
    setIsAudioEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AUDIO_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors in restricted modes
      }
      if (next) {
        const ctx = ensureAudioContext();
        if (ctx) {
          setTimeout(() => playBeep(660, 0, 0.08, 0.06), 30);
        }
      }
      return next;
    });
  }, [ensureAudioContext, playBeep]);

  const triggerAlarmTone = useCallback(
    (status: SensorStatus) => {
      if (!isAudioEnabled || status === 'normal') return;

      const nowMs = Date.now();
      const cooldownMs = status === 'danger' ? 3500 : 7500;
      if (nowMs - lastToneTimeRef.current < cooldownMs) return;
      lastToneTimeRef.current = nowMs;

      if (status === 'danger') {
        playBeep(1174.66, 0, 0.14, 0.12);
        playBeep(1174.66, 0.2, 0.14, 0.12);
      } else if (status === 'warning') {
        playBeep(880, 0, 0.14, 0.08);
      }
    },
    [isAudioEnabled, playBeep]
  );

  return {
    isAudioEnabled,
    toggleAudio,
    triggerAlarmTone,
  };
}
