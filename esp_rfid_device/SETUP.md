# ESP32 RFID Setup Guide

## Overview
This guide covers setting up an ESP32 microcontroller with an RC522 RFID reader module to create a wireless RFID scanner for the IoT WMS system. The device communicates with the central server to log and track RFID tag readings.

## Hardware Requirements

### Main Components
- **ESP32 Development Board** (WROOM-32 or equivalent)
- **RC522 RFID Reader Module** (13.56 MHz, SPI interface)
- **RFID Tags/Cards** (ISO14443A compatible, e.g., Mifare Classic 1K)
- **Micro USB Cable** (for power and programming)
- **Breadboard** (optional, for easy prototyping)
- **Jumper Wires** (Male-to-Male and Male-to-Female)
- **Power Supply** (5V USB or external 5V source)

### Optional Components
- **LED Indicators** (for visual feedback)
- **Buzzer** (for audio feedback on tag detection)
- **Resistors** (220Ω for LEDs, if using indicators)

---

## Pinout Diagram

### ESP32 to RC522 RFID Module Wiring

```
ESP32 Pin          RC522 Pin         Description
─────────────────────────────────────────────────────
GPIO 19 (MISO)  ←→  MISO (6)         SPI Master In, Slave Out
GPIO 23 (MOSI)  ←→  MOSI (5)         SPI Master Out, Slave In
GPIO 18 (SCK)   ←→  SCK (3)          SPI Clock
GPIO 5 (CS/SS)  ←→  SDA (1)          Chip Select / Slave Select
GND             ←→  GND (2)          Ground
3.3V or 5V      ←→  VCC (4)          Power Supply (5V recommended)
```

### Optional LED/Buzzer Indicators

```
ESP32 Pin          Component        Description
──────────────────────────────────────────────
GPIO 13        ─→  Green LED (via 220Ω) → GND   - Success indicator
GPIO 12        ─→  Red LED (via 220Ω) → GND     - Error indicator
GPIO 14        ─→  Buzzer (+) → GND             - Audio feedback
```

---

## Step-by-Step Setup

### 1. Hardware Assembly

#### SPI Connection (Required)
1. Connect the RC522 module to the ESP32 using the SPI pins:
   - RC522 MISO → ESP32 GPIO 19
   - RC522 MOSI → ESP32 GPIO 23
   - RC522 SCK → ESP32 GPIO 18
   - RC522 SDA (CS) → ESP32 GPIO 5
   - RC522 GND → ESP32 GND
   - RC522 VCC → ESP32 5V (or 3.3V with level shifter)

2. Connect power:
   - Connect ESP32 to USB or external 5V power supply
   - Ensure both ESP32 and RC522 share a common ground

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
- Use `esptool.py` to flash the firmware:
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
```bash
mpremote mip install mpy-ocpp  # Or use WebREPL
```

**For Arduino IDE:**
1. Sketch → Include Library → Manage Libraries
2. Search and install:
   - `MFRC522 by GithubCommunity` (or `miguelbalboa/rfid`)
   - `ArduinoJson` (for JSON communication)

### 3. Configuration

#### Network Configuration
Update these values in the code:
```python
SSID = "your_wifi_network"           # WiFi network name
PASSWORD = "your_wifi_password"      # WiFi password
SERVER_IP = "192.168.1.100"         # Central server IP
SERVER_PORT = 5000                  # Central server port
DEVICE_ID = "RFID_SCANNER_01"      # Unique device identifier
```

#### RFID Reader Configuration
```python
SPI_SCK = 18       # GPIO pin for SPI clock
SPI_MOSI = 23      # GPIO pin for SPI MOSI
SPI_MISO = 19      # GPIO pin for SPI MISO
CS_PIN = 5         # GPIO pin for chip select
RST_PIN = None     # Reset pin (optional, set to GPIO for hardware reset)
```

---

## Testing & Troubleshooting

### Initial Test Steps

1. **Check Connection:**
   - Verify all wiring matches the pinout diagram
   - Use a multimeter to test continuity if experiencing issues
   - Ensure ESP32 and RC522 share common ground

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
| RC522 not detected | Verify SPI pins are correct; check power supply (5V recommended) |
| WiFi won't connect | Check SSID/password; verify router is 2.4GHz (ESP32 doesn't support 5GHz); move closer to router |
| Tags not read | Ensure tag is ISO14443A compatible; clean reader lens; try different tag positions |
| Connection refused to server | Verify server is running; check firewall; confirm correct IP/port in config |
| Serial data garbled | Check baud rate matches (typically 115200); verify correct COM port |

### Debug Commands

**Via Serial/REPL:**
```python
# Test SPI communication
import machine
spi = machine.SPI(1, baudrate=1000000, polarity=0, phase=0, miso=19, mosi=23, sck=18)

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
- **RC522 Active:** ~25-50 mA
- **Typical System Draw:** 150-200 mA
- **Recommended Power Supply:** 2A minimum (for 5V USB)

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
- MFRC522 Documentation: https://github.com/miguelbalboa/rfid
- RC522 Datasheet: https://www.nxp.com/products/rfid-nfc/rfid-reader-ics/mfrc522
- MicroPython Docs: https://docs.micropython.org/en/latest/esp32/
- Arduino ESP32 Docs: https://docs.espressif.com/projects/arduino-esp32/en/latest/

