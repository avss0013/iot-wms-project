# ESP32 RFID Setup Guide

## Overview
This guide covers setting up an ESP32 microcontroller with a PN532 RFID/NFC module to create a wireless RFID scanner for the IoT WMS system. The device communicates with the central server to log and track RFID tag readings.

## Hardware Requirements

### Main Components
- **ESP32 Development Board** (WROOM-32 or equivalent)
- **PN532 RFID/NFC Module** (supports I2C, SPI, UART; 13.56 MHz)
- **RFID Tags/Cards** (ISO14443A compatible, e.g., Mifare Classic 1K)
- **Micro USB Cable** (for power and programming)
- **Breadboard** (optional, for easy prototyping)
- **Jumper Wires** (Male-to-Male and Male-to-Female)
- **Power Supply** (3.3V or 5V depending on your PN532 breakout)

### Optional Components
- **LED Indicators** (for visual feedback)
- **Buzzer** (for audio feedback on tag detection)
- **Resistors** (220Ω for LEDs, if using indicators)

---

## Pinout Diagram

### ESP32 to PN532 Wiring

The PN532 breakout supports multiple interfaces. I2C is recommended for simplicity; SPI is also supported if your breakout exposes those pins.

I2C (recommended):

```
ESP32 Pin          PN532 Pin         Description
─────────────────────────────────────────────────────
GPIO 21 (SDA)  ←→  SDA               I2C Data
GPIO 22 (SCL)  ←→  SCL               I2C Clock
GND             ←→  GND               Ground
3.3V or 5V      ←→  VCC               Power (check your breakout voltage requirements)
```

SPI (alternative):

```
ESP32 Pin          PN532 Pin         Description
─────────────────────────────────────────────────────
GPIO 23 (MOSI)  ←→  MOSI              SPI Master Out, Slave In
GPIO 19 (MISO)  ←→  MISO              SPI Master In, Slave Out
GPIO 18 (SCK)   ←→  SCK               SPI Clock
GPIO 5  (CS)    ←→  SS/SDA            Chip Select (NSS)
GND             ←→  GND               Ground
3.3V or 5V      ←→  VCC               Power (check your breakout)
```

---

## Step-by-Step Setup

### 1. Hardware Assembly

#### Interface Selection & Connection (I2C recommended)
1. Connect the PN532 module to the ESP32 using I2C (recommended):
   - PN532 SDA → ESP32 GPIO 21 (SDA)
   - PN532 SCL → ESP32 GPIO 22 (SCL)
   - PN532 GND → ESP32 GND
   - PN532 VCC → ESP32 3.3V (or 5V if your breakout requires it)

2. Optional: connect using SPI if your breakout is configured for SPI (use wiring shown above).

#### Optional LED Setup
3. If adding LED indicators:
   - Green LED (anode) → 220Ω resistor → ESP32 GPIO 13
   - Green LED (cathode) → GND
   - Red LED (anode) → 220Ω resistor → ESP32 GPIO 12
   - Red LED (cathode) → GND

### 2. Software Setup

#### Install MicroPython or Arduino IDE
Choose one approach:

**Option A: MicroPython (Recommended)**
- Download MicroPython firmware for ESP32: https://micropython.org/download/esp32/
- Use `esptool.py` to flash the firmware (example below):
  ```bash
  pip install esptool
  esptool.py --port COM3 erase_flash
  esptool.py --port COM3 write_flash -z 0x1000 esp32-20240422-v1.23.bin
  ```

**Option B: Arduino IDE**
- Install Arduino IDE: https://www.arduino.cc/en/software
- Add ESP32 board: Board Manager → Search "ESP32" → Install esp32 by Espressif
- Select Board: Tools → Board → ESP32 → WROOM32

#### Install Required Libraries

**For MicroPython:**
Install a PN532 driver or copy a MicroPython PN532 driver file to the device. Example approaches:

- Use `mpremote` to upload a PN532 driver file you include in your project.
- Or install an available PN532 package if your `mip` server provides one.

Example (copy driver and script):
```bash
mpremote connect COM3
mpremote cp pn532.py :/pn532.py   # copy a PN532 MicroPython driver file
mpremote cp rfid_scanner.py :/rfid_scanner.py
```

**For Arduino / CircuitPython / PlatformIO:**
- Arduino: install the `Adafruit PN532` library via Library Manager (`Adafruit PN532` by Adafruit).
- CircuitPython / Adafruit: use `adafruit_pn532` in your CircuitPython project.

