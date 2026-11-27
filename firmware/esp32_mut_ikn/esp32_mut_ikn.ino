/**
 * MUT-IKN Monitor — Firmware Node Sensor Bawah Tanah (ESP32)
 *
 * Fitur:
 * 1. Membaca MQ-4 (CH4), MQ-135 (VOC/CO2), DHT11 (Suhu & Kelembapan),
 *    Ultrasonik HC-SR04 (Jarak), dan RFID RC522.
 * 2. Publish telemetri real-time setiap 2 detik ke MQTT Broker (broker.emqx.io:1883)
 *    pada topik `ikn/mut/NODE-01` (sesuaikan NODE_ID untuk NODE-01 s/d NODE-04).
 * 3. Mengirim HTTP POST langsung ke Supabase REST API (24/7 meskipun web ditutup):
 *    - `sensor_logs` setiap 15 detik atau saat status berubah
 *    - `alert_logs` saat terjadi status WASPADA / BAHAYA
 *    - `rfid_logs` saat kartu RFID di-tap
 *
 * Library Arduino IDE yang dibutuhkan:
 * - PubSubClient (Nick O'Leary)
 * - ArduinoJson (Benoit Blanchon, v6/v7)
 * - DHT sensor library (Adafruit)
 * - MFRC522 (GithubCommunity)
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <SPI.h>
#include <MFRC522.h>

// ======================== KONFIGURASI JARINGAN & NODE ========================
const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";

const char* NODE_ID       = "NODE-01"; // Ubah sesuai node: NODE-01 .. NODE-04
const char* MQTT_BROKER   = "broker.emqx.io";
const int   MQTT_PORT     = 1883;
const char* MQTT_TOPIC    = "ikn/mut/NODE-01"; // Sesuaikan dengan NODE_ID

// ======================== KONFIGURASI SUPABASE REST API ======================
const char* SUPABASE_URL  = "https://yhtvyongrbpmscvslgks.supabase.co";
const char* SUPABASE_KEY  = "sb_publishable_Ys8kCYOZyB5u5ze7yArtew_PKscjpK8";

// ======================== PIN HARDWARE ESP32 =================================
#define PIN_MQ4        34
#define PIN_MQ135      35
#define PIN_DHT        4
#define DHTTYPE        DHT11
#define PIN_TRIG       12
#define PIN_ECHO       13
#define PIN_RELAY_DOOR 26
#define PIN_SS_RFID    5
#define PIN_RST_RFID   27
#define PIN_BAT_ADC    32

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
const unsigned long MQTT_INTERVAL_MS     = 2000;   // Kirim MQTT tiap 2 detik
const unsigned long SUPABASE_INTERVAL_MS = 15000;  // Simpan sensor_logs tiap 15 detik
const unsigned long DOOR_OPEN_MS         = 5000;   // Pintu terbuka 5 detik saat RFID valid

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
DHT dht(PIN_DHT, DHTTYPE);
MFRC522 rfid(PIN_SS_RFID, PIN_RST_RFID);

unsigned long lastMqttSentMs     = 0;
unsigned long lastSupabaseSentMs = 0;
unsigned long doorOpenedAtMs     = 0;
bool isDoorOpen                  = false;

String prevOverallStatus = "NORMAL";
String prevMq4Status     = "NORMAL";
String prevMq135Status   = "NORMAL";
String prevTempStatus    = "NORMAL";
String prevHumStatus     = "NORMAL";

// ======================== HELPER KONEKSI =====================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Menghubungkan WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi terhubung. IP: " + WiFi.localIP().toString());
}

void connectMQTT() {
  while (!mqttClient.connected()) {
    String clientId = String("esp32-") + NODE_ID + "-" + String(random(1000, 9999));
    Serial.print("Menghubungkan MQTT...");
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" terhubung!");
    } else {
      Serial.print(" gagal rc=");
      Serial.print(mqttClient.state());
      Serial.println(", coba lagi 3 dtk...");
      delay(3000);
    }
  }
}

// ======================== PEMBACAAN SENSOR ===================================
float readMqPpm(int pin, float maxScale) {
  int raw = analogRead(pin); // ADC 12-bit (0..4095)
  return (raw / 4095.0f) * maxScale;
}

float readUltrasonicCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duration = pulseIn(PIN_ECHO, HIGH, 25000);
  if (duration == 0) return 0.0;
  return duration * 0.034f / 2.0f;
}

int readBatteryPercent() {
  int raw = analogRead(PIN_BAT_ADC);
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

// ======================== SUPABASE HTTP POST =================================
bool postToSupabase(const char* table, const String& jsonBody) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure secClient;
  secClient.setInsecure(); // Untuk sertifikat SSL publik Supabase di ESP32

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
                         float jarak, const String& doorStr, const String& statusStr) {
  JsonDocument doc;
  doc["node_id"]    = NODE_ID;
  doc["mq4"]        = round(mq4);
  doc["mq135"]      = round(mq135);
  doc["suhu"]       = round(suhu * 10.0f) / 10.0f;
  doc["kelembapan"] = round(kelembapan * 10.0f) / 10.0f;
  doc["jarak"]      = round(jarak);
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
                          float jarak, bool rfidTapped, const String& doorStr,
                          int battery, const String& statusStr) {
  JsonDocument doc;
  doc["node_id"]    = NODE_ID;
  doc["mq4"]        = round(mq4);
  doc["mq135"]      = round(mq135);
  doc["suhu"]       = round(suhu * 10.0f) / 10.0f;
  doc["kelembapan"] = round(kelembapan * 10.0f) / 10.0f;
  doc["jarak"]      = round(jarak);
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
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_RELAY_DOOR, OUTPUT);
  digitalWrite(PIN_RELAY_DOOR, LOW);

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

  // Auto-kunci pintu setelah 5 detik terbuka
  if (isDoorOpen && (now - doorOpenedAtMs >= DOOR_OPEN_MS)) {
    isDoorOpen = false;
    digitalWrite(PIN_RELAY_DOOR, LOW);
  }

  // Baca sensor
  float mq4        = readMqPpm(PIN_MQ4, 2000.0f);
  float mq135      = readMqPpm(PIN_MQ135, 1000.0f);
  float suhu       = dht.readTemperature();
  float kelembapan = dht.readHumidity();
  if (isnan(suhu)) suhu = 26.0f;
  if (isnan(kelembapan)) kelembapan = 60.0f;
  float jarak      = readUltrasonicCm();
  int battery      = readBatteryPercent();

  String sMq4   = evalLevel(mq4, MQ4_WARNING, MQ4_DANGER);
  String sMq135 = evalLevel(mq135, MQ135_WARNING, MQ135_DANGER);
  String sTemp  = evalLevel(suhu, TEMP_WARNING, TEMP_DANGER);
  String sHum   = evalLevel(kelembapan, HUM_WARNING, HUM_DANGER);
  String overall = highestStatus(sMq4, sMq135, sTemp, sHum);

  // Cek tap kartu RFID
  bool rfidTapped = false;
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    rfidTapped = true;
    bool gasSafe = (sMq4 != "BAHAYA" && sMq135 != "BAHAYA");

    if (gasSafe) {
      isDoorOpen = true;
      doorOpenedAtMs = now;
      digitalWrite(PIN_RELAY_DOOR, HIGH);
      logRfidToSupabase("OPEN", "DITERIMA");
    } else {
      isDoorOpen = false;
      digitalWrite(PIN_RELAY_DOOR, LOW);
      logRfidToSupabase("LOCKED", "DITOLAK");
    }

    String doorStr = isDoorOpen ? "OPEN" : "LOCKED";
    publishTelemetryMqtt(mq4, mq135, suhu, kelembapan, jarak, true, doorStr, battery, overall);

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }

  String doorStr = isDoorOpen ? "OPEN" : "LOCKED";

  // Catat pelanggaran ambang batas ke alert_logs Supabase
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

  // Kirim MQTT tiap 2 detik
  if (!rfidTapped && (now - lastMqttSentMs >= MQTT_INTERVAL_MS)) {
    lastMqttSentMs = now;
    publishTelemetryMqtt(mq4, mq135, suhu, kelembapan, jarak, false, doorStr, battery, overall);
  }

  // Simpan telemetri ke Supabase tiap 15 detik atau saat status global berubah
  bool statusChanged = (overall != prevOverallStatus);
  if (statusChanged || (now - lastSupabaseSentMs >= SUPABASE_INTERVAL_MS)) {
    lastSupabaseSentMs = now;
    prevOverallStatus = overall;
    logSensorToSupabase(mq4, mq135, suhu, kelembapan, jarak, doorStr, overall);
  }

  delay(100);
}
