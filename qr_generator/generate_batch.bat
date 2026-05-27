@echo off
REM Quick QR Code Generator for IoT WMS
REM Copy this file and modify the variables below, then run it.

REM ===== CONFIGURATION =====
SET PREFIX=ITEM
SET START=1
SET COUNT=50
SET OUTPUT=qr_output

REM ===== Optional: Uncomment below to generate multiple batches in sequence =====
REM python generate_qrcodes.py --prefix ITEM --start 1 --count 100 --output item_codes --csv --verbose
REM python generate_qrcodes.py --prefix LOC --start 1 --count 20 --output location_codes --csv --verbose
REM PAUSE
REM EXIT /B

REM ===== Single batch generation =====
echo Generating %COUNT% QR codes with prefix "%PREFIX%"...
python generate_qrcodes.py --prefix %PREFIX% --start %START% --count %COUNT% --output %OUTPUT% --csv --verbose

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ QR codes generated successfully in: %OUTPUT%
    echo.
    echo Next steps:
    echo   1. Open File Explorer to: %OUTPUT%
    echo   2. Select all PNG files (Ctrl+A)
    echo   3. Right-click and Print
    echo   4. Print to label sheets or paper as needed
    echo.
    PAUSE
) else (
    echo.
    echo ERROR: QR code generation failed
    PAUSE
)
