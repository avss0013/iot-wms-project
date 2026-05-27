#!/usr/bin/env python3
"""
QR Code Generator with Serial Numbers
======================================
Generates printable QR codes with embedded serial numbers for the IoT WMS project.
Can be used to create codes for items, locations, or RFID tags.

Usage:
  python generate_qrcodes.py --prefix ITEM --start 1001 --count 50 --output ./qrcodes
  python generate_qrcodes.py --prefix LOCATION --start 1 --count 20 --output ./location_codes
"""

import os
import csv
import argparse
from pathlib import Path
import qrcode


def generate_qr_codes(prefix, start_number, count, output_dir, verbose=False):
    """
    Generate QR codes with serial numbers.
    
    Args:
        prefix: Prefix for the serial number (e.g., 'ITEM', 'LOC', 'RFID')
        start_number: Starting serial number
        count: Number of QR codes to generate
        output_dir: Directory to save QR code PNGs
        verbose: Print progress messages
    
    Returns:
        List of generated serial numbers
    """
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    if verbose:
        print(f"Generating {count} QR codes...")
        print(f"  Prefix: {prefix}")
        print(f"  Starting number: {start_number}")
        print(f"  Output directory: {output_path.absolute()}")
    
    generated_serials = []
    
    for i in range(count):
        serial_number = start_number + i
        # Format serial with zero-padding (e.g., ITEM-00001, LOC-00020)
        serial_code = f"{prefix}-{serial_number:05d}"
        
        try:
            # Generate QR code
            qr = qrcode.QRCode(
                version=1,  # Auto-adjust based on data size
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(serial_code)
            qr.make(fit=True)
            
            # Create image
            img = qr.make_image(fill_color="black", back_color="white")
            
            # Save with serial number as filename
            file_path = output_path / f"{serial_code}.png"
            img.save(file_path)
            generated_serials.append(serial_code)
            
            if verbose and (i + 1) % 10 == 0:
                print(f"  Generated {i + 1}/{count} QR codes...")
        
        except Exception as e:
            print(f"ERROR generating QR code for {serial_code}: {e}")
    
    if verbose:
        print(f"✓ Successfully generated {len(generated_serials)} QR codes")
    
    return generated_serials


def export_csv(serial_codes, output_dir, prefix):
    """
    Export list of generated serial numbers to CSV for tracking/import.
    
    Args:
        serial_codes: List of generated serial codes
        output_dir: Directory to save CSV
        prefix: Prefix used (for filename)
    """
    output_path = Path(output_dir)
    csv_file = output_path / f"{prefix}_serials.csv"
    
    try:
        with open(csv_file, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['Serial Number', 'Type'])
            for code in serial_codes:
                writer.writerow([code, prefix])
        print(f"✓ Exported serial numbers to {csv_file}")
    except Exception as e:
        print(f"ERROR exporting CSV: {e}")


def main():
    parser = argparse.ArgumentParser(
        description='Generate QR codes with serial numbers for the IoT WMS project'
    )
    parser.add_argument(
        '--prefix',
        type=str,
        default='ITEM',
        help='Prefix for serial numbers (e.g., ITEM, LOC, RFID). Default: ITEM'
    )
    parser.add_argument(
        '--start',
        type=int,
        default=1,
        help='Starting serial number. Default: 1'
    )
    parser.add_argument(
        '--count',
        type=int,
        default=10,
        help='Number of QR codes to generate. Default: 10'
    )
    parser.add_argument(
        '--output',
        type=str,
        default='./qr_output',
        help='Output directory for QR code PNGs. Default: ./qr_output'
    )
    parser.add_argument(
        '--csv',
        action='store_true',
        help='Export serial numbers to CSV file'
    )
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Print progress messages'
    )
    
    args = parser.parse_args()
    
    # Generate QR codes
    serials = generate_qr_codes(
        prefix=args.prefix,
        start_number=args.start,
        count=args.count,
        output_dir=args.output,
        verbose=args.verbose
    )
    
    # Export CSV if requested
    if args.csv:
        export_csv(serials, args.output, args.prefix)
    
    if args.verbose:
        print(f"\nGenerated files are in: {Path(args.output).absolute()}")
        print("You can now print the PNG files using any image viewer or print software.")


if __name__ == '__main__':
    main()
