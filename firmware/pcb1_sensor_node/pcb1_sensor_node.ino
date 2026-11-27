#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// --- Konfigurasi Wi-Fi & MQTT ---
const char* ssid = "Wokwi-GUEST";
const char* password = "";
const char* mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;
const char* mqtt_topic = "ikn/mut/node01";
const char* node_id = "NODE-01";

// --- Konfigurasi Supabase REST API (Aktif 24/7 meski web tidak dibuka) ---
const char* supabase_url = "https://yhtvyongrbpmscvslgks.supabase.co";
const char* supabase_key = "sb_publishable_Ys8kCYOZyB5u5ze7yArtew_PKscjpK8";

// --- Pemetaan Pin ---
#define PIN_MQ4     34
#define PIN_MQ135   35
#define PIN_DHT     32
#define PIN_BUZZER  25
#define PIN_RFID    5
#define PIN_TOF     33
#define PIN_DOOR    26 // Hubungkan ke Relay/Solenoid (atau LED Hijau di Wokwi)

#define DHTTYPE DHT22 // Ganti DHT11 saat pindah ke hardware fisik
DHT dht(PIN_DHT, DHTTYPE);

WiFiClient espClient;
PubSubClient client(espClient);

// --- Ambang Batas (Threshold) ---
const int MQ4_WASPADA   = 500;
const int MQ4_BAHAYA    = 1000;
const int MQ135_WASPADA = 350;
const int MQ135_BAHAYA  = 700;
const float SUHU_MAX    = 38.0;

const unsigned long SUPABASE_INTERVAL_MS = 15000; // Simpan sensor_logs tiap 15 detik

unsigned long lastSend = 0;
unsigned long lastSupabaseSend = 0;
unsigned long doorOpenTime = 0;
bool isDoorOpen = false;
bool lastRfidState = HIGH;

// Variabel pembacaan terbaru
int mq4_ppm = 0;
int mq135_ppm = 0;
int jarak_cm = 0;
float suhu = 0.0;
float kelembapan = 0.0;
String statusSensor = "NORMAL";
String prevSupabaseStatus = "NORMAL";
String doorStatus = "LOCKED";

void setup_wifi() {
  Serial.print("Menghubungkan ke Wi-Fi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi Terhubung!");
}

void reconnect_mqtt() {
  while (!client.connected()) {
    String clientId = "ESP32-PCB1-" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str())) {
      Serial.println("MQTT Terhubung!");
    } else {
      delay(3000);
    }
  }
}

bool postToSupabase(const char* table, const String& jsonBody) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure secClient;
  secClient.setInsecure();

  HTTPClient http;
  String url = String(supabase_url) + "/rest/v1/" + table;
  if (!http.begin(secClient, url)) return false;

  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabase_key);
  http.addHeader("Prefer", "return=minimal");

  int httpCode = http.POST(jsonBody);
  http.end();

  Serial.print("[Supabase ");
  Serial.print(table);
  Serial.print("] HTTP ");
  Serial.println(httpCode);
  return httpCode >= 200 && httpCode < 300;
}

void kirimSensorKeSupabase() {
  StaticJsonDocument<256> doc;
  doc["node_id"]    = node_id;
  doc["mq4"]        = mq4_ppm;
  doc["mq135"]      = mq135_ppm;
  doc["suhu"]       = round(suhu * 10) / 10.0;
  doc["kelembapan"] = round(kelembapan * 10) / 10.0;
  doc["jarak"]      = jarak_cm;
  doc["door"]       = doorStatus;
  doc["status"]     = statusSensor;

  String body;
  serializeJson(doc, body);
  postToSupabase("sensor_logs", body);
}

void kirimAlertKeSupabase(const char* sensorName, float value, float threshold, const String& level) {
  StaticJsonDocument<256> doc;
  doc["node_id"]     = node_id;
  doc["sensor_name"] = sensorName;
  doc["value"]       = value;
  doc["threshold"]   = threshold;
  doc["level"]       = level;

  String body;
  serializeJson(doc, body);
  postToSupabase("alert_logs", body);
}

void kirimRfidKeSupabase(const String& doorStr, const char* accessResult) {
  StaticJsonDocument<192> doc;
  doc["node_id"]       = node_id;
  doc["door_status"]   = doorStr;
  doc["access_result"] = accessResult;

  String body;
  serializeJson(doc, body);
  postToSupabase("rfid_logs", body);
}

void bacaDanEvaluasiSensor() {
  mq4_ppm   = map(analogRead(PIN_MQ4), 0, 4095, 0, 2000);
  mq135_ppm = map(analogRead(PIN_MQ135), 0, 4095, 0, 1000);
  jarak_cm  = map(analogRead(PIN_TOF), 0, 4095, 0, 200);

  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) suhu = t;
  if (!isnan(h)) kelembapan = h;

  // Evaluasi status seluruh sensor
  if (mq4_ppm >= MQ4_BAHAYA || mq135_ppm >= MQ135_BAHAYA || suhu >= SUHU_MAX) {
    statusSensor = "BAHAYA";
    tone(PIN_BUZZER, 2000);
    // Fail-safe: kunci pintu segera jika kondisi menjadi BAHAYA
    if (isDoorOpen) {
      isDoorOpen = false;
      digitalWrite(PIN_DOOR, LOW);
      doorStatus = "LOCKED";
      Serial.println("[DARURAT] Gas berbahaya! Pintu dikunci otomatis.");
    }
  } else if (mq4_ppm >= MQ4_WASPADA || mq135_ppm >= MQ135_WASPADA) {
    statusSensor = "WASPADA";
    tone(PIN_BUZZER, 1000, 200);
  } else {
    statusSensor = "NORMAL";
    noTone(PIN_BUZZER);
  }
}

