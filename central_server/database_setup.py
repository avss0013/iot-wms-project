import sqlite3

conn = sqlite3.connect('warehouse.db')
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
	description TEXT
	location_id INTEGER,
	FOREIGN KEY (item_id) REFERENCES items (item_id)
)
''')

print("Database and tables created successfully.")

cursor.execute("INSERT OR IGNORE INTO locations (rfid_uid, description) VALUES (?,?)",('12345678','Rack A1'))
conn.commit()
print("sample data added.")

conn.close()
