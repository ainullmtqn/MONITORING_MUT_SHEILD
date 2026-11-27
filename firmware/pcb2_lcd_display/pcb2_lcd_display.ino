/**
 * MUT-IKN Monitor — Firmware PCB 2 (Unit Monitor LCD Lokal + Baterai)
 *
 * Komponen PCB 2:
 * 1. ESP32
 * 2. LCD I2C (16x2 atau 20x4, alamat default 0x27)
 * 3. Baterai (Pembacaan tegangan via pembagi tegangan ADC)
 *
 * Cara Kerja:
 * - Subscribe MQTT `ikn/mut/+` dari broker.emqx.io:1883 untuk menerima data
 *   real-time dari PCB 1 (NODE-01 s/d NODE-04).
 * - Jika ada node berstatus BAHAYA / WASPADA, LCD memprioritaskan node tersebut.
 * - Jika semua node normal/online, LCD bergantian menampilkan ringkasan tiap node
 *   setiap 3 detik, beserta level baterai unit LCD (PCB 2).
 * - Jika node tidak mengirim data > 15 detik, status node di LCD tampil OFFLINE.
 *
 * Library Arduino IDE:
 * - PubSubClient (Nick O'Leary)
 * - ArduinoJson (Benoit Blanchon)
 * - LiquidCrystal_I2C (Frank de Brabander)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ======================== KONFIGURASI JARINGAN ===============================
const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";

const char* MQTT_BROKER   = "broker.emqx.io";
const int   MQTT_PORT     = 1883;
const char* MQTT_TOPIC    = "ikn/mut/+";

// ======================== PIN HARDWARE PCB 2 =================================
#define PIN_I2C_SDA   21
#define PIN_I2C_SCL   22
#define PIN_BAT_ADC   34    // Pin ADC pembacaan baterai PCB 2

// Ubah ke (0x27, 20, 4) jika memakai LCD 20x4, atau 0x3F jika alamat I2C berbeda
#define LCD_ADDR      0x27
#define LCD_COLS      16
#define LCD_ROWS      2

const unsigned long NODE_TIMEOUT_MS   = 15000;
const unsigned long LCD_ROTATE_MS     = 3000;
const unsigned long LCD_REFRESH_MS    = 500;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);

struct NodeData {
  const char* id;
  int mq4;
  int mq135;
  float suhu;
  float kelembapan;
  int jarak;
  String door;
  String status;
  unsigned long lastSeenMs;
  bool hasData;
};

const int NODE_COUNT = 4;
NodeData nodes[NODE_COUNT] = {
  {"NODE-01", 0, 0, 0, 0, 0, "LOCKED", "OFFLINE", 0, false},
  {"NODE-02", 0, 0, 0, 0, 0, "LOCKED", "OFFLINE", 0, false},
  {"NODE-03", 0, 0, 0, 0, 0, "LOCKED", "OFFLINE", 0, false},
  {"NODE-04", 0, 0, 0, 0, 0, "LOCKED", "OFFLINE", 0, false},
};

int activeDisplayIdx           = 0;
unsigned long lastRotateMs     = 0;
unsigned long lastLcdRefreshMs = 0;

int readLocalBatteryPercent() {
  int raw = analogRead(PIN_BAT_ADC);
  int pct = map(raw, 2400, 4095, 0, 100);
  return constrain(pct, 0, 100);
}

int findNodeIndex(const String& nodeId) {
  for (int i = 0; i < NODE_COUNT; i++) {
    if (nodeId.equalsIgnoreCase(nodes[i].id)) return i;
  }
  return -1;
}

bool isNodeOnline(int idx, unsigned long now) {
  return nodes[idx].hasData && (now - nodes[idx].lastSeenMs <= NODE_TIMEOUT_MS);
}

int pickPriorityNodeIndex(unsigned long now) {
  // Prioritaskan node BAHAYA, lalu WASPADA
  for (int i = 0; i < NODE_COUNT; i++) {
    if (isNodeOnline(i, now) && nodes[i].status == "BAHAYA") return i;
  }
  for (int i = 0; i < NODE_COUNT; i++) {
    if (isNodeOnline(i, now) && nodes[i].status == "WASPADA") return i;
  }
  return activeDisplayIdx;
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) return;

  String nodeId = doc["node_id"] | "";
  if (nodeId.isEmpty()) {
    String t = String(topic);
    int slash = t.lastIndexOf('/');
    if (slash >= 0) nodeId = t.substring(slash + 1);
  }

  int idx = findNodeIndex(nodeId);
  if (idx < 0) return;

  nodes[idx].mq4        = doc["mq4"] | 0;
  nodes[idx].mq135      = doc["mq135"] | 0;
  nodes[idx].suhu       = doc["suhu"] | 0.0f;
  nodes[idx].kelembapan = doc["kelembapan"] | 0.0f;
  nodes[idx].jarak      = doc["jarak"] | 0;
  nodes[idx].door       = String((const char*)(doc["door"] | "LOCKED"));
  nodes[idx].status     = String((const char*)(doc["status"] | "NORMAL"));
  nodes[idx].lastSeenMs = millis();
  nodes[idx].hasData    = true;
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("MUT-IKN Display");
  lcd.setCursor(0, 1);
  lcd.print("Koneksi WiFi...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
  }
}

void connectMQTT() {
  while (!mqttClient.connected()) {
    String clientId = String("pcb2-lcd-") + String(random(1000, 9999));
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Koneksi MQTT...");
    if (mqttClient.connect(clientId.c_str())) {
      mqttClient.subscribe(MQTT_TOPIC);
      lcd.setCursor(0, 1);
      lcd.print("MQTT Terhubung!");
      delay(600);
    } else {
      lcd.setCursor(0, 1);
      lcd.print("Gagal, coba lagi");
      delay(2500);
    }
  }
}

void renderLcd(unsigned long now) {
  int idx = pickPriorityNodeIndex(now);
  bool online = isNodeOnline(idx, now);
  int lcdBat = readLocalBatteryPercent();

  char line1[21];
  char line2[21];

  if (!online) {
    snprintf(line1, sizeof(line1), "%-7s OFFLINE", nodes[idx].id);
    snprintf(line2, sizeof(line2), "Menunggu |Bat:%2d%%", lcdBat);
  } else {
    const char* stShort =
      nodes[idx].status == "BAHAYA" ? "BHY" :
      nodes[idx].status == "WASPADA" ? "WSP" : "NRM";
    const char* drShort = nodes[idx].door == "OPEN" ? "OPN" : "LCK";

    snprintf(line1, sizeof(line1), "%-7s %s  %s", nodes[idx].id, stShort, drShort);
    snprintf(line2, sizeof(line2), "M4:%4d M1:%3d", nodes[idx].mq4, nodes[idx].mq135);
  }

  lcd.setCursor(0, 0);
  lcd.print("                ");
  lcd.setCursor(0, 0);
  lcd.print(line1);

  lcd.setCursor(0, 1);
  lcd.print("                ");
  lcd.setCursor(0, 1);
  lcd.print(line2);

  if (LCD_ROWS >= 4) {
    char line3[21];
    char line4[21];
    snprintf(line3, sizeof(line3), "T:%.1fC H:%.0f%% J:%dcm",
             nodes[idx].suhu, nodes[idx].kelembapan, nodes[idx].jarak);
    snprintf(line4, sizeof(line4), "Bat LCD:%3d%%", lcdBat);
    lcd.setCursor(0, 2);
    lcd.print("                    ");
    lcd.setCursor(0, 2);
    lcd.print(line3);
    lcd.setCursor(0, 3);
    lcd.print("                    ");
    lcd.setCursor(0, 3);
    lcd.print(line4);
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  lcd.init();
  lcd.backlight();

  connectWiFi();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  connectMQTT();
}

void loop() {
  connectWiFi();
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();

  unsigned long now = millis();
  if (now - lastRotateMs >= LCD_ROTATE_MS) {
    lastRotateMs = now;
    activeDisplayIdx = (activeDisplayIdx + 1) % NODE_COUNT;
  }

  if (now - lastLcdRefreshMs >= LCD_REFRESH_MS) {
    lastLcdRefreshMs = now;
    renderLcd(now);
  }
}
