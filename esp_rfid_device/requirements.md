
# MicroPython RFID Scanner - Requirements & Libraries

## MicroPython Version
- **MicroPython 1.23.0 or later** for ESP32

## Required Libraries (for MicroPython)
The following libraries are commonly needed on the ESP32:

```
mpremote mip install urequests  # For HTTP requests
mpremote mip install utime       # For timestamps (usually built-in)
mpremote mip install json        # For JSON handling (usually built-in)
```

## PN532 Driver
- The PN532 requires a driver for the chosen interface (I2C or SPI). For MicroPython you can either:
	- Copy a MicroPython `pn532.py` driver file into the device filesystem (recommended for reproducibility), or
	- Install a PN532 package via `mip` if available for your environment.

Example (copy driver and install support libs):

```bash
mpremote connect COM3
mpremote cp pn532.py :/pn532.py   # copy PN532 MicroPython driver
mpremote cp rfid_scanner.py :/rfid_scanner.py
mpremote mip install urequests
```

For Arduino/C++ development use the `Adafruit PN532` library (Library Manager) or equivalent.

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
- **RFID Module**: PN532-based breakouts (I2C/SPI/UART)
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

### Communication Issues
- Verify correct GPIO pins in config
- Check wiring (especially GND connection)
- For I2C: use `i2c.scan()` in REPL to verify PN532 address is visible
- For SPI: check that the breakout is configured for SPI mode and wiring is correct

### WiFi Connection Fails
- Try 2.4GHz WiFi (5GHz not supported)
- Check SSID/password spelling
- Verify router is broadcasting the network

### Tag Not Detected
- Ensure tag is ISO14443A compatible
- Verify PN532 power voltage matches your breakout (3.3V vs 5V)
- Try different tag orientations and distances

## Performance Tuning
- Adjust polling frequency and driver timeouts in your PN532 driver
- Decrease `read_cooldown` if reading at same location frequently
- Adjust `MAX_RETRIES` based on network reliability

## Power Considerations
- USB power: 1A–2A recommended depending on peripherals
- Battery: 1000+ mAh LiPo recommended for multi-hour operation
- Deep sleep available via `machine.deepsleep()` for idle periods
