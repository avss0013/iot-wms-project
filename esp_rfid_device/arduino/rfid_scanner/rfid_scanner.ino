/*
  ESP32 RFID Scanner - Arduino Sketch (MFRC522)

  Connects to WiFi and posts RFID UID reads to the central WMS server
  Endpoint: http://<SERVER_IP>:5000/api/rfid/read

  Hardware:
  - ESP32 development board
  - MFRC522 RC522 RFID module (SPI)

  Pins (default for many ESP32 boards):
  - SDA(SS)  -> GPIO 5
  - SCK      -> GPIO 18
  - MOSI     -> GPIO 23
  - MISO     -> GPIO 19
  - RST      -> GPIO 4

  Configure SSID/PASSWORD and SERVER_IP below before uploading.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

// --- Configuration - edit these ---
const char* SSID = "ODesigns";
const char* PASSWORD = "omartaher2004";
const char* SERVER_IP = "192.168.100.18"; // set to your PC/server IP
const int SERVER_PORT = 5000;
const char* DEVICE_ID = "RFID_SCANNER_ARDUINO_01";
const char* LOCATION = "Warehouse_Arduino";

// RFID pins
constexpr uint8_t SS_PIN = 5;   // SDA / SS
constexpr uint8_t RST_PIN = 4;  // RST

MFRC522 mfrc522(SS_PIN, RST_PIN);

// LED for status
const int LED_PIN = 2; // onboard LED on many ESP32 boards

unsigned long lastReadTime = 0;
String lastUID = "";
const unsigned long READ_COOLDOWN_MS = 1500;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  SPI.begin();
  mfrc522.PCD_Init();
  delay(100);

  Serial.println("RFID Scanner starting...");
  connectWiFi();
}

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

String uidToString(MFRC522::Uid &uid) {
  String s = "";
  for (byte i = 0; i < uid.size; i++) {
    if (uid.uidByte[i] < 0x10) s += "0";
    s += String(uid.uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

bool postRFID(const String &tag_uid) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  HTTPClient http;
  String endpoint = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/rfid/read";
  http.begin(endpoint);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += String("\"device_id\":\"") + DEVICE_ID + "\"" + ",";
  payload += String("\"location\":\"") + LOCATION + "\"" + ",";
  payload += String("\"tag_uid\":\"") + tag_uid + "\"";
  payload += "}";

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

void loop() {
  // Look for new RFID cards
  if (!mfrc522.PICC_IsNewCardPresent()) {
    delay(50);
    return;
  }

  if (!mfrc522.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  String uid = uidToString(mfrc522.uid);
  unsigned long now = millis();
  if (uid != lastUID || (now - lastReadTime) > READ_COOLDOWN_MS) {
    Serial.printf("Tag detected: %s\n", uid.c_str());
    bool ok = postRFID(uid);
    if (ok) {
      digitalWrite(LED_PIN, HIGH);
      delay(120);
      digitalWrite(LED_PIN, LOW);
    } else {
      // flash twice on error
      for (int i=0;i<2;i++) { digitalWrite(LED_PIN, HIGH); delay(120); digitalWrite(LED_PIN, LOW); delay(100); }
    }
    lastUID = uid;
    lastReadTime = now;
  }

  // Halt PICC to be ready for next card
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
}
