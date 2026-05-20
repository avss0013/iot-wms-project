"""
ESP32 RFID Scanner - MicroPython Implementation
Communicates RFID tag readings to the central WMS server
"""

import machine
import network
import socket
import time
import json
from machine import Pin, SPI
import urequests

# ============================================================================
# CONFIGURATION
# ============================================================================

# WiFi Configuration
SSID = "your_wifi_network"
PASSWORD = "your_wifi_password"
CONNECT_TIMEOUT = 10

# Central Server Configuration
SERVER_IP = "192.168.1.100"
SERVER_PORT = 5000
ENDPOINT = f"http://{SERVER_IP}:{SERVER_PORT}/api/rfid/read"
DEVICE_ID = "RFID_SCANNER_01"
LOCATION = "Warehouse_A"

# SPI Pin Configuration (for RC522)
SPI_SCK = 18
SPI_MOSI = 23
SPI_MISO = 19
CS_PIN = 5
RST_PIN = None  # Set to GPIO number if using hardware reset

# GPIO Pins for Status Indicators
GREEN_LED_PIN = 13      # Success indicator
RED_LED_PIN = 12        # Error indicator
BUZZER_PIN = 14         # Audio feedback

# RFID Reader Configuration
RFID_BAUDRATE = 1000000
RFID_READ_TIMEOUT = 5

# Retry Configuration
MAX_RETRIES = 3
RETRY_DELAY = 2

# ============================================================================
# MFRC522 RFID Reader Class (Simplified SPI Communication)
# ============================================================================

class MFRC522:
    """Minimal RC522 RFID reader implementation"""
    
    # RC522 Command bytes
    PCD_IDLE = 0x00
    PCD_AUTHENT = 0x0E
    PCD_RECEIVE = 0x08
    PCD_TRANSMIT = 0x04
    PCD_TRANSCEIVE = 0x0C
    PCD_RESETPHASE = 0x0F
    PCD_CALCCRC = 0x03
    
    # Mifare commands
    PICC_REQIDL = 0x26
    PICC_REQALL = 0x52
    PICC_ANTICOLL = 0x93
    PICC_SElECTTAG = 0x93
    PICC_AUTH1A = 0x60
    PICC_AUTH1B = 0x61
    PICC_READ = 0x30
    PICC_WRITE = 0xA0
    PICC_DECREMENT = 0xC0
    PICC_INCREMENT = 0xC1
    PICC_RESTORE = 0xC2
    PICC_TRANSFER = 0xB0
    PICC_HALT = 0x50
    
    def __init__(self, sck, mosi, miso, cs, rst=None):
        """Initialize SPI and RFID reader pins"""
        self.spi = SPI(1, baudrate=RFID_BAUDRATE, polarity=0, phase=0,
                      miso=Pin(miso), mosi=Pin(mosi), sck=Pin(sck))
        self.cs = Pin(cs, Pin.OUT)
        self.cs.on()
        
        if rst:
            self.rst = Pin(rst, Pin.OUT)
            self.rst.on()
            time.sleep_ms(50)
            self.rst.off()
            time.sleep_ms(100)
            self.rst.on()
        
        self.init_reader()
    
    def init_reader(self):
        """Initialize RC522 reader"""
        self.write_register(0x2A, 0x8D)  # TModeReg
        self.write_register(0x2B, 0x3E)  # TPrescalerReg
        self.write_register(0x15, 0x40)  # TxASKReg
        self.write_register(0x14, 0x40)  # ControlReg
        self.antenna_on()
    
    def write_register(self, reg, value):
        """Write value to register"""
        self.cs.off()
        self.spi.write(bytes([(reg << 1) & 0x7E, value]))
        self.cs.on()
    
    def read_register(self, reg):
        """Read value from register"""
        self.cs.off()
        self.spi.write(bytes([((reg << 1) & 0x7E) | 0x80]))
        val = self.spi.read(1)
        self.cs.on()
        return val[0] if val else 0
    
    def antenna_on(self):
        """Turn on antenna"""
        reg = self.read_register(0x14)
        if not (reg & 0x03):
            self.write_register(0x14, reg | 0x03)
    
    def read_uid(self):
        """Read RFID tag UID (simplified version)"""
        # Request tag
        self.cs.off()
        self.spi.write(bytes([0x08, self.PICC_REQIDL]))
        time.sleep_us(100)
        response = self.spi.read(2)
        self.cs.on()
        
        if response and len(response) >= 2:
            # Anti-collision to get UID
            uid = self._get_uid()
            return uid
        return None
    
    def _get_uid(self):
        """Get UID from anti-collision"""
        self.cs.off()
        self.spi.write(bytes([0x08, self.PICC_ANTICOLL]))
        time.sleep_us(100)
        response = self.spi.read(5)
        self.cs.on()
        
        if response and len(response) >= 4:
            # Return UID as hex string (first 4 bytes)
            return ''.join(['{:02X}'.format(b) for b in response[:4]])
        return None

# ============================================================================
# STATUS INDICATORS
# ============================================================================

