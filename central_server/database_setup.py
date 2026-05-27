import sqlite3


def _ensure_column(cursor, table_name, column_name, column_definition):
	cursor.execute(f'PRAGMA table_info({table_name})')
	columns = {row[1] for row in cursor.fetchall()}
	if column_name not in columns:
		cursor.execute(f'ALTER TABLE {table_name} ADD COLUMN {column_definition}')


def initialize_database(db_path='warehouse.db'):
	"""Create the local SQLite schema and seed a small amount of sample data."""
	conn = sqlite3.connect(db_path)
	cursor = conn.cursor()

	cursor.execute('''
	CREATE TABLE IF NOT EXISTS locations (
		location_id INTEGER PRIMARY KEY AUTOINCREMENT,
		rfid_uid TEXT NOT NULL UNIQUE,
		description TEXT
	)
	''')

	cursor.execute('''
	CREATE TABLE IF NOT EXISTS items (
		item_id INTEGER PRIMARY KEY AUTOINCREMENT,
		qr_code_data TEXT NOT NULL UNIQUE,
		rfid_uid TEXT UNIQUE,
		description TEXT,
		location_id INTEGER,
		quantity INTEGER DEFAULT 1,
		FOREIGN KEY (location_id) REFERENCES locations (location_id)
	)
	''')
	# Ensure legacy columns exist when migrating an existing DB
	_ensure_column(cursor, 'items', 'location_id', 'location_id INTEGER')
	_ensure_column(cursor, 'items', 'rfid_uid', 'rfid_uid TEXT')
	_ensure_column(cursor, 'items', 'quantity', 'quantity INTEGER')

	cursor.execute('''
	CREATE TABLE IF NOT EXISTS jobs (
		job_id INTEGER PRIMARY KEY AUTOINCREMENT,
		job_type TEXT NOT NULL,
		item_id INTEGER NOT NULL,
		requested_quantity INTEGER,
		picked_quantity INTEGER NOT NULL DEFAULT 0,
		unit TEXT,
		status TEXT NOT NULL DEFAULT 'Pending',
		assigned_to TEXT,
		notes TEXT,
		created_at TEXT DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (item_id) REFERENCES items (item_id)
	)
	''')
	_ensure_column(cursor, 'jobs', 'requested_quantity', 'requested_quantity INTEGER')
	_ensure_column(cursor, 'jobs', 'picked_quantity', 'picked_quantity INTEGER NOT NULL DEFAULT 0')
	_ensure_column(cursor, 'jobs', 'unit', 'unit TEXT')

	cursor.execute("INSERT OR IGNORE INTO locations (location_id, rfid_uid, description) VALUES (?, ?, ?)", (1, '12345678', 'Rack A1'))
	cursor.execute("INSERT OR IGNORE INTO locations (location_id, rfid_uid, description) VALUES (?, ?, ?)", (2, '87654321', 'Rack B2'))
	cursor.execute("INSERT OR IGNORE INTO items (item_id, qr_code_data, rfid_uid, description, location_id, quantity) VALUES (?, ?, ?, ?, ?, ?)", (1, 'ITEM-001', 'TAGITEM01', 'Blue container bolts', 1, 100))
	cursor.execute("INSERT OR IGNORE INTO items (item_id, qr_code_data, rfid_uid, description, location_id, quantity) VALUES (?, ?, ?, ?, ?, ?)", (2, 'ITEM-002', 'TAGITEM02', 'Motor controller unit', 2, 5))
	cursor.execute("INSERT OR IGNORE INTO jobs (job_id, job_type, item_id, status, assigned_to, notes) VALUES (?, ?, ?, ?, ?, ?)", (1, 'pick', 1, 'Pending', None, 'Move the blue container bolts to dispatch.'))
	cursor.execute("INSERT OR IGNORE INTO jobs (job_id, job_type, item_id, status, assigned_to, notes) VALUES (?, ?, ?, ?, ?, ?)", (2, 'put', 2, 'In Progress', 'Worker A', 'Return the motor controller unit to storage.'))

	conn.commit()
	conn.close()
	print("Database and tables created successfully.")
	print("Sample data added.")


if __name__ == '__main__':
	initialize_database()
