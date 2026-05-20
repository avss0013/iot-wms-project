# MicroPython RFID Scanner - Requirements & Libraries

## MicroPython Version
- **MicroPython 1.23.0 or later** for ESP32

## Required Libraries (for MicroPython)
The following libraries need to be installed on the ESP32:

```
mpremote mip install urequests  # For HTTP requests
mpremote mip install utime       # For timestamps (usually built-in)
mpremote mip install json        # For JSON handling (usually built-in)
```

## Installation Steps

### 1. Flash MicroPython to ESP32
```bash
# Download firmware
wget https://micropython.org/resources/firmware/esp32-20240422-v1.23.bin

# Using esptool.py
pip install esptool
esptool.py --port COM3 erase_flash
esptool.py --port COM3 write_flash -z 0x1000 esp32-20240422-v1.23.bin
```

### 2. Install Libraries
```bash
pip install mpremote
mpremote connect COM3
mpremote mip install urequests
```

### 3. Deploy Code
```bash
# Upload main script
mpremote cp rfid_scanner.py :rfid_scanner.py

# Create boot.py to auto-start (optional)
echo "import rfid_scanner; rfid_scanner.RFIDScanner()" > boot.py
mpremote cp boot.py :boot.py
```

### 4. Run Scanner
```bash
# Via REPL
mpremote repl
>>> exec(open('rfid_scanner.py').read())

# Or add to boot.py for auto-start on power-up
```

## Hardware Compatibility
- **Boards Tested**: ESP32-WROOM-32, ESP32-WROOM-32U
- **RFID Module**: RC522 / MFRC522 (13.56 MHz)
- **Tags**: ISO14443A (Mifare Classic, Mifare Ultralight, etc.)

## Configuration
Edit the constants at the top of `rfid_scanner.py`:
- `SSID` / `PASSWORD` - WiFi network credentials
- `SERVER_IP` / `SERVER_PORT` - Central server address
- `DEVICE_ID` / `LOCATION` - Scanner identification
- GPIO pins for SPI, LEDs, buzzer

## Troubleshooting

### Import Errors
If you see `ModuleNotFoundError: no module named 'urequests'`:
```bash
mpremote mip install urequests
```

### SPI Communication Issues
- Verify correct GPIO pins in config
- Check wiring (especially GND connection)
- Use oscilloscope to verify SPI signal integrity

### WiFi Connection Fails
- Try 2.4GHz WiFi (5GHz not supported)
- Check SSID/password spelling
- Verify router is broadcasting the network

### Tag Not Detected
- Ensure RC522 VCC is 5V (not 3.3V-only)
- Check antenna connection on RC522 module
- Try different tag types

## Performance Tuning
- Increase `RFID_BAUDRATE` up to 2-5 MHz for faster reads
- Decrease `read_cooldown` if reading at same location frequently
- Adjust `MAX_RETRIES` based on network reliability

## Power Considerations
- USB power: 2A minimum recommended
- Battery: 1000+ mAh LiPo recommended for 4+ hour operation
- Deep sleep available via `machine.deepsleep()` for idle periods