class StatusLED:
    """Control status LEDs and buzzer"""
    
    def __init__(self, green_pin, red_pin, buzzer_pin=None):
        self.green = Pin(green_pin, Pin.OUT)
        self.red = Pin(red_pin, Pin.OUT)
        self.buzzer = Pin(buzzer_pin, Pin.OUT) if buzzer_pin else None
        self.green.off()
        self.red.off()
    
    def success(self):
        """Flash green LED and beep on successful read"""
        self.green.on()
        if self.buzzer:
            self.buzzer.on()
            time.sleep_ms(100)
            self.buzzer.off()
        time.sleep_ms(200)
        self.green.off()
    
    def error(self):
        """Flash red LED twice on error"""
        for _ in range(2):
            self.red.on()
            time.sleep_ms(150)
            self.red.off()
            time.sleep_ms(150)
    
    def warning(self):
        """Pulse yellow (green + red) on warning"""
        self.green.on()
        self.red.on()
        time.sleep_ms(100)
        self.green.off()
        self.red.off()

# ============================================================================
# NETWORK CONNECTIVITY
# ============================================================================

class WiFiConnection:
    """Handle WiFi connection to network"""
    
    def __init__(self, ssid, password, timeout=CONNECT_TIMEOUT):
        self.ssid = ssid
        self.password = password
        self.timeout = timeout
        self.wlan = network.WLAN(network.STA_IF)
    
    def connect(self):
        """Connect to WiFi network"""
        print(f"[WiFi] Connecting to {self.ssid}...")
        self.wlan.active(True)
        
        if not self.wlan.isconnected():
            self.wlan.connect(self.ssid, self.password)
            
            start_time = time.time()
            while not self.wlan.isconnected():
                if time.time() - start_time > self.timeout:
                    print("[WiFi] Connection timeout!")
                    return False
                time.sleep(0.5)
        
        print(f"[WiFi] Connected! IP: {self.wlan.ifconfig()[0]}")
        return True
    
    def is_connected(self):
        """Check if connected"""
        return self.wlan.isconnected()

# ============================================================================
# RFID SCANNER APPLICATION
# ============================================================================

class RFIDScanner:
    """Main RFID Scanner application"""
    
    def __init__(self, device_id, location):
        self.device_id = device_id
        self.location = location
        self.last_read_uid = None
        self.read_cooldown = 1.0  # Seconds between duplicate reads
        self.last_read_time = 0
        
        # Initialize components
        print("[Init] Initializing WiFi...")
        self.wifi = WiFiConnection(SSID, PASSWORD)
        
        print("[Init] Initializing Status LEDs...")
        self.led = StatusLED(GREEN_LED_PIN, RED_LED_PIN, BUZZER_PIN)
        self.led.warning()
        
        print("[Init] Initializing RFID Reader...")
        try:
            self.rfid = MFRC522(SPI_SCK, SPI_MOSI, SPI_MISO, CS_PIN, RST_PIN)
            print("[Init] RFID Reader ready")
        except Exception as e:
            print(f"[Error] Failed to initialize RFID: {e}")
            self.led.error()
            raise
    
    def send_reading(self, tag_uid):
        """Send RFID reading to central server"""
        payload = {
            "device_id": self.device_id,
            "location": self.location,
            "tag_uid": tag_uid,
            "timestamp": self._get_timestamp(),
            "rssi": -65,  # Placeholder: would need WiFi.RSSI() equivalent
            "status": "active"
        }
        
        try:
            print(f"[Server] Sending tag {tag_uid} to server...")
            response = urequests.post(ENDPOINT, json=payload, timeout=5)
            
            if response.status_code == 200:
                print(f"[Server] Tag received successfully (Status: {response.status_code})")
                data = response.json()
                print(f"[Server] Response: {data}")
                self.led.success()
                return True
            else:
                print(f"[Server] Error: Status code {response.status_code}")
                self.led.error()
                return False
                
        except Exception as e:
            print(f"[Server] Request failed: {e}")
            self.led.error()
            return False
    
    def run(self):
        """Main application loop"""
        print("[Start] RFID Scanner started")
        
        # Connect to WiFi
        if not self.wifi.connect():
            print("[Error] Failed to connect to WiFi. Running in offline mode.")
            self.led.error()
            # Could implement local logging here
            return
        
        # Main loop
        try:
            while True:
                try:
                    # Try to read RFID tag
                    uid = self.rfid.read_uid()
                    
                    if uid:
                        current_time = time.time()
                        
                        # Prevent duplicate readings
                        if uid != self.last_read_uid or (current_time - self.last_read_time) > self.read_cooldown:
                            print(f"[RFID] Tag detected: {uid}")
                            
                            # Check WiFi connection
                            if self.wifi.is_connected():
                                self.send_reading(uid)
                            else:
                                print("[WiFi] Disconnected, attempting to reconnect...")
                                if self.wifi.connect():
                                    self.send_reading(uid)
                                else:
                                    print("[Error] Could not reconnect to WiFi")
                                    self.led.error()
                            
                            self.last_read_uid = uid
                            self.last_read_time = current_time
                    
                    time.sleep_ms(100)
                    
                except KeyboardInterrupt:
                    print("[Stop] Interrupt received")
                    break
                except Exception as e:
                    print(f"[Error] Exception in main loop: {e}")
                    self.led.error()
                    time.sleep(1)
        
        finally:
            print("[Stop] RFID Scanner stopped")
            self.led.warning()
    
    @staticmethod
    def _get_timestamp():
        """Get current timestamp in ISO format"""
        # MicroPython timestamp (simplified)
        import utime
        tm = utime.localtime()
        return "{:04d}-{:02d}-{:02d}T{:02d}:{:02d}:{:02d}Z".format(
            tm[0], tm[1], tm[2], tm[3], tm[4], tm[5]
        )

# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    try:
        scanner = RFIDScanner(DEVICE_ID, LOCATION)
        scanner.run()
    except Exception as e:
        print(f"[Fatal] Error: {e}")
        import sys
        sys.exit(1)

