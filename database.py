import sqlite3
import os
from typing import Optional, List, Dict, Any

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gestionale.db")

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Clients table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clients (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name2 TEXT,
        city TEXT,
        mobile TEXT,
        phone TEXT,
        fax TEXT,
        vat TEXT,
        tax_code TEXT,
        contact TEXT,
        first_name TEXT,
        last_name TEXT,
        subject_type TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Articles table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS articles (
        code TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        disp_netta REAL DEFAULT 0,
        ordinato REAL DEFAULT 0,
        prenotato REAL DEFAULT 0,
        impegnato REAL DEFAULT 0,
        esistenza REAL DEFAULT 0,
        esistenza_conv REAL DEFAULT 0,
        es_imp REAL DEFAULT 0,
        cod_altern TEXT,
        um TEXT,
        disponib REAL DEFAULT 0,
        ultimo_costo REAL DEFAULT 0,
        conv REAL DEFAULT 0,
        descr2 TEXT,
        art_sostitutivo TEXT,
        art_sostituito TEXT,
        in_esaurim TEXT,
        a_listino TEXT,
        listino_prezzo REAL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Orders table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        year INTEGER,
        series TEXT,
        number INTEGER,
        order_date TEXT,
        client_code TEXT,
        client_name TEXT,
        delivery_date TEXT,
        total_amount REAL DEFAULT 0,
        evaso TEXT,
        confermato TEXT,
        dest_code TEXT,
        dest_desc TEXT,
        reference TEXT,
        doc_type TEXT,
        aperto TEXT,
        sospeso TEXT,
        warehouse TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Sync Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sync_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source TEXT,
        status TEXT,
        total_clients INTEGER,
        total_articles INTEGER,
        total_orders INTEGER,
        total_prices INTEGER,
        details TEXT
    )
    """)

    # Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Seed default passwords if not set
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('app_password', 'inoxtubi2026')")
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', 'admin2026')")

    # Create indexes for ultra fast search
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_city ON clients(city)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_vat ON clients(vat)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_articles_desc ON articles(description)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_articles_disp ON articles(disp_netta)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_code)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_evaso ON orders(evaso)")

    conn.commit()
    conn.close()

def get_setting(key: str, default: str = "") -> str:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default

def set_setting(key: str, value: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    """, (key, value))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
