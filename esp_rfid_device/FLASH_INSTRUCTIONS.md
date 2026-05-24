ESP32 MicroPython Flashing Instructions

Overview

These steps will:
- Flash MicroPython firmware to a fresh ESP32
- Upload `rfid_scanner.py` as `main.py` so it runs on boot
- (Optional) Upload a PN532 driver file `pn532.py` if your module requires it

Prerequisites (on Windows)
- USB cable and the ESP32 plugged in
- Python 3 installed
- `pip` available
- Your PC COM port for the ESP32 (e.g., COM3)

Install tools

```powershell
pip install esptool mpremote
```

Download MicroPython firmware

- Visit https://micropython.org/download/esp32/ and download the latest stable `esp32-*.bin` for your board.
- Save it somewhere convenient (e.g., `C:\temp\esp32-firmware.bin`).

Flash MicroPython (erase then write)

1. Erase flash

```powershell
esptool.py --port COM3 erase_flash
```

2. Write firmware (replace path and COM port)

```powershell
esptool.py --port COM3 write_flash -z 0x1000 C:\temp\esp32-firmware.bin
```

Upload the Python files with mpremote

1. Make sure `SERVER_IP` in `esp_rfid_device/rfid_scanner.py` is set to your PC's LAN IP (server prints it when started).

2. Upload files:

```powershell
mpremote connect COM3 fs put esp_rfid_device/rfid_scanner.py :/main.py
# Optional: upload your PN532 driver if you have one
# mpremote connect COM3 fs put esp_rfid_device/pn532.py :/pn532.py
```

3. Open REPL to watch output:

```powershell
mpremote connect COM3 repl
```

Notes

- If your PN532 breakout uses I2C, copy a compatible `pn532.py` driver to the device. The SETUP.md lists approaches and links.
- The `rfid_scanner.py` in this repo is MicroPython-compatible but assumes a PN532/RC522 driver is available. If you don't have the driver, you can still test WiFi and server POST behavior by temporarily mocking tag reads in REPL.

Troubleshooting

- If `esptool.py` is not found, ensure Python Scripts directory is on PATH or use `python -m esptool`.
- Use Device Manager to confirm the COM port.
- If WiFi won't connect, ensure router is 2.4 GHz and credentials are correct.
