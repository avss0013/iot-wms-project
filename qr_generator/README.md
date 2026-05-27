# QR Code Generator for IoT WMS

A standalone utility to generate printable QR codes with serial numbers for items, locations, and RFID tags in the warehouse management system.

## Installation

1. Ensure `qrcode` library is installed:
```bash
pip install qrcode[pil]
```

Or use the included `requirements.txt`:
```bash
pip install -r requirements.txt
```

## Usage

### Basic Example: Generate 50 Item QR Codes

```bash
python generate_qrcodes.py --prefix ITEM --start 1001 --count 50 --output ./item_codes
```

This generates QR codes with serial numbers like `ITEM-01001`, `ITEM-01002`, etc., and saves them as PNG files.

### Generate Location QR Codes

```bash
python generate_qrcodes.py --prefix LOC --start 1 --count 20 --output ./location_codes
```

### Generate with CSV Export for Tracking

```bash
python generate_qrcodes.py --prefix RFID --start 5001 --count 100 --output ./rfid_codes --csv --verbose
```

This also exports a `RFID_serials.csv` file listing all generated serial numbers.

## Command-Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--prefix` | Prefix for serial numbers (ITEM, LOC, RFID, etc.) | `ITEM` |
| `--start` | Starting serial number | `1` |
| `--count` | Number of QR codes to generate | `10` |
| `--output` | Output directory for PNG files | `./qr_output` |
| `--csv` | Export serial numbers to CSV | (disabled) |
| `-v, --verbose` | Print progress messages | (disabled) |

## Output

- **PNG Files**: Each QR code is saved as `{PREFIX}-{SERIAL}.png` (e.g., `ITEM-01001.png`)
- **CSV File** (optional): `{PREFIX}_serials.csv` with columns: `Serial Number`, `Type`

## Printing

1. Open the output directory in Windows Explorer or File Manager
2. Select multiple PNG files
3. Right-click → **Print** to print in batch
4. Use the printer settings to adjust size, orientation, and layout
5. Cut and laminate for durability

## Use Cases

- **Items**: Label each physical item in the warehouse
- **Locations**: Mark storage racks, bins, and shelves
- **RFID Tags**: Print and attach to equipment or containers
- **Investigation Tags**: Create unknown/placeholder item codes

## Example Workflows

### Scenario 1: Setup warehouse with 100 item codes and 20 location codes

```bash
# Generate item codes
python generate_qrcodes.py --prefix ITEM --start 1 --count 100 --output ./warehouse_setup/items --csv --verbose

# Generate location codes
python generate_qrcodes.py --prefix LOC --start 1 --count 20 --output ./warehouse_setup/locations --csv --verbose

# Print from warehouse_setup/items and warehouse_setup/locations directories
```

### Scenario 2: Generate emergency investigation codes (batch of unrecognized RFID tags)

```bash
python generate_qrcodes.py --prefix INVESTIGATE --start 9001 --count 50 --output ./investigation_codes --csv
```

## Integration with Central Server

The `generate_qrcodes.py` script generates the same format as the central server's auto-generated QR codes. You can:

1. Pre-generate items with these serial numbers
2. Manually create items in the DB with the QR codes
3. Use the CSV export to bulk-import into the system

## Notes

- QR codes use `ERROR_CORRECT_L` for balance between size and robustness
- Serial numbers are zero-padded to 5 digits for consistency
- PNG files are suitable for printing on standard labels or sticker sheets
