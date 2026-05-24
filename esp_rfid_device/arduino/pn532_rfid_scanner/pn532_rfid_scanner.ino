/*
  ESP32 PN532 RFID Scanner - Arduino Sketch (I2C)

  Uses the Adafruit PN532 library in I2C mode to read RFID UIDs and POST
  them as JSON to the central server at /api/rfid/read (port 5000).

  Configure SSID, PASSWORD and SERVER_IP below before uploading.

  Wiring (I2C recommended):
    PN532 SDA -> ESP32 SDA (GPIO 21)
    PN532 SCL -> ESP32 SCL (GPIO 22)
    PN532 VCC -> 3.3V
    PN532 GND -> GND

  Libraries required:
    - Adafruit PN532 (install via Library Manager)

*/

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_PN532.h>

// --- Configuration ---
const char* SSID = "ODesigns";
const char* PASSWORD = "omartaher2004";
const char* SERVER_IP = "192.168.100.71"; // set to your PC/server IP
const int SERVER_PORT = 5000;
const char* DEVICE_ID = "RFID_SCANNER_PN532_01";
const char* LOCATION = "Rack A1"; // or Rack A2 / Rack B1 / Rack B2

// I2C pins (ESP32 default)
#define PN532_SDA 21
#define PN532_SCL 22

Adafruit_PN532 nfc(PN532_SDA, PN532_SCL);

const int LED_PIN = 2;

unsigned long lastReadTime = 0;
String lastUID = "";
const unsigned long READ_COOLDOWN_MS = 1500;

void connectWiFi() {
  Serial.printf("Connecting to %s...\n", SSID);
  WiFi.begin(SSID, PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
    if (millis() - start > 20000) {
      Serial.println("\nWiFi connection timeout. Retrying...");
      start = millis();
      WiFi.disconnect(true);
      WiFi.begin(SSID, PASSWORD);
    }
  }
  Serial.println("\nWiFi connected");
  Serial.print("IP: "); Serial.println(WiFi.localIP());
}

String uidToString(uint8_t *uid, uint8_t uidLength) {
  String s = "";
  for (uint8_t i = 0; i < uidLength; i++) {
    if (uid[i] < 0x10) s += "0";
    s += String(uid[i], HEX);
  }
  s.toUpperCase();
  return s;
}

bool postRFID(const String &tag_uid) {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  WiFiClient client;
  HTTPClient http;
  String endpoint = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/rfid/read";
  http.setTimeout(5000);
  http.begin(client, endpoint);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += String("\"device_id\":\"") + DEVICE_ID + "\"" + ",";
  payload += String("\"location\":\"") + LOCATION + "\"" + ",";
  payload += String("\"tag_uid\":\"") + tag_uid + "\"";
  payload += "}";

  Serial.print("POST payload: ");
  Serial.println(payload);

  int httpCode = http.POST(payload);
  Serial.printf("POST %s -> %d\n", endpoint.c_str(), httpCode);
  if (httpCode > 0) {
    String resp = http.getString();
    Serial.println(resp);
  } else {
    Serial.printf("HTTP POST failed, error: %s\n", http.errorToString(httpCode).c_str());
  }
  http.end();

  return (httpCode == 200 || httpCode == 201);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Wire.begin(PN532_SDA, PN532_SCL);
  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("Didn't find PN532 - check wiring");
    while (1) { delay(1000); }
  }
  Serial.print("Found PN532, firmware: 0x"); Serial.println(versiondata, HEX);
  nfc.SAMConfig();

  Serial.println("RFID PN532 Scanner starting...");
  connectWiFi();
}

void loop() {
  uint8_t success;
  uint8_t uid[7];
  uint8_t uidLength;

  success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength);
  if (success) {
    String uidStr = uidToString(uid, uidLength);
    unsigned long now = millis();
    if (uidStr != lastUID || (now - lastReadTime) > READ_COOLDOWN_MS) {
      Serial.printf("Tag detected: %s\n", uidStr.c_str());
      bool ok = postRFID(uidStr);
      if (ok) {
        digitalWrite(LED_PIN, HIGH);
        delay(120);
        digitalWrite(LED_PIN, LOW);
      } else {
        for (int i=0;i<2;i++) { digitalWrite(LED_PIN, HIGH); delay(120); digitalWrite(LED_PIN, LOW); delay(100); }
      }
      lastUID = uidStr;
      lastReadTime = now;
    }
  }
  delay(100);
}