If using Arduino, also install `ArduinoJson` if your sketch sends JSON to the server.

### 3. Configuration

#### Network Configuration
Update these values in the code:
```python
SSID = "your_wifi_network"           # WiFi network name
PASSWORD = "your_wifi_password"      # WiFi password
SERVER_IP = "192.168.1.100"         # Central server IP
SERVER_PORT = 5000                    # Central server port
DEVICE_ID = "RFID_SCANNER_01"       # Unique device identifier
```

#### RFID Reader Configuration (example)
When using I2C, configure the I2C pins in your code and initialize the PN532 driver. Example pseudocode for MicroPython:

```python
from machine import I2C, Pin
from pn532 import PN532_I2C  # driver depends on what you copy/install

i2c = I2C(0, scl=Pin(22), sda=Pin(21))
pn532 = PN532_I2C(i2c)
uid = pn532.scan_passive_target()
```

If using SPI, initialize the SPI peripheral and use `PN532_SPI` or equivalent driver class with your chosen pins.

---

## Testing & Troubleshooting

### Initial Test Steps

1. **Check Connection:**
   - Verify all wiring matches the pinout diagram
   - Use a multimeter to test continuity if experiencing issues
   - Ensure ESP32 and PN532 share a common ground

2. **Test RFID Reader:**
   - Run the provided `rfid_scanner.py` script
   - Open Serial Monitor (MicroPython WebREPL or Arduino Serial Monitor)
   - Bring an RFID tag near the reader
   - Expected output: Tag UID should appear in console

3. **Test WiFi Connection:**
   - Check that SSID and password are correct
   - Verify central server is running and accessible
   - Check firewall settings if server is not reachable

### Common Issues

| Issue | Solution |
|-------|----------|
| PN532 not responding | Verify I2C/SPI mode setting on breakout; check power (3.3V vs 5V) |
| WiFi won't connect | Check SSID/password; verify router is 2.4GHz (ESP32 doesn't support 5GHz); move closer to router |
| Tags not read | Ensure tag is ISO14443A compatible; try different tag orientations; consult PN532 driver docs |
| Connection refused to server | Verify server is running; check firewall; confirm correct IP/port in config |
| Serial data garbled | Check baud rate matches (typically 115200); verify correct COM port |

### Debug Commands

**Via Serial/REPL:**
```python
# Test I2C communication
from machine import I2C, Pin
i2c = I2C(0, scl=Pin(22), sda=Pin(21))
print(i2c.scan())  # should show PN532 I2C address if connected

# Test WiFi
import network
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect('SSID', 'PASSWORD')
print(wlan.ifconfig())  # Should show IP address

# Test LED feedback
import machine
led = machine.Pin(13, machine.Pin.OUT)
led.on()   # Turn on
led.off()  # Turn off
```

---

## Integration with Central Server

The ESP32 scanner sends RFID tag readings to the central server via HTTP POST requests:

```json
{
  "device_id": "RFID_SCANNER_01",
  "tag_uid": "1A2B3C4D",
  "tag_data": "NDEF data if available",
  "timestamp": "2026-05-20T10:30:45Z",
  "signal_strength": -65
}
```

The central server processes this data and:
- Logs the tag read event
- Performs WMS inventory updates
- Sends acknowledgment response with status

---

## Power Consumption

- **ESP32 Active:** ~80-160 mA
- **PN532 Active:** depends on breakout; typically ~30-100 mA when polling
- **Typical System Draw:** 150-250 mA
- **Recommended Power Supply:** 1A–2A depending on peripherals

---

## Next Steps

1. Flash the `rfid_scanner.py` script to ESP32
2. Configure WiFi credentials in the code
3. Verify central server is running on the configured IP/port
4. Test with RFID tags
5. Set up device permanently in target location
6. Monitor logs on central server for incoming readings

---

## References

- ESP32 Pinout: https://randomnerdtutorials.com/esp32-pinout-reference-gpios/
- PN532 Overview and Adafruit Library: https://learn.adafruit.com/adafruit-pn532-rfid-nfc
- PN532 Microcontroller Driver Examples: search for "MicroPython PN532" or "pn532 micropython" for driver files and examples
- MicroPython Docs: https://docs.micropython.org/en/latest/esp32/
- Arduino ESP32 Docs: https://docs.espressif.com/projects/arduino-esp32/en/latest/
