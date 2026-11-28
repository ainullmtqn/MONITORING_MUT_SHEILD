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

// --- Konfigurasi Supabase REST API (Aktif 24/7 via Background Task) ---
const char* supabase_url = "https://yhtvyongrbpmscvslgks.supabase.co";
const char* supabase_key = "sb_publishable_Ys8kCYOZyB5u5ze7yArtew_PKscjpK8";
const char* device_token = "GANTI_TOKEN_PERANGKAT_IKN_2026"; // Harus sama dengan policy RLS di supabase/rls_hardening.sql

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

const unsigned long MQTT_INTERVAL_MS       = 2000;   // Kirim MQTT tiap 2 detik
const unsigned long SUPABASE_INTERVAL_MS   = 15000;  // Simpan sensor_logs tiap 15 detik
const unsigned long MQTT_RECONNECT_WAIT_MS = 3000;   // Coba ulang MQTT non-blocking tiap 3 dtk
const unsigned long RFID_DEBOUNCE_MS       = 300;

unsigned long lastSend             = 0;
unsigned long lastSupabaseSend     = 0;
unsigned long lastMqttReconnectTry = 0;
unsigned long lastRfidTapMs        = 0;
unsigned long doorOpenTime         = 0;
bool mqttHasAttemptedOnce          = false;
bool isDoorOpen                    = false;
bool lastRfidState                 = HIGH;

// Variabel pembacaan terbaru
int mq4_ppm = 0;
int mq135_ppm = 0;
int jarak_cm = 0;
float suhu = 0.0;
float kelembapan = 0.0;
String statusSensor = "NORMAL";
String prevSupabaseStatus = "NORMAL";
String doorStatus = "LOCKED";

// --- Antrean & Task Latar Belakang FreeRTOS untuk Supabase (Non-Blocking) ---
struct SupabaseJob {
  char table[24];
  char body[320];
};

QueueHandle_t supabaseQueue = nullptr;

bool postToSupabase(const char* table, const char* jsonBody) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure secClient;
  secClient.setInsecure();

  HTTPClient http;
  String url = String(supabase_url) + "/rest/v1/" + table;
  if (!http.begin(secClient, url)) return false;

  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabase_key);
  http.addHeader("x-device-token", device_token);
  http.addHeader("Prefer", "return=minimal");

  int httpCode = http.POST(jsonBody);
  http.end();

  Serial.print("[Supabase ");
  Serial.print(table);
  Serial.print("] HTTP ");
  Serial.println(httpCode);
  return httpCode >= 200 && httpCode < 300;
}

void supabaseWorkerTask(void* pvParameters) {
  (void)pvParameters;
  SupabaseJob job;
  for (;;) {
    if (xQueueReceive(supabaseQueue, &job, portMAX_DELAY) == pdTRUE) {
      postToSupabase(job.table, job.body);
    }
  }
}

void enqueueSupabaseJob(const char* table, const String& jsonBody) {
  if (supabaseQueue == nullptr) return;
  SupabaseJob job;
  strlcpy(job.table, table, sizeof(job.table));
  strlcpy(job.body, jsonBody.c_str(), sizeof(job.body));
  // Jika antrean penuh, lewati tanpa memblokir loop MQTT
  xQueueSend(supabaseQueue, &job, 0);
}

void setup_wifi() {
  Serial.print("Menghubungkan ke Wi-Fi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nWi-Fi Terhubung!");
}

void tryReconnectMqttNonBlocking(unsigned long now) {
  if (client.connected()) return;
  if (mqttHasAttemptedOnce && (now - lastMqttReconnectTry < MQTT_RECONNECT_WAIT_MS)) return;
  mqttHasAttemptedOnce = true;
  lastMqttReconnectTry = now;

  String clientId = "ESP32-PCB1-" + String(random(0xffff), HEX);
  if (client.connect(clientId.c_str())) {
    Serial.println("MQTT Terhubung!");
    // Kirim data pertama seketika begitu MQTT terhubung tanpa menunggu 2 detik
    bacaDanEvaluasiSensor();
    kirimMQTT(false);
    lastSend = now;
  }
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
  enqueueSupabaseJob("sensor_logs", body);
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
  enqueueSupabaseJob("alert_logs", body);
}

