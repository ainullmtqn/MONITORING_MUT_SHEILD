#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// --- Konfigurasi Wi-Fi & MQTT (Harus sama dengan PCB 1) ---
const char* ssid = "Wokwi-GUEST";
const char* password = "";
const char* mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;
const char* mqtt_topic = "ikn/mut/node01";

LiquidCrystal_I2C lcd(0x27, 16, 2);
WiFiClient espClient;
PubSubClient client(espClient);

void callback(char* topic, byte* payload, unsigned int length) {
  (void)topic;
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.print("Terima MQTT: ");
  Serial.println(message);

  // Uraikan JSON
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);
  if (error) {
    Serial.println("Gagal parsing JSON");
    return;
  }

  int mq4          = doc["mq4"] | 0;
  int mq135        = doc["mq135"] | 0;
  const char* st   = doc["status"] | "NORMAL";
  const char* door = doc["door"] | "LOCKED";

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Q4:");
  lcd.print(mq4);
  lcd.print(" Q135:");
  lcd.print(mq135);

  lcd.setCursor(0, 1);
  lcd.print(st);
  lcd.print(" | ");
  lcd.print(door); // Contoh tampil: "NORMAL | OPEN" atau "BAHAYA | LOCKED"
}

void setup_wifi() {
  lcd.setCursor(0, 0);
  lcd.print("Konek Wi-Fi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
  }
  lcd.clear();
  lcd.print("Wi-Fi OK!");
}

void reconnect_mqtt() {
  while (!client.connected()) {
    String clientId = "ESP32-PCB2-" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str())) {
      client.subscribe(mqtt_topic);
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("MQTT Terhubung");
      lcd.setCursor(0, 1);
      lcd.print("Menunggu data...");
    } else {
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect_mqtt();
  }
  client.loop();
}
