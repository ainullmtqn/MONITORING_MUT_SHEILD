/**
 * MUT-IKN Monitor — Firmware PCB 1 (Node Sensor Lapangan + Akses RFID + Buzzer)
 *
 * Komponen PCB 1:
 * 1. ESP32
 * 2. TOF200C (VL53L0X Laser Distance, I2C addr 0x29)
 * 3. MQ-4 (Gas Metana CH4, Analog ADC)
 * 4. MQ-135 (Kualitas Udara VOC/CO2, Analog ADC)
 * 5. DHT11 (Suhu & Kelembapan)
 * 6. RFID RC522 (SPI)
 * 7. Buzzer (Alarm lokal & feedback RFID)
 * 8. Baterai (Pembacaan tegangan via pembagi tegangan ADC)
 *
 * Komunikasi:
 * - MQTT Publish tiap 2 detik ke `broker.emqx.io:1883` topik `ikn/mut/NODE-01`
 * - Supabase HTTP POST langsung (24/7 meski dashboard web ditutup):
 *   `sensor_logs` (tiap 15 dtk / perubahan status), `alert_logs`, `rfid_logs`
 *
 * Library Arduino IDE:
 * - PubSubClient (Nick O'Leary)
 * - ArduinoJson (Benoit Blanchon)
 * - DHT sensor library (Adafruit)
 * - Adafruit_VL53L0X (untuk TOF200C I2C)
 * - MFRC522 (GithubCommunity)
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_VL53L0X.h>
#include <DHT.h>
#include <SPI.h>
#include <MFRC522.h>

// ======================== KONFIGURASI JARINGAN & NODE ========================
const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";

const char* NODE_ID       = "NODE-01";         // Ubah untuk NODE-01 .. NODE-04
const char* MQTT_BROKER   = "broker.emqx.io";
const int   MQTT_PORT     = 1883;
const char* MQTT_TOPIC    = "ikn/mut/NODE-01"; // Harus sesuai dengan NODE_ID

// ======================== KONFIGURASI SUPABASE REST API ======================
const char* SUPABASE_URL  = "https://yhtvyongrbpmscvslgks.supabase.co";
const char* SUPABASE_KEY  = "sb_publishable_Ys8kCYOZyB5u5ze7yArtew_PKscjpK8";

// ======================== PIN HARDWARE PCB 1 =================================
// Sesuaikan nomor GPIO di bawah dengan jalur PCB 1 Anda
#define PIN_MQ4        34   // Analog Input (ADC1)
#define PIN_MQ135      35   // Analog Input (ADC1)
#define PIN_BAT_ADC    32   // Analog Input pembagi tegangan baterai (ADC1)
#define PIN_DHT        4    // Digital Data DHT11
#define DHTTYPE        DHT11

#define PIN_I2C_SDA    21   // SDA TOF200C
#define PIN_I2C_SCL    22   // SCL TOF200C

#define PIN_SS_RFID    5    // SDA / SS RC522
#define PIN_RST_RFID   27   // RST RC522 (SPI SCK=18, MISO=19, MOSI=23)

#define PIN_BUZZER     25   // Buzzer aktif/pasif
#define PIN_RELAY_DOOR 26   // Opsional jika ada solenoid/indikator pintu

// ======================== AMBANG BATAS DEFAULT ===============================
const float MQ4_WARNING   = 500.0;
const float MQ4_DANGER    = 1000.0;
const float MQ135_WARNING = 350.0;
const float MQ135_DANGER  = 700.0;
const float TEMP_WARNING  = 32.0;
const float TEMP_DANGER   = 38.0;
const float HUM_WARNING   = 75.0;
const float HUM_DANGER    = 85.0;

// ======================== INTERVAL WAKTU =====================================
const unsigned long MQTT_INTERVAL_MS     = 2000;   // Publish MQTT tiap 2 detik
const unsigned long SUPABASE_INTERVAL_MS = 15000;  // Simpan sensor_logs tiap 15 detik
const unsigned long DOOR_OPEN_MS         = 5000;   // Status pintu terbuka 5 detik

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
Adafruit_VL53L0X tof = Adafruit_VL53L0X();
DHT dht(PIN_DHT, DHTTYPE);
MFRC522 rfid(PIN_SS_RFID, PIN_RST_RFID);

bool tofReady                    = false;
unsigned long lastMqttSentMs     = 0;
unsigned long lastSupabaseSentMs = 0;
unsigned long lastBuzzerToggleMs = 0;
unsigned long doorOpenedAtMs     = 0;
bool isDoorOpen                  = false;
bool buzzerState                 = false;

String prevOverallStatus = "NORMAL";
String prevMq4Status     = "NORMAL";
String prevMq135Status   = "NORMAL";
String prevTempStatus    = "NORMAL";
String prevHumStatus     = "NORMAL";

// ======================== KONEKSI WIFI & MQTT ================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("[PCB1] Menghubungkan WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[PCB1] WiFi terhubung. IP: " + WiFi.localIP().toString());
}

void connectMQTT() {
  while (!mqttClient.connected()) {
    String clientId = String("pcb1-") + NODE_ID + "-" + String(random(1000, 9999));
    Serial.print("[PCB1] Menghubungkan MQTT...");
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" terhubung!");
    } else {
      Serial.print(" gagal rc=");
      Serial.println(mqttClient.state());
      delay(3000);
    }
  }
}

// ======================== PEMBACAAN SENSOR ===================================
float readMqPpm(int pin, float maxScale) {
  int raw = analogRead(pin); // ADC 12-bit (0..4095)
  return (raw / 4095.0f) * maxScale;
}

int readTofDistanceCm() {
  if (!tofReady) return 0;
  VL53L0X_RangingMeasurementData_t measure;
  tof.rangingTest(&measure, false);
  if (measure.RangeStatus != 4) {
    return (int)round(measure.RangeMilliMeter / 10.0f);
  }
  return 0;
}

int readBatteryPercent() {
  int raw = analogRead(PIN_BAT_ADC);
  // Sesuaikan rentang ADC dengan pembagi tegangan baterai Anda (mis. Li-Ion 3.0V-4.2V)
  int pct = map(raw, 2400, 4095, 0, 100);
  return constrain(pct, 0, 100);
}

String evalLevel(float value, float warn, float danger) {
  if (value >= danger) return "BAHAYA";
  if (value >= warn) return "WASPADA";
  return "NORMAL";
}

String highestStatus(const String& a, const String& b, const String& c, const String& d) {
  if (a == "BAHAYA" || b == "BAHAYA" || c == "BAHAYA" || d == "BAHAYA") return "BAHAYA";
  if (a == "WASPADA" || b == "WASPADA" || c == "WASPADA" || d == "WASPADA") return "WASPADA";
  return "NORMAL";
}

// ======================== KONTROL BUZZER =====================================
void beepRfidFeedback(bool granted) {
  if (granted) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(120);
    digitalWrite(PIN_BUZZER, LOW);
  } else {
    for (int i = 0; i < 2; i++) {
      digitalWrite(PIN_BUZZER, HIGH);
      delay(100);
      digitalWrite(PIN_BUZZER, LOW);
      delay(80);
    }
  }
}

void updateAlarmBuzzer(const String& overall, unsigned long now) {
  if (overall == "BAHAYA") {
    if (now - lastBuzzerToggleMs >= 250) {
      lastBuzzerToggleMs = now;
      buzzerState = !buzzerState;
      digitalWrite(PIN_BUZZER, buzzerState ? HIGH : LOW);
    }
  } else if (overall == "WASPADA") {
    if (now - lastBuzzerToggleMs >= 1000) {
      lastBuzzerToggleMs = now;
      buzzerState = !buzzerState;
      digitalWrite(PIN_BUZZER, buzzerState ? HIGH : LOW);
    }
  } else {
    buzzerState = false;
    digitalWrite(PIN_BUZZER, LOW);
  }
}

// ======================== SUPABASE HTTP POST =================================
bool postToSupabase(const char* table, const String& jsonBody) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure secClient;
  secClient.setInsecure();

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/" + table;
  if (!http.begin(secClient, url)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Prefer", "return=minimal");

  int code = http.POST(jsonBody);
  http.end();

  Serial.printf("[Supabase %s] HTTP %d\n", table, code);
  return code >= 200 && code < 300;
}

void logSensorToSupabase(float mq4, float mq135, float suhu, float kelembapan,
                         int jarakCm, const String& doorStr, const String& statusStr) {
  JsonDocument doc;
  doc["node_id"]    = NODE_ID;
  doc["mq4"]        = round(mq4);
  doc["mq135"]      = round(mq135);
  doc["suhu"]       = round(suhu * 10.0f) / 10.0f;
  doc["kelembapan"] = round(kelembapan * 10.0f) / 10.0f;
  doc["jarak"]      = jarakCm;
  doc["door"]       = doorStr;
  doc["status"]     = statusStr;

  String body;
  serializeJson(doc, body);
  postToSupabase("sensor_logs", body);
}

void logAlertToSupabase(const char* sensorName, float value, float threshold, const String& level) {
  JsonDocument doc;
  doc["node_id"]     = NODE_ID;
  doc["sensor_name"] = sensorName;
  doc["value"]       = value;
  doc["threshold"]   = threshold;
  doc["level"]       = level;

  String body;
  serializeJson(doc, body);
  postToSupabase("alert_logs", body);
}

void logRfidToSupabase(const String& doorStr, const char* accessResult) {
  JsonDocument doc;
  doc["node_id"]       = NODE_ID;
  doc["door_status"]   = doorStr;
  doc["access_result"] = accessResult;

  String body;
  serializeJson(doc, body);
  postToSupabase("rfid_logs", body);
}

// ======================== PUBLISH MQTT =======================================
void publishTelemetryMqtt(float mq4, float mq135, float suhu, float kelembapan,
                          int jarakCm, bool rfidTapped, const String& doorStr,
                          int battery, const String& statusStr) {
  JsonDocument doc;
  doc["node_id"]    = NODE_ID;
  doc["mq4"]        = round(mq4);
  doc["mq135"]      = round(mq135);
  doc["suhu"]       = round(suhu * 10.0f) / 10.0f;
  doc["kelembapan"] = round(kelembapan * 10.0f) / 10.0f;
  doc["jarak"]      = jarakCm;
  doc["rfid"]       = rfidTapped;
  doc["door"]       = doorStr;
  doc["battery"]    = battery;
  doc["status"]     = statusStr;

  char buffer[320];
  serializeJson(doc, buffer);
  mqttClient.publish(MQTT_TOPIC, buffer);
}

// ======================== SETUP & LOOP =======================================
void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  pinMode(PIN_RELAY_DOOR, OUTPUT);
  digitalWrite(PIN_RELAY_DOOR, LOW);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  tofReady = tof.begin();
  if (!tofReady) {
    Serial.println("[PCB1] Peringatan: TOF200C (VL53L0X) tidak terdeteksi di I2C!");
  }

  dht.begin();
  SPI.begin();
  rfid.PCD_Init();

  connectWiFi();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  connectMQTT();
}

void loop() {
  connectWiFi();
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();

  unsigned long now = millis();

  if (isDoorOpen && (now - doorOpenedAtMs >= DOOR_OPEN_MS)) {
    isDoorOpen = false;
    digitalWrite(PIN_RELAY_DOOR, LOW);
  }

  float mq4        = readMqPpm(PIN_MQ4, 2000.0f);
  float mq135      = readMqPpm(PIN_MQ135, 1000.0f);
  float suhu       = dht.readTemperature();
  float kelembapan = dht.readHumidity();
  if (isnan(suhu)) suhu = 26.0f;
  if (isnan(kelembapan)) kelembapan = 60.0f;
  int jarakCm      = readTofDistanceCm();
  int battery      = readBatteryPercent();

  String sMq4    = evalLevel(mq4, MQ4_WARNING, MQ4_DANGER);
  String sMq135  = evalLevel(mq135, MQ135_WARNING, MQ135_DANGER);
  String sTemp   = evalLevel(suhu, TEMP_WARNING, TEMP_DANGER);
  String sHum    = evalLevel(kelembapan, HUM_WARNING, HUM_DANGER);
  String overall = highestStatus(sMq4, sMq135, sTemp, sHum);

  updateAlarmBuzzer(overall, now);

  bool rfidTapped = false;
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    rfidTapped = true;
    bool gasSafe = (sMq4 != "BAHAYA" && sMq135 != "BAHAYA");

    if (gasSafe) {
      isDoorOpen = true;
      doorOpenedAtMs = now;
      digitalWrite(PIN_RELAY_DOOR, HIGH);
      beepRfidFeedback(true);
      logRfidToSupabase("OPEN", "DITERIMA");
    } else {
      isDoorOpen = false;
      digitalWrite(PIN_RELAY_DOOR, LOW);
      beepRfidFeedback(false);
      logRfidToSupabase("LOCKED", "DITOLAK");
    }

    String doorStr = isDoorOpen ? "OPEN" : "LOCKED";
    publishTelemetryMqtt(mq4, mq135, suhu, kelembapan, jarakCm, true, doorStr, battery, overall);

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }

  String doorStr = isDoorOpen ? "OPEN" : "LOCKED";

  if (sMq4 != "NORMAL" && sMq4 != prevMq4Status) {
    logAlertToSupabase("MQ-4", mq4, sMq4 == "BAHAYA" ? MQ4_DANGER : MQ4_WARNING, sMq4);
  }
  if (sMq135 != "NORMAL" && sMq135 != prevMq135Status) {
    logAlertToSupabase("MQ-135", mq135, sMq135 == "BAHAYA" ? MQ135_DANGER : MQ135_WARNING, sMq135);
  }
  if (sTemp != "NORMAL" && sTemp != prevTempStatus) {
    logAlertToSupabase("DHT11 - Suhu", suhu, sTemp == "BAHAYA" ? TEMP_DANGER : TEMP_WARNING, sTemp);
  }
  if (sHum != "NORMAL" && sHum != prevHumStatus) {
    logAlertToSupabase("DHT11 - Kelembapan", kelembapan, sHum == "BAHAYA" ? HUM_DANGER : HUM_WARNING, sHum);
  }
  prevMq4Status   = sMq4;
  prevMq135Status = sMq135;
  prevTempStatus  = sTemp;
  prevHumStatus   = sHum;

  if (!rfidTapped && (now - lastMqttSentMs >= MQTT_INTERVAL_MS)) {
    lastMqttSentMs = now;
    publishTelemetryMqtt(mq4, mq135, suhu, kelembapan, jarakCm, false, doorStr, battery, overall);
  }

  bool statusChanged = (overall != prevOverallStatus);
  if (statusChanged || (now - lastSupabaseSentMs >= SUPABASE_INTERVAL_MS)) {
    lastSupabaseSentMs = now;
    prevOverallStatus = overall;
    logSensorToSupabase(mq4, mq135, suhu, kelembapan, jarakCm, doorStr, overall);
  }

  delay(100);
}
