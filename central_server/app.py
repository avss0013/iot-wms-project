# ==============================================================================
# IoT Intelligent Warehouse Management System - Main Server Application
# Author: Andrew Visvalingam (with AI assistance)
#
# This Flask application serves as the central back-end for the entire system.
# It performs three primary functions:
#   1. Serves the Lovable-built ASRS front-end application (HTML, JS, CSS).
#   2. Provides a comprehensive API for the front-end to interact with.
#   3. Listens for real-time data from IoT sensors (ESP32) via MQTT.
# ==============================================================================

import os
import sqlite3
import threading
import uuid
import qrcode
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import paho.mqtt.client as mqtt
from database_setup import initialize_database

# --- Application Setup ---
app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for the front-end

# --- Configuration ---
DATABASE = 'warehouse.db'
MQTT_BROKER = 'localhost'
MQTT_PORT = 1883
MQTT_TOPIC_RFID = 'warehouse/rfid'

# --- In-Memory State Management for ASRS ---
# This dictionary holds the live status of the ASRS. It's faster than
# constantly reading from the database for real-time updates.
asrs_state = {
    "status": "IDLE",  # Can be: IDLE, RUNNING, PAUSED, ERROR
    "active_order_id": None,
    "alarms": [
        # Alarms will be added here dynamically
        # Example: {"id": 1, "message": "Bin A02 sensor blocked", "severity": "critical"}
    ]
}

# --- Database Helper Function ---
# A helper to create clean connections to the SQLite database.
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row  # This allows accessing columns by name
    return conn


initialize_database(DATABASE)

# --- MQTT Client Logic ---
# Handles communication from the ESP32 RFID sensor.
def on_connect(client, userdata, flags, rc):
    print(f"Connected to MQTT Broker with result code {rc}")
    client.subscribe(MQTT_TOPIC_RFID)

def on_message(client, userdata, msg):
    rfid_uid = msg.payload.decode('utf-8')
    print(f"[MQTT] Received RFID UID: {rfid_uid} from topic: {msg.topic}")
    with get_db_connection() as conn:
        cursor = conn.cursor()
        location = cursor.execute("SELECT location_id, description FROM locations WHERE rfid_uid = ?", (rfid_uid,)).fetchone()

        if location:
            print(f"[MQTT] RFID UID corresponds to location: {location['description']}")
            # Simple behavior for MQTT-read location: mark any 'In Progress' job
            # for an item stored at this location as 'At Location'.
            job = cursor.execute(
                '''
                SELECT j.job_id
                FROM jobs j
                JOIN items i ON j.item_id = i.item_id
                WHERE j.status = 'In Progress' AND i.location_id = ?
                LIMIT 1
                ''',
                (location['location_id'],)
            ).fetchone()

            if job:
                cursor.execute(
                    "UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?",
                    ('At Location', job['job_id'])
                )
                conn.commit()
                print(f"[MQTT] Job {job['job_id']} marked 'At Location'.")
        else:
            print("[MQTT] RFID UID not found in database.")

# ==============================================================================
# API ENDPOINTS FOR LOVABLE ASRS INTERFACE
# ==============================================================================

# --- System Status and Control Endpoints ---

@app.route('/api/system/status', methods=['GET'])
def get_system_status():
    """Returns the current live state of the ASRS."""
    print("[API GET] /api/system/status")
    return jsonify(asrs_state)

@app.route('/api/system/start', methods=['POST'])
def system_start():
    """Sets the ASRS status to RUNNING."""
    print("[API POST] /api/system/start")
    asrs_state['status'] = 'RUNNING'
    # TODO: Add real code here to start ASRS hardware
    return jsonify({"message": "ASRS system started."})

@app.route('/api/system/pause', methods=['POST'])
def system_pause():
    """Sets the ASRS status to PAUSED."""
    print("[API POST] /api/system/pause")
    asrs_state['status'] = 'PAUSED'
    # TODO: Add real code here to pause ASRS hardware
    return jsonify({"message": "ASRS system paused."})

@app.route('/api/system/stop', methods=['POST'])
def system_stop():
    """Sets the ASRS status to IDLE (simulates an emergency stop)."""
    print("[API POST] /api/system/stop")
    asrs_state['status'] = 'IDLE'
    asrs_state['active_order_id'] = None
    # TODO: Add real emergency stop code for ASRS hardware
    return jsonify({"message": "ASRS system stopped."})
    
