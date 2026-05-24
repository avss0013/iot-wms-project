Arduino IDE + ESP32 + RC522 setup

Steps to build & upload the sketch `rfid_scanner.ino`:

1) Install Arduino IDE (or use VS Code + PlatformIO)

2) In Arduino IDE, add ESP32 board support:
   - File -> Preferences -> Additional Boards Manager URLs: add https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   - Tools -> Board -> Boards Manager -> search 'esp32' and install esp32 by Espressif

3) Install libraries (Library Manager):
   - `MFRC522` by GithubCommunity (Miguel Balboa)
   - `ArduinoHttpClient` is optional; sketch uses `HTTPClient` built-in to ESP32 Arduino core

4) Edit `rfid_scanner.ino` and set `SSID`, `PASSWORD`, and `SERVER_IP` to your environment.

5) Select board: e.g., "ESP32 Dev Module" and the correct COM port (e.g., COM35).

6) Click Upload. Open Serial Monitor at 115200 to watch logs.

Notes
- The repo contains two Arduino sketches:
   - `rfid_scanner.ino` (MFRC522 / SPI)
   - `pn532_rfid_scanner.ino` (PN532 / I2C) — use this one if your hardware is PN532.
- For PN532 use I2C wiring (SDA->GPIO21, SCL->GPIO22) and install the `Adafruit PN532` library.
- The endpoint the device posts to is `/api/rfid/read` on port 5000 — ensure the server is reachable.
- QR scanning is handled on the web UI only; the device only reads RFID tags and sends UID payloads.
