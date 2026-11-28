#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ============================================================================
// NODE-02 — MUT Sektor Istana Garuda (Khusus Sensor, Tanpa RFID & Tanpa Pintu)
// ============================================================================

// --- Konfigurasi Wi-Fi & MQTT ---
const char* ssid        = "Wokwi-GUEST";
const char* password    = "";
const char* mqtt_server = "broker.emqx.io";
const int   mqtt_port   = 1883;
const char* mqtt_topic  = "ikn/mut/node02";
const char* node_id     = "NODE-02";

// --- Konfigurasi Supabase REST API (Aktif 24/7 via Background Task Core 0) ---
const char* supabase_url = "https://yhtvyongrbpmscvslgks.supabase.co";
const char* supabase_key = "sb_publishable_Ys8kCYOZyB5u5ze7yArtew_PKscjpK8";
const char* device_token = "GANTI_TOKEN_PERANGKAT_IKN_2026"; // Sama dengan supabase/rls_hardening.sql

// --- Pemetaan Pin Sensor (Tanpa RFID & Tanpa Relay Pintu) ---
#define PIN_MQ4     34
#define PIN_MQ135   35
#define PIN_DHT     32
#define PIN_TOF     33
#define PIN_BUZZER  25

#define DHTTYPE DHT22 // Ganti DHT11 saat pindah ke hardware fisik
DHT dht(PIN_DHT, DHTTYPE);

WiFiClient espClient;
PubSubClient client(espClient);

// --- Ambang Batas (Threshold) ---
const int   MQ4_WASPADA   = 500;
const int   MQ4_BAHAYA    = 1000;
const int   MQ135_WASPADA = 350;
const int   MQ135_BAHAYA  = 700;
const float SUHU_MAX      = 38.0;

const unsigned long MQTT_INTERVAL_MS       = 1000;  // Kirim MQTT tepat tiap 1 detik
const unsigned long DHT_INTERVAL_MS        = 2500;  // Baca DHT tiap 2.5 detik agar non-blocking
const unsigned long SUPABASE_INTERVAL_MS   = 5000;  // Simpan sensor_logs tiap 5 detik (Core 0)
const unsigned long MQTT_RECONNECT_WAIT_MS = 3000;

unsigned long lastSend             = 0;
unsigned long lastDhtReadMs        = 0;
unsigned long lastSupabaseSend     = 0;
unsigned long lastMqttReconnectTry = 0;
bool mqttHasAttemptedOnce          = false;

// Variabel pembacaan terbaru
int mq4_ppm        = 0;
int mq135_ppm      = 0;
int jarak_cm       = 0;
float suhu         = 26.0;
float kelembapan   = 60.0;
String statusSensor       = "NORMAL";
String prevSupabaseStatus = "NORMAL";

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

  Serial.print("[");
  Serial.print(node_id);
  Serial.print(" Supabase ");
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
  xQueueSend(supabaseQueue, &job, 0);
}

void setup_wifi() {
  Serial.print("[NODE-02] Menghubungkan ke Wi-Fi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\n[NODE-02] Wi-Fi Terhubung!");
}

void bacaDanEvaluasiSensor() {
  unsigned long now = millis();

  mq4_ppm   = map(analogRead(PIN_MQ4), 0, 4095, 0, 2000);
  mq135_ppm = map(analogRead(PIN_MQ135), 0, 4095, 0, 1000);
  jarak_cm  = map(analogRead(PIN_TOF), 0, 4095, 0, 200);

  if (lastDhtReadMs == 0 || (now - lastDhtReadMs >= DHT_INTERVAL_MS)) {
    lastDhtReadMs = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) suhu = t;
    if (!isnan(h)) kelembapan = h;
  }

  if (mq4_ppm >= MQ4_BAHAYA || mq135_ppm >= MQ135_BAHAYA || suhu >= SUHU_MAX) {
    statusSensor = "BAHAYA";
    tone(PIN_BUZZER, 2000);
  } else if (mq4_ppm >= MQ4_WASPADA || mq135_ppm >= MQ135_WASPADA) {
    statusSensor = "WASPADA";
    tone(PIN_BUZZER, 1000, 200);
  } else {
    statusSensor = "NORMAL";
    noTone(PIN_BUZZER);
  }
}

void kirimMQTT() {
  if (!client.connected()) return;

  StaticJsonDocument<256> doc;
  doc["node_id"]    = node_id;
  doc["mq4"]        = mq4_ppm;
  doc["mq135"]      = mq135_ppm;
  doc["suhu"]       = round(suhu * 10) / 10.0;
  doc["kelembapan"] = round(kelembapan * 10) / 10.0;
  doc["jarak"]      = jarak_cm;
  doc["rfid"]       = false;
  doc["status"]     = statusSensor;
  doc["door"]       = "LOCKED";

  char buffer[256];
  size_t len = serializeJson(doc, buffer, sizeof(buffer));
  client.publish(mqtt_topic, (const uint8_t*)buffer, len, true);
  Serial.print("[NODE-02] Kirim MQTT: ");
  Serial.println(buffer);
}

void tryReconnectMqttNonBlocking(unsigned long now) {
  if (client.connected()) return;
  if (mqttHasAttemptedOnce && (now - lastMqttReconnectTry < MQTT_RECONNECT_WAIT_MS)) return;
  mqttHasAttemptedOnce = true;
  lastMqttReconnectTry = now;

  String clientId = "ESP32-NODE02-" + String(random(0xffff), HEX);
  if (client.connect(clientId.c_str())) {
    Serial.println("[NODE-02] MQTT Terhubung!");
    bacaDanEvaluasiSensor();
    kirimMQTT();
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
  doc["door"]       = "LOCKED";
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

  setup_wifi();
  espClient.setNoDelay(true);
  client.setServer(mqtt_server, mqtt_port);
  client.setBufferSize(512);

  supabaseQueue = xQueueCreate(12, sizeof(SupabaseJob));
  xTaskCreatePinnedToCore(
    supabaseWorkerTask,
    "SupabaseWorker02",
    8192,
    nullptr,
    1,
    nullptr,
    0
  );
}

void loop() {
  unsigned long now = millis();

  if (!client.connected()) {
    tryReconnectMqttNonBlocking(now);
  } else {
    client.loop();
  }

  if (now - lastSend >= MQTT_INTERVAL_MS) {
    lastSend = (now - lastSend >= 3 * MQTT_INTERVAL_MS) ? now : (lastSend + MQTT_INTERVAL_MS);
    bacaDanEvaluasiSensor();
    kirimMQTT();

    bool statusChanged = (statusSensor != prevSupabaseStatus);
    if (statusChanged || (now - lastSupabaseSend >= SUPABASE_INTERVAL_MS)) {
      lastSupabaseSend = now;
      cekDanCatatPeringatanSupabase();
      prevSupabaseStatus = statusSensor;
      kirimSensorKeSupabase();
    }
  }
}
