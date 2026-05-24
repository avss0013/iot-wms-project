# Central Server

This folder contains the Python back end for the IoT Intelligent Warehouse Management System. It provides the central Flask API, serves the front-end build from `dist`, and listens for RFID events over MQTT.

## Project Structure

- `app.py` - Main Flask application, API routes, MQTT listener, and static file serving.
- `database_setup.py` - One-time SQLite bootstrap script that creates the local database and sample data.

## Architecture Overview

The server is organized around three main responsibilities:

1. API layer
   - Exposes JSON endpoints for system control, storage locations, orders, and alarms.
   - Uses Flask and Flask-CORS.

2. Data layer
   - Stores warehouse state in a local SQLite database named `warehouse.db`.
   - Reads from `locations` and `jobs` tables through helper database connections.

3. Messaging layer
   - Connects to an MQTT broker on `localhost:1883`.
   - Subscribes to `warehouse/rfid` and looks up scanned RFID UIDs in the database.

The runtime also keeps a small in-memory ASRS state object for live system status and alarms so the UI can poll quickly without always hitting the database.

## Main Components

### `app.py`

The Flask app defines these routes:

- `GET /api/system/status` - returns the current ASRS state.
- `POST /api/system/start` - sets the system to `RUNNING`.
- `POST /api/system/pause` - sets the system to `PAUSED`.
- `POST /api/system/stop` - sets the system to `IDLE` and clears the active order.
- `POST /api/system/reset` - resets the system state and clears alarms.
- `GET /api/storage/locations` - returns the configured storage locations.
- `GET /api/orders` - returns jobs from the database.
- `POST /api/orders` - creates a new job.
- `GET /api/alarms` - returns the current alarm list.

It also serves static front-end files from `dist` when the app is started directly.

### `database_setup.py`

This script creates the local SQLite database and tables if they do not already exist, then inserts a sample RFID location record.

## Data Model

Current SQLite tables:

- `locations`
  - `location_id`
  - `rfid_uid`
  - `description`

- `items`
  - `item_id`
  - `qr_code_data`
  - `description`
  - `location_id`

The Flask app currently reads `locations` and `jobs`, while the bootstrap script creates `locations` and `items`. If you plan to extend the system, make sure the database schema and API logic stay aligned.

## Requirements

Python dependencies used by the server:

- `Flask`
- `Flask-Cors`
- `paho-mqtt`

## Setup

1. Create and activate a Python virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Initialize the SQLite database:

```bash
python database_setup.py
```

4. Start the Flask server:

```bash
python app.py
```

## Runtime Notes

- The MQTT broker is expected at `localhost:1883`.
- The app expects a `dist` folder for the front-end build when serving static files.
- The server listens on `0.0.0.0:8080`.

- Devices used by this project use PN532-based RFID modules (ESP32 side). By default the ESP32 scanners are configured to use I2C (SDA GPIO21, SCL GPIO22); see the device `SETUP.md` for wiring and driver instructions.

## Suggested Next Improvements

- Add a `jobs` table migration or creation step so the API and bootstrap script use the same schema.
- Add a `requirements.txt` lock strategy if you want fully repeatable deployments.
- Add tests for the API and database bootstrap logic.