void kirimMQTT(bool rfidEvent) {
  StaticJsonDocument<256> doc;
  doc["node_id"]    = node_id;
  doc["mq4"]        = mq4_ppm;
  doc["mq135"]      = mq135_ppm;
  doc["suhu"]       = round(suhu * 10) / 10.0;
  doc["kelembapan"] = round(kelembapan * 10) / 10.0;
  doc["jarak"]      = jarak_cm;
  doc["rfid"]       = rfidEvent;
  doc["status"]     = statusSensor;
  doc["door"]       = doorStatus;

  char buffer[256];
  serializeJson(doc, buffer);
  client.publish(mqtt_topic, buffer);
  Serial.print("Kirim MQTT: ");
  Serial.println(buffer);
}

void cekDanCatatPeringatanSupabase() {
  if (statusSensor == "NORMAL" || statusSensor == prevSupabaseStatus) return;

  if (mq4_ppm >= MQ4_BAHAYA) {
    kirimAlertKeSupabase("MQ-4", mq4_ppm, MQ4_BAHAYA, "BAHAYA");
  } else if (mq4_ppm >= MQ4_WASPADA) {
    kirimAlertKeSupabase("MQ-4", mq4_ppm, MQ4_WASPADA, "WASPADA");
  }

  if (mq135_ppm >= MQ135_BAHAYA) {
    kirimAlertKeSupabase("MQ-135", mq135_ppm, MQ135_BAHAYA, "BAHAYA");
  } else if (mq135_ppm >= MQ135_WASPADA) {
    kirimAlertKeSupabase("MQ-135", mq135_ppm, MQ135_WASPADA, "WASPADA");
  }

  if (suhu >= SUHU_MAX) {
    kirimAlertKeSupabase("DHT11 - Suhu", suhu, SUHU_MAX, "BAHAYA");
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();

  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_RFID, INPUT_PULLUP);
  pinMode(PIN_DOOR, OUTPUT);
  digitalWrite(PIN_DOOR, LOW); // Kondisi awal pintu terkunci

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) {
    reconnect_mqtt();
  }
  client.loop();

  // 1. Cek tombol RFID setiap saat (real-time, tidak menunggu jeda 2 detik)
  bool currentRfidState = digitalRead(PIN_RFID);
  if (lastRfidState == HIGH && currentRfidState == LOW) {
    bacaDanEvaluasiSensor();

    if (statusSensor == "NORMAL") {
      // Semua sensor aman -> Buka pintu
      isDoorOpen = true;
      doorOpenTime = millis();
      digitalWrite(PIN_DOOR, HIGH);
      doorStatus = "OPEN";
      tone(PIN_BUZZER, 1500, 150); // Bip konfirmasi akses diterima
      Serial.println("[RFID] Kondisi AMAN -> PINTU DIBUKA (5 detik)");
      kirimRfidKeSupabase("OPEN", "DITERIMA");
    } else {
      // Kondisi WASPADA / BAHAYA -> Kunci pintu & tolak akses
      isDoorOpen = false;
      digitalWrite(PIN_DOOR, LOW);
      doorStatus = "LOCKED";
      tone(PIN_BUZZER, 400, 500); // Nada rendah akses ditolak
      Serial.println("[RFID] Kondisi BERBAHAYA -> AKSES DITOLAK, PINTU TETAP TERKUNCI!");
      kirimRfidKeSupabase("LOCKED", "DITOLAK");
    }
    kirimMQTT(true);
    delay(250); // Debounce tombol
  }
  lastRfidState = currentRfidState;

  // 2. Auto-lock pintu setelah 5 detik terbuka
  if (isDoorOpen && (millis() - doorOpenTime >= 5000)) {
    isDoorOpen = false;
    digitalWrite(PIN_DOOR, LOW);
    doorStatus = "LOCKED";
    Serial.println("[AUTO-LOCK] Pintu terkunci kembali.");
    kirimMQTT(false);
  }

  // 3. Kirim telemetri rutin setiap 2 detik ke MQTT
  if (millis() - lastSend >= 2000) {
    lastSend = millis();
    bacaDanEvaluasiSensor();
    kirimMQTT(false);

    // 4. Simpan ke Supabase tiap 15 detik atau saat status berubah
    bool statusChanged = (statusSensor != prevSupabaseStatus);
    if (statusChanged || (millis() - lastSupabaseSend >= SUPABASE_INTERVAL_MS)) {
      lastSupabaseSend = millis();
      cekDanCatatPeringatanSupabase();
      prevSupabaseStatus = statusSensor;
      kirimSensorKeSupabase();
    }
  }
}