void kirimRfidKeSupabase(const String& doorStr, const char* accessResult) {
  StaticJsonDocument<192> doc;
  doc["node_id"]       = node_id;
  doc["door_status"]   = doorStr;
  doc["access_result"] = accessResult;

  String body;
  serializeJson(doc, body);
  enqueueSupabaseJob("rfid_logs", body);
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
  if (!client.connected()) return;

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
  size_t len = serializeJson(doc, buffer, sizeof(buffer));

  // Retain=true untuk telemetri rutin agar web langsung dapat data terakhir tanpa delay
  // Retain=false untuk event RFID agar tap lama tidak terputar ulang saat web dibuka
  bool retained = !rfidEvent;
  client.publish(mqtt_topic, (const uint8_t*)buffer, len, retained);
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
  client.setBufferSize(512);

  // Buat queue & background worker task di Core 0 agar HTTPS Supabase tidak memblokir MQTT
  supabaseQueue = xQueueCreate(12, sizeof(SupabaseJob));
  BaseType_t workerCore =
#if defined(CONFIG_FREERTOS_UNICORE) && CONFIG_FREERTOS_UNICORE
    0;
#else
    0;
#endif
  xTaskCreatePinnedToCore(
    supabaseWorkerTask,
    "SupabaseWorker",
    8192,
    nullptr,
    1,
    nullptr,
    workerCore
  );
}

void loop() {
  unsigned long now = millis();

  if (!client.connected()) {
    tryReconnectMqttNonBlocking(now);
  } else {
    client.loop();
  }

  // 1. Cek tombol RFID setiap saat (non-blocking debounce)
  bool currentRfidState = digitalRead(PIN_RFID);
  if (lastRfidState == HIGH && currentRfidState == LOW && (now - lastRfidTapMs >= RFID_DEBOUNCE_MS)) {
    lastRfidTapMs = now;
    bacaDanEvaluasiSensor();

    if (statusSensor == "NORMAL") {
      isDoorOpen = true;
      doorOpenTime = now;
      digitalWrite(PIN_DOOR, HIGH);
      doorStatus = "OPEN";
      tone(PIN_BUZZER, 1500, 150);
      Serial.println("[RFID] Kondisi AMAN -> PINTU DIBUKA (5 detik)");
      kirimRfidKeSupabase("OPEN", "DITERIMA");
    } else {
      isDoorOpen = false;
      digitalWrite(PIN_DOOR, LOW);
      doorStatus = "LOCKED";
      tone(PIN_BUZZER, 400, 500);
      Serial.println("[RFID] Kondisi BERBAHAYA -> AKSES DITOLAK, PINTU TETAP TERKUNCI!");
      kirimRfidKeSupabase("LOCKED", "DITOLAK");
    }
    kirimMQTT(true);
  }
  lastRfidState = currentRfidState;

  // 2. Auto-lock pintu setelah 5 detik terbuka
  if (isDoorOpen && (now - doorOpenTime >= 5000)) {
    isDoorOpen = false;
    digitalWrite(PIN_DOOR, LOW);
    doorStatus = "LOCKED";
    Serial.println("[AUTO-LOCK] Pintu terkunci kembali.");
    kirimMQTT(false);
  }

  // 3. Kirim telemetri rutin setiap 2 detik ke MQTT
  if (now - lastSend >= MQTT_INTERVAL_MS) {
    lastSend = now;
    bacaDanEvaluasiSensor();
    kirimMQTT(false);

    // 4. Antrekan pengiriman ke Supabase tiap 15 detik atau saat status berubah (non-blocking)
    bool statusChanged = (statusSensor != prevSupabaseStatus);
    if (statusChanged || (now - lastSupabaseSend >= SUPABASE_INTERVAL_MS)) {
      lastSupabaseSend = now;
      cekDanCatatPeringatanSupabase();
      prevSupabaseStatus = statusSensor;
      kirimSensorKeSupabase();
    }
  }
}
