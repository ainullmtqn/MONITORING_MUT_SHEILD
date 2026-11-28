-- ============================================================================
-- MUT-IKN Monitor — Supabase Security Hardening (Row Level Security & Realtime)
-- Jalankan skrip ini di Supabase Dashboard -> SQL Editor.
-- ============================================================================

-- 1. Pastikan skema public bisa diakses untuk query baca
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2. Cabut izin UPDATE dan DELETE dari frontend (anon) agar riwayat tidak bisa
--    diubah atau dihapus dari browser publik.
REVOKE UPDATE, DELETE, TRUNCATE ON public.sensor_logs, public.alert_logs, public.rfid_logs, public.settings FROM anon;
GRANT SELECT ON public.sensor_logs, public.alert_logs, public.rfid_logs, public.settings TO anon;

-- Jika ESP32 mengirim langsung memakai publishable/anon key + header x-device-token,
-- role anon hanya butuh INSERT pada 3 tabel log di bawah (tetap dibatasi policy RLS):
GRANT INSERT ON public.sensor_logs, public.alert_logs, public.rfid_logs TO anon;

-- 3. Aktifkan Row Level Security (RLS) pada semua tabel
ALTER TABLE public.sensor_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfid_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings    ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama yang terlalu longgar jika sebelumnya pernah dibuat
DROP POLICY IF EXISTS "anon_all_sensor_logs" ON public.sensor_logs;
DROP POLICY IF EXISTS "anon_all_alert_logs"  ON public.alert_logs;
DROP POLICY IF EXISTS "anon_all_rfid_logs"   ON public.rfid_logs;
DROP POLICY IF EXISTS "anon_all_settings"    ON public.settings;

-- 4. Policy SELECT (Read-Only) untuk Frontend Web Dashboard
CREATE POLICY "web_select_sensor_logs"
  ON public.sensor_logs FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "web_select_alert_logs"
  ON public.alert_logs FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "web_select_rfid_logs"
  ON public.rfid_logs FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "web_select_settings"
  ON public.settings FOR SELECT TO anon, authenticated
  USING (true);

-- 5. Policy INSERT khusus perangkat ESP32 yang valid (memverifikasi header x-device-token
--    dan validasi rentang nilai dasar agar data sampah tidak bisa masuk).
--    Ganti 'GANTI_TOKEN_PERANGKAT_IKN_2026' dengan token rahasia milik perangkat Anda,
--    lalu tambahkan header `x-device-token` pada HTTP POST di ESP32.
--    (Atau gunakan Supabase service_role / Edge Function dari backend bridge.)
CREATE POLICY "device_insert_sensor_logs"
  ON public.sensor_logs FOR INSERT TO anon
  WITH CHECK (
    coalesce(current_setting('request.headers', true)::json->>'x-device-token', '') = 'GANTI_TOKEN_PERANGKAT_IKN_2026'
    AND node_id IN ('NODE-01', 'NODE-02', 'NODE-03', 'NODE-04')
    AND mq4 BETWEEN 0 AND 2000
    AND mq135 BETWEEN 0 AND 1000
    AND suhu BETWEEN -20 AND 100
    AND kelembapan BETWEEN 0 AND 100
  );

CREATE POLICY "device_insert_alert_logs"
  ON public.alert_logs FOR INSERT TO anon
  WITH CHECK (
    coalesce(current_setting('request.headers', true)::json->>'x-device-token', '') = 'GANTI_TOKEN_PERANGKAT_IKN_2026'
    AND node_id IN ('NODE-01', 'NODE-02', 'NODE-03', 'NODE-04')
    AND level IN ('WASPADA', 'BAHAYA')
  );

CREATE POLICY "device_insert_rfid_logs"
  ON public.rfid_logs FOR INSERT TO anon
  WITH CHECK (
    coalesce(current_setting('request.headers', true)::json->>'x-device-token', '') = 'GANTI_TOKEN_PERANGKAT_IKN_2026'
    AND node_id IN ('NODE-01', 'NODE-02', 'NODE-03', 'NODE-04')
    AND door_status IN ('OPEN', 'LOCKED')
    AND access_result IN ('DITERIMA', 'DITOLAK')
  );

-- 6. Aktifkan Supabase Realtime (postgres_changes) untuk tabel log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sensor_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sensor_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'alert_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alert_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rfid_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rfid_logs;
  END IF;
END $$;
