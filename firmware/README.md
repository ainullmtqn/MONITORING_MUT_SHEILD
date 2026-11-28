# Firmware ESP32 — MUT-IKN Monitor (2 PCB)

Firmware disesuaikan dengan skematik & pemetaan pin Wokwi / ESP32 Anda:

## 1. PCB 1 — Node Sensor & Akses (`pcb1_sensor_node/pcb1_sensor_node.ino`)
| Komponen | Pin ESP32 | Keterangan |
|---|---|---|
| MQ-4 | `GPIO 34` | Analog input (`0..2000 ppm`) |
| MQ-135 | `GPIO 35` | Analog input (`0..1000 ppm`) |
| DHT22 / DHT11 | `GPIO 32` | Wokwi pakai `DHT22`; ganti `#define DHTTYPE DHT11` di hardware fisik |
| TOF200C | `GPIO 33` | Analog input (`0..200 cm`) |
| Buzzer | `GPIO 25` | `tone()` alarm & nada akses RFID |
| RFID | `GPIO 5` | `INPUT_PULLUP` tombol trigger simulasi RFID |
| Relay / LED Pintu | `GPIO 26` | `HIGH` (`OPEN` 5 detik) / `LOW` (`LOCKED`) |

- **MQTT Live:** Publish JSON tepat tiap **1 detik** (`MQTT_INTERVAL_MS = 1000`) ke `broker.emqx.io:1883` topik `ikn/mut/node01` (dengan `setNoDelay(true)` dan pembacaan DHT terpisah tiap 2,5 detik).
- **Supabase 24/7:** Mengirim HTTP `POST` di background task Core 0 ke `sensor_logs` (tiap 5 detik atau saat status berubah), `alert_logs` (saat `WASPADA`/`BAHAYA`), dan `rfid_logs` (saat RFID di-tap).

## 2. PCB 2 — Unit Monitor LCD (`pcb2_lcd_display/pcb2_lcd_display.ino`)
- Subscribe MQTT `ikn/mut/node01` dan menampilkan `Q4:... Q135:...` serta `STATUS | DOOR` pada LCD I2C `16x2` (`0x27`).