@app.route('/api/system/reset', methods=['POST'])
def system_reset():
    """Resets the ASRS status and clears all alarms."""
    print("[API POST] /api/system/reset")
    asrs_state['status'] = 'IDLE'
    asrs_state['active_order_id'] = None
    asrs_state['alarms'] = []
    return jsonify({"message": "ASRS system reset and alarms cleared."})


# --- Storage and Inventory Endpoints ---

@app.route('/api/storage/locations', methods=['GET'])
def get_storage_locations():
    """Returns a list of all storage locations from the database."""
    print("[API GET] /api/storage/locations")
    with get_db_connection() as conn:
        locations_cursor = conn.execute('SELECT location_id, description FROM locations ORDER BY description').fetchall()
        # Format the data into the JSON structure the front-end expects
        locations = [{"id": row['description'], "status": "UNKNOWN", "contents": "UNKNOWN"} for row in locations_cursor]
        # TODO: In a real system, you would join with the 'items' table to get status and contents.
    return jsonify(locations)


@app.route('/api/items', methods=['GET'])
def get_items():
    """Returns the inventory items available for order creation."""
    print("[API GET] /api/items")
    with get_db_connection() as conn:
        items_cursor = conn.execute(
            'SELECT item_id, qr_code_data, description, location_id FROM items ORDER BY item_id DESC'
        ).fetchall()
        items = [dict(row) for row in items_cursor]
    return jsonify(items)


# --- Order (Job) Management Endpoints ---

@app.route('/api/orders', methods=['GET'])
def get_orders():
    """Returns a list of all jobs from the database."""
    print("[API GET] /api/orders")
    with get_db_connection() as conn:
        jobs_cursor = conn.execute(
            '''
            SELECT job_id, job_type, item_id, status, assigned_to, notes, created_at, updated_at
            FROM jobs
            ORDER BY job_id DESC
            '''
        ).fetchall()
        jobs = [dict(row) for row in jobs_cursor]
    return jsonify(jobs)

@app.route('/api/orders', methods=['POST'])
def create_order():
    """Creates a new job in the database."""
    data = request.get_json(silent=True) or {}
    job_type = data.get('job_type', '').strip()
    item_id = data.get('item_id')
    notes = (data.get('notes') or '').strip()
    print(f"[API POST] /api/orders - Creating new {job_type} job for item {item_id}")
    
    if not job_type or not item_id:
        return jsonify({"message": "Missing 'job_type' or 'item_id'"}), 400

    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return jsonify({"message": "'item_id' must be a number"}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            '''
            INSERT INTO jobs (job_type, item_id, status, assigned_to, notes)
            VALUES (?, ?, ?, ?, ?)
            ''',
            (job_type, item_id, 'Pending', None, notes)
        )
        conn.commit()
        new_job_id = cursor.lastrowid
    
    return jsonify({"message": "Order created successfully.", "job_id": new_job_id}), 201


@app.route('/api/orders/claim-next', methods=['POST'])
def claim_next_order():
    """Assigns the oldest pending order to the requesting worker."""
    data = request.get_json(silent=True) or {}
    worker_name = (data.get('worker_name') or 'Worker').strip() or 'Worker'
    print(f"[API POST] /api/orders/claim-next - {worker_name}")

    with get_db_connection() as conn:
        order = conn.execute(
            '''
            SELECT job_id
            FROM jobs
            WHERE status = 'Pending'
            ORDER BY created_at ASC, job_id ASC
            LIMIT 1
            '''
        ).fetchone()

        if not order:
            return jsonify({"message": "No pending orders available."}), 404

        conn.execute(
            '''
            UPDATE jobs
            SET status = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP
            WHERE job_id = ?
            ''',
            ('In Progress', worker_name, order['job_id'])
        )
        conn.commit()

    return jsonify({"message": "Order claimed successfully.", "job_id": order['job_id']})


@app.route('/api/orders/<int:job_id>/claim', methods=['POST'])
def claim_order(job_id):
    """Assigns a specific pending order to the requesting worker."""
    data = request.get_json(silent=True) or {}
    worker_name = (data.get('worker_name') or 'Worker').strip() or 'Worker'
    print(f"[API POST] /api/orders/{job_id}/claim - {worker_name}")

    with get_db_connection() as conn:
        order = conn.execute('SELECT job_id, status FROM jobs WHERE job_id = ?', (job_id,)).fetchone()
        if not order:
            return jsonify({"message": "Order not found."}), 404

        if order['status'] != 'Pending':
            return jsonify({"message": "Only pending orders can be claimed."}), 409

        conn.execute(
            '''
            UPDATE jobs
            SET status = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP
            WHERE job_id = ?
            ''',
            ('In Progress', worker_name, job_id)
        )
        conn.commit()

    return jsonify({"message": "Order claimed successfully.", "job_id": job_id})


