# Firmware ESP32 — MUT-IKN Monitor (2 PCB)

Skematik perangkat keras dibagi menjadi 2 modul PCB:

## 1. PCB 1 — Node Sensor & Akses (`firmware/pcb1_sensor_node/pcb1_sensor_node.ino`)
Berisi: **ESP32, TOF200C (I2C VL53L0X), MQ-4, MQ-135, DHT11, RFID RC522, Buzzer, dan Baterai**.

| Komponen | Pin Default di Sketch | Keterangan |
|---|---|---|
| MQ-4 | `GPIO 34` | Analog input (ADC1) |
| MQ-135 | `GPIO 35` | Analog input (ADC1) |
| Baterai (ADC) | `GPIO 32` | Pembagi tegangan baterai |
| DHT11 | `GPIO 4` | Data digital |
| TOF200C (I2C) | `SDA=21`, `SCL=22` | Alamat I2C `0x29` (`Adafruit_VL53L0X`) |
| RFID RC522 (SPI) | `SS=5`, `RST=27`, `SCK=18`, `MISO=19`, `MOSI=23` | Modul pembaca kartu RFID |
| Buzzer | `GPIO 25` | Alarm gas & nada konfirmasi RFID |

- Mengirim telemetri MQTT real-time setiap **2 detik** ke `broker.emqx.io:1883` (`ikn/mut/NODE-01` s/d `NODE-04`).
- Mengirim HTTP `POST` langsung ke Supabase (`sensor_logs`, `alert_logs`, `rfid_logs`) agar database tetap terisi **24/7 meskipun dashboard web tidak dibuka**.

## 2. PCB 2 — Display Monitor LCD (`firmware/pcb2_lcd_display/pcb2_lcd_display.ino`)
Berisi: **ESP32, LCD I2C, dan Baterai**.

| Komponen | Pin Default di Sketch | Keterangan |
|---|---|---|
| LCD I2C (16x2 / 20x4) | `SDA=21`, `SCL=22` | Alamat default `0x27` (`LiquidCrystal_I2C`) |
| Baterai (ADC) | `GPIO 34` | Pembacaan daya baterai PCB 2 |

- Melakukan subscribe ke topik `ikn/mut/+` dari broker EMQX yang sama, otomatis memprioritaskan node berstatus `BAHAYA` / `WASPADA` di layar LCD, dan merotasi tampilan node tiap 3 detik saat kondisi normal.
