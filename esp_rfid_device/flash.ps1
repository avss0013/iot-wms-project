# Flash and upload helper for Windows PowerShell
# Edit $COMPORT and $FIRMWARE before running

$COMPORT = 'COM35'           # <- change to your ESP32 COM port
$FIRMWARE = 'C:\temp\esp32-firmware.bin'  # <- change to firmware path

Write-Host "Erasing flash on $COMPORT..."
python -m esptool --port $COMPORT erase_flash

Write-Host "Writing firmware $FIRMWARE to $COMPORT..."
python -m esptool --port $COMPORT write_flash -z 0x1000 $FIRMWARE

Write-Host "Uploading rfid_scanner.py as main.py..."
mpremote connect $COMPORT fs put rfid_scanner.py :/main.py

# Optional: upload pn532 driver if you have it
#if (Test-Path pn532.py) { mpremote connect $COMPORT fs put pn532.py :/pn532.py }

Write-Host "Done. Connect to REPL with: mpremote connect $COMPORT repl"