@app.route('/api/orders/<int:job_id>/complete', methods=['POST'])
def complete_order(job_id):
    """Marks an order as completed."""
    data = request.get_json(silent=True) or {}
    worker_name = (data.get('worker_name') or 'Worker').strip() or 'Worker'
    print(f"[API POST] /api/orders/{job_id}/complete - {worker_name}")

    with get_db_connection() as conn:
        order = conn.execute('SELECT job_id, status FROM jobs WHERE job_id = ?', (job_id,)).fetchone()
        if not order:
            return jsonify({"message": "Order not found."}), 404

        conn.execute(
            '''
            UPDATE jobs
            SET status = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP
            WHERE job_id = ?
            ''',
            ('Completed', worker_name, job_id)
        )
        conn.commit()

    return jsonify({"message": "Order completed successfully.", "job_id": job_id})


@app.route('/api/dashboard/summary', methods=['GET'])
def get_dashboard_summary():
    """Returns lightweight counts for the dashboard cards."""
    print("[API GET] /api/dashboard/summary")
    with get_db_connection() as conn:
        summary = {
            'locations': conn.execute('SELECT COUNT(*) AS count FROM locations').fetchone()['count'],
            'items': conn.execute('SELECT COUNT(*) AS count FROM items').fetchone()['count'],
            'pending_orders': conn.execute("SELECT COUNT(*) AS count FROM jobs WHERE status = 'Pending'").fetchone()['count'],
            'in_progress_orders': conn.execute("SELECT COUNT(*) AS count FROM jobs WHERE status = 'In Progress'").fetchone()['count'],
            'completed_orders': conn.execute("SELECT COUNT(*) AS count FROM jobs WHERE status = 'Completed'").fetchone()['count'],
        }
    return jsonify(summary)


# --- Alarms Endpoint ---

@app.route('/api/alarms', methods=['GET'])
def get_alarms():
    """Returns the current list of active alarms."""
    print("[API GET] /api/alarms")
    return jsonify(asrs_state['alarms'])

# ==============================================================================
# STATIC FILE SERVING FOR FRONT-END
# These routes serve the compiled Lovable application from the 'dist' folder.
# ==============================================================================

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    # Never serve static files for /api/* requests
    if path.startswith('api/'):
        return jsonify({"message": "Not found"}), 404
    
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')


@app.route('/api/locations', methods=['POST'])
def create_location():
    """Creates a new storage location."""
    data = request.get_json(silent=True) or {}
    rfid_uid = (data.get('rfid_uid') or '').strip()
    description = (data.get('description') or '').strip()
    print(f"[API POST] /api/locations - Creating {description} with RFID {rfid_uid}")

    if not rfid_uid or not description:
        return jsonify({"message": "Missing 'rfid_uid' or 'description'"}), 400

    with get_db_connection() as conn:
        try:
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO locations (rfid_uid, description) VALUES (?, ?)',
                (rfid_uid, description)
            )
            conn.commit()
            location_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            return jsonify({"message": "RFID UID already exists"}), 409

    return jsonify({"message": "Location created successfully.", "location_id": location_id}), 201


