# Firmware ESP32 — MUT-IKN Monitor (NODE-01 s/d NODE-04 & LCD)

Firmware disesuaikan dengan skematik & pemetaan pin Wokwi / ESP32 Anda:

## 1. NODE-01 (PCB 1 — Sensor + Akses RFID + Pintu)
File: `pcb1_sensor_node/pcb1_sensor_node.ino`
- **Topik MQTT:** `ikn/mut/node01` (`node_id: "NODE-01"`)
- **Pin:** `MQ4=34`, `MQ135=35`, `DHT=32`, `TOF=33`, `BUZZER=25`, `RFID=5`, `DOOR=26`.
- **Supabase:** Mengirim ke `sensor_logs`, `alert_logs`, dan `rfid_logs` via background task Core 0.

## 2. NODE-02, NODE-03, NODE-04 (Khusus Sensor, Tanpa RFID & Tanpa Pintu)
Masing-masing berdiri sendiri agar bisa langsung di-copy ke simulasi Wokwi / ESP32:
- **NODE-02 (`MUT Sektor Istana Garuda`):** `node02_sensor_only/node02_sensor_only.ino` → Topik `ikn/mut/node02`
- **NODE-03 (`MUT Simpang Titik Nol`):** `node03_sensor_only/node03_sensor_only.ino` → Topik `ikn/mut/node03`
- **NODE-04 (`MUT Kawasan Kemenko 1`):** `node04_sensor_only/node04_sensor_only.ino` → Topik `ikn/mut/node04`

| Komponen (Node 2–4) | Pin ESP32 | Keterangan |
|---|---|---|
| MQ-4 | `GPIO 34` | Analog input (`0..2000 ppm`) |
| MQ-135 | `GPIO 35` | Analog input (`0..1000 ppm`) |
| DHT22 / DHT11 | `GPIO 32` | Wokwi pakai `DHT22`; ganti `#define DHTTYPE DHT11` di hardware fisik |
| TOF200C | `GPIO 33` | Analog input (`0..200 cm`) |
| Buzzer | `GPIO 25` | `tone()` alarm `WASPADA` / `BAHAYA` |

- **MQTT Live:** Publish JSON tiap **1 detik** (`MQTT_INTERVAL_MS = 1000`, `setNoDelay(true)`, DHT tiap 2,5 detik).
- **Supabase 24/7:** Mengirim HTTP `POST` di background task Core 0 ke `sensor_logs` (tiap 5 detik / saat status berubah) dan `alert_logs` (saat `WASPADA`/`BAHAYA`), tanpa `rfid_logs`.

## 3. PCB 2 — Unit Monitor LCD (`pcb2_lcd_display/pcb2_lcd_display.ino`)
- Subscribe MQTT `ikn/mut/node01` dan menampilkan `Q4:... Q135:...` serta `STATUS | DOOR` pada LCD I2C `16x2` (`0x27`).