@app.route('/api/rfid/read', methods=['POST'])
def rfid_read():
    """Endpoint for devices to POST RFID reads (used by ESP32 scanner)."""
    data = request.get_json(silent=True) or {}
    device_id = data.get('device_id')
    location = data.get('location')
    tag_uid = (data.get('tag_uid') or '').strip()
    print(f"[API POST] /api/rfid/read - device={device_id} tag={tag_uid} location={location}")

    if not tag_uid:
        return jsonify({"message": "Missing 'tag_uid'"}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Check if tag corresponds to a storage location
        loc = cursor.execute('SELECT location_id, description FROM locations WHERE rfid_uid = ?', (tag_uid,)).fetchone()
        if loc:
            # Find an In Progress job for an item located at this location
            job = cursor.execute(
                '''
                SELECT j.job_id
                FROM jobs j
                JOIN items i ON j.item_id = i.item_id
                WHERE j.status = 'In Progress' AND i.location_id = ?
                LIMIT 1
                ''',
                (loc['location_id'],)
            ).fetchone()

            if job:
                cursor.execute(
                    "UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?",
                    ('At Location', job['job_id'])
                )
                conn.commit()
                return jsonify({"message": "Location scan accepted.", "job_id": job['job_id'], "status": "At Location"})

            return jsonify({"message": "Location scanned but no matching In Progress job found."}), 200

        # Check if tag matches an item RFID
        item = cursor.execute('SELECT item_id, location_id FROM items WHERE rfid_uid = ?', (tag_uid,)).fetchone()
        if item:
            # Find job for this item that is At Location or In Progress
            job = cursor.execute(
                "SELECT job_id, status FROM jobs WHERE item_id = ? AND status IN ('At Location','In Progress') LIMIT 1",
                (item['item_id'],)
            ).fetchone()

            if job:
                cursor.execute(
                    "UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?",
                    ('Item Scanned', job['job_id'])
                )
                conn.commit()
                return jsonify({"message": "Item RFID accepted.", "job_id": job['job_id'], "status": "Item Scanned"})

            # Auto-claim the oldest pending job for this item so a single item scan can start the flow.
            pending_job = cursor.execute(
                "SELECT job_id FROM jobs WHERE item_id = ? AND status = 'Pending' ORDER BY created_at ASC, job_id ASC LIMIT 1",
                (item['item_id'],)
            ).fetchone()

            if pending_job:
                claimant = (data.get('worker_name') or device_id or 'AutoClaim').strip() or 'AutoClaim'
                cursor.execute(
                    """
                    UPDATE jobs
                    SET status = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE job_id = ?
                    """,
                    ('Item Scanned', claimant, pending_job['job_id'])
                )
                conn.commit()
                return jsonify({"message": "Item RFID accepted and job auto-claimed.", "job_id": pending_job['job_id'], "status": "Item Scanned", "assigned_to": claimant})

            # No job found — if the device provided a location name or location UID, map it to a location
            device_location_name = (data.get('location') or '').strip()
            if device_location_name:
                # Try to match by description (case-insensitive) or by rfid_uid
                loc = cursor.execute(
                    'SELECT location_id FROM locations WHERE LOWER(description) = LOWER(?) OR rfid_uid = ?',
                    (device_location_name, device_location_name)
                ).fetchone()

                if loc:
                    # Update the item's stored location if different (or if previously NULL)
                    if item['location_id'] != loc['location_id']:
                        cursor.execute('UPDATE items SET location_id = ? WHERE item_id = ?', (loc['location_id'], item['item_id']))
                        conn.commit()
                        print(f"[API] Updated item {item['item_id']} location -> {loc['location_id']}")
                        return jsonify({"message": "Item location updated.", "item_id": item['item_id'], "location_id": loc['location_id']})
                    else:
                        return jsonify({"message": "Item already at this location.", "item_id": item['item_id'], "location_id": loc['location_id']}), 200
                else:
                    # No matching location description; respond with helpful message
                    return jsonify({"message": "Item scanned but no matching job. Device location not registered."}), 200

            return jsonify({"message": "Item scanned but no matching job in correct state."}), 200

        return jsonify({"message": "Tag UID not recognised."}), 404


@app.route('/api/qr/read', methods=['POST'])
def qr_read():
    """Endpoint to accept QR scans which include quantity and optionally complete the job."""
    data = request.get_json(silent=True) or {}
    job_id = data.get('job_id')
    qr_code = (data.get('qr_code_data') or '').strip()
    quantity = data.get('quantity')
    worker_name = (data.get('worker_name') or 'Worker').strip()

    print(f"[API POST] /api/qr/read - job={job_id} qr={qr_code} qty={quantity} by={worker_name}")

    if not job_id or not qr_code:
        return jsonify({"message": "Missing 'job_id' or 'qr_code_data'"}), 400

    try:
        job_id = int(job_id)
    except (TypeError, ValueError):
        return jsonify({"message": "'job_id' must be an integer"}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor()
        job = cursor.execute('SELECT job_id, item_id, status FROM jobs WHERE job_id = ?', (job_id,)).fetchone()
        if not job:
            return jsonify({"message": "Job not found."}), 404

        item = cursor.execute('SELECT item_id, quantity, qr_code_data FROM items WHERE item_id = ?', (job['item_id'],)).fetchone()
        if not item or item['qr_code_data'] != qr_code:
            return jsonify({"message": "QR code does not match job item."}), 409

        # Update quantity if provided
        if quantity is not None:
            try:
                q = int(quantity)
            except (TypeError, ValueError):
                return jsonify({"message": "'quantity' must be an integer"}), 400

            new_qty = max(0, (item['quantity'] or 0) - q)
            cursor.execute('UPDATE items SET quantity = ? WHERE item_id = ?', (new_qty, item['item_id']))

        # Mark job completed and assign worker
        cursor.execute(
            "UPDATE jobs SET status = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?",
            ('Completed', worker_name, job_id)
        )
        conn.commit()

    return jsonify({"message": "QR scan logged and job completed.", "job_id": job_id}), 200


@app.route('/api/items', methods=['POST'])
def create_item():
    """Creates a new inventory item."""
    data = request.get_json(silent=True) or {}
    qr_code_data = (data.get('qr_code_data') or '').strip()
    rfid_uid = (data.get('rfid_uid') or '').strip() or None
    description = (data.get('description') or '').strip()
    location_id = data.get('location_id')
    quantity = data.get('quantity', 1)
    print(f"[API POST] /api/items - Creating {description} with QR {qr_code_data}")

    if not description:
        return jsonify({"message": "Missing 'description'"}), 400

    with get_db_connection() as conn:
        try:
            cursor = conn.cursor()
            # If caller didn't supply a QR code payload, generate one
            generated_qr = False
            if not qr_code_data:
                qr_code_data = f"ITEM-{uuid.uuid4().hex[:10].upper()}"
                generated_qr = True

            cursor.execute(
                'INSERT INTO items (qr_code_data, rfid_uid, description, location_id, quantity) VALUES (?, ?, ?, ?, ?)',
                (qr_code_data, rfid_uid, description, location_id, quantity)
            )
            conn.commit()
            item_id = cursor.lastrowid

            # Generate a PNG QR code file for convenience when we generated the value
            try:
                qrc_dir = os.path.join(os.path.dirname(__file__), 'qrcodes')
                os.makedirs(qrc_dir, exist_ok=True)
                qr_path = os.path.join(qrc_dir, f"{qr_code_data}.png")
                if generated_qr or not os.path.exists(qr_path):
                    img = qrcode.make(qr_code_data)
                    img.save(qr_path)
            except Exception as e:
                print(f"[QR] Failed to generate QR image: {e}")
        except sqlite3.IntegrityError:
            return jsonify({"message": "QR code already exists"}), 409

    return jsonify({"message": "Item created successfully.", "item_id": item_id}), 201


@app.route('/qrcodes/<qr_file>')
def serve_qrcode(qr_file):
    """Serve generated QR code images."""
    qrc_dir = os.path.join(os.path.dirname(__file__), 'qrcodes')
    # Ensure filename is safe-ish
    if '..' in qr_file or '/' in qr_file or '\\' in qr_file:
        return jsonify({"message": "Invalid file name"}), 400
    path = os.path.join(qrc_dir, qr_file)
    if not os.path.exists(path):
        return jsonify({"message": "Not found"}), 404
    return send_from_directory(qrc_dir, qr_file)


# ==============================================================================
# MAIN EXECUTION BLOCK
# ==============================================================================

if __name__ == '__main__':
    # --- Start the MQTT client in a separate background thread ---
    mqtt_client = mqtt.Client()
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    mqtt_thread = None

    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_thread = threading.Thread(target=mqtt_client.loop_forever)
        mqtt_thread.daemon = True
        mqtt_thread.start()
    except OSError as exc:
        print(f"[MQTT] Broker unavailable at {MQTT_BROKER}:{MQTT_PORT} - {exc}")
        print("[MQTT] Continuing without live RFID ingestion.")

    # --- Run the Flask Web Server ---
    # It will serve the API and the front-end on port 5000.
    # Host '0.0.0.0' makes it accessible on your local network.
    print("========================================================")
    print("= IoT WMS Server starting...")
    print("= Listening on http://0.0.0.0:5000")
    print("= Serving front-end from 'dist' folder.")
    print("= Press CTRL+C to quit.")
    print("========================================================")

    # Redefine app.static_folder to point to 'dist'
    app.static_folder = 'dist'
    app.run(host='0.0.0.0', port=5000, debug=False)
    
