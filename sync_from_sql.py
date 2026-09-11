import os
import sys
import datetime
import pyodbc
import openpyxl
import sqlite3

# Connection details for SQL Server
SQL_SERVER = "SRVBUS"
SQL_DATABASE = "INOXTUBI"
SQL_USER = "sa"
SQL_PWD = "DB1n0xBus!"

TRANSPORTS_NETWORK_PATH = r"\\srvbus\Società\TRASPORTI_2024.xlsx"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "gestionale.db")

def safe_str(val):
    if val is None:
        return ""
    return str(val).strip()

def safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def safe_int(val, default=0):
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default

def safe_date_iso(val):
    if val is None:
        return ""
    if isinstance(val, (datetime.date, datetime.datetime)):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    return s[:10]

def sync_all_from_sql(base_dir=BASE_DIR, db_path=DB_FILE):
    """
    Connects to NTS Business SQL Server in strict read-only mode using WITH (NOLOCK).
    Extracts live Clients, Articles, Orders, and Prices.
    Also reads the network Transports Excel file.
    Updates the local SQLite database gestionale.db.
    """
    print("=" * 60)
    print("   SINCRONIZZAZIONE DIRETTA DA SQL SERVER (BUSINESS NTS)")
    print("=" * 60)
    print(f"Orario avvio: {datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")

    conn_str = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={SQL_DATABASE};"
        f"UID={SQL_USER};"
        f"PWD={SQL_PWD};"
        f"TrustServerCertificate=yes;"
    )

    print("1. Connessione a Microsoft SQL Server (SRVBUS)...")
    try:
        sql_conn = pyodbc.connect(conn_str, timeout=8)
        sql_cursor = sql_conn.cursor()
        print("   [OK] Connesso in sola lettura con direttiva WITH (NOLOCK).")
    except Exception as e:
        print(f"   [ERRORE] Impossibile connettersi a SQL Server: {e}")
        return {"status": "error", "error": str(e)}

    # Connect to local SQLite DB
    lite_conn = sqlite3.connect(db_path)
    lite_cursor = lite_conn.cursor()

    # -------------------------------------------------------------
    # 1. ESTRAZIONE CLIENTI (anagra + tabcage)
    # -------------------------------------------------------------
    print("2. Estrazione Clienti da 'anagra'...")
    sql_cursor.execute("""
        SELECT 
            CAST(a.an_conto AS VARCHAR(20)) as code,
            a.an_descr1 as name,
            COALESCE(a.an_descr2, '') as name2,
            COALESCE(a.an_citta, '') as city,
            COALESCE(a.an_prov, '') as province,
            COALESCE(a.an_indir, '') as address,
            COALESCE(a.an_cap, '') as cap,
            COALESCE(a.an_email, '') as email,
            COALESCE(ag.tb_descage, 'NO AGENT') as agent_name,
            COALESCE(a.an_cell, '') as mobile,
            COALESCE(a.an_telef, '') as phone,
            COALESCE(a.an_faxtlx, '') as fax,
            COALESCE(a.an_pariva, '') as vat,
            COALESCE(a.an_codfis, '') as tax_code,
            COALESCE(a.an_contatt, '') as contact,
            COALESCE(a.an_nome, '') as first_name,
            COALESCE(a.an_cognome, '') as last_name,
            COALESCE(a.an_tipo, '') as subject_type,
            CONVERT(VARCHAR(10), a.an_dtaper, 23) as date_acq
        FROM anagra a WITH (NOLOCK)
        LEFT JOIN tabcage ag WITH (NOLOCK) ON a.an_agente = ag.tb_codcage
        WHERE a.an_tipo = 'C' AND a.an_descr1 NOT LIKE '$%'
    """)

    client_rows = []
    client_agent_map = {}
    for r in sql_cursor.fetchall():
        code = safe_str(r[0])
        name = safe_str(r[1])
        agent = safe_str(r[8]) or "NO AGENT"
        client_agent_map[code] = agent

        client_rows.append((
            code, name, safe_str(r[2]), safe_str(r[3]), safe_str(r[4]).upper(),
            safe_str(r[5]), safe_str(r[6]), safe_str(r[7]), agent,
            safe_str(r[9]), safe_str(r[10]), safe_str(r[11]), safe_str(r[12]),
            safe_str(r[13]), safe_str(r[14]), safe_str(r[15]), safe_str(r[16]),
            safe_str(r[17]), safe_str(r[18])
        ))

    lite_cursor.execute("DELETE FROM clients")
    lite_cursor.executemany("""
        INSERT OR REPLACE INTO clients (
            code, name, name2, city, province, address, cap, email, agent_name,
            mobile, phone, fax, vat, tax_code, contact, first_name, last_name, subject_type, date_acq
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, client_rows)
    print(f"   [OK] Clienti attivi caricati: {len(client_rows)}")

    # -------------------------------------------------------------
    # 2. ESTRAZIONE LISTINO PREZZI (listini 8 valido)
    # -------------------------------------------------------------
    print("3. Estrazione Listino Prezzi (Listino 8 in corso)...")
    sql_cursor.execute("""
        SELECT lc_codart, lc_prezzo
        FROM listini WITH (NOLOCK)
        WHERE lc_listino = 8 AND lc_conto = 0 AND lc_datscad >= GETDATE()
    """)
    price_map = {}
    for r in sql_cursor.fetchall():
        art_code = safe_str(r[0]).upper()
        price_val = safe_float(r[1], 0.0)
        # Keep latest or first valid price
        if art_code not in price_map or price_val > 0:
            price_map[art_code] = price_val
    print(f"   [OK] Prezzi di listino attivi: {len(price_map)}")

    # -------------------------------------------------------------
    # 3. ESTRAZIONE ARTICOLI E GIACENZE (artico + artprox)
    # -------------------------------------------------------------
    print("4. Estrazione Magazzino e Giacenze da 'artico' e 'artprox'...")
    sql_cursor.execute("""
        SELECT 
            a.ar_codart as code,
            a.ar_descr as description,
            COALESCE(px.apx_esist, 0) as esistenza,
            COALESCE(px.apx_impeg, 0) as impegnato,
            COALESCE(px.apx_ordin, 0) as ordinato,
            COALESCE(a.ar_codalt, '') as cod_altern,
            COALESCE(a.ar_unmis, 'PZ') as um,
            COALESCE(px.apx_ultcos, 0) as ultimo_costo,
            COALESCE(a.ar_conver, 1.0) as conv,
            COALESCE(a.ar_desint, '') as descr2,
            COALESCE(a.ar_sostit, '') as art_sostitutivo,
            COALESCE(a.ar_sostituito, '') as art_sostituito,
            COALESCE(a.ar_inesaur, 'N') as in_esaurim,
            COALESCE(a.ar_stalist, 'S') as a_listino
        FROM artico a WITH (NOLOCK)
        LEFT JOIN artprox px WITH (NOLOCK) ON a.ar_codart = px.apx_codart
        WHERE a.ar_codart NOT LIKE '$%'
    """)

    article_rows = []
    for r in sql_cursor.fetchall():
        code = safe_str(r[0])
        desc = safe_str(r[1])
        esist = safe_float(r[2], 0.0)
        impeg = safe_float(r[3], 0.0)
        ordin = safe_float(r[4], 0.0)
        disp_netta = round(esist - impeg, 2)
        ult_costo = safe_float(r[7], 0.0)
        price = price_map.get(code.upper(), 0.0)

        article_rows.append((
            code, desc, disp_netta, ordin, 0.0, impeg, esist, esist, 0.0,
            safe_str(r[5]), safe_str(r[6]), disp_netta, ult_costo,
            safe_float(r[8], 1.0), safe_str(r[9]), safe_str(r[10]), safe_str(r[11]),
            safe_str(r[12]).upper(), safe_str(r[13]).upper(), price
        ))

    lite_cursor.execute("DELETE FROM articles")
    lite_cursor.executemany("""
        INSERT OR REPLACE INTO articles (
            code, description, disp_netta, ordinato, prenotato, impegnato,
            esistenza, esistenza_conv, es_imp, cod_altern, um, disponib,
            ultimo_costo, conv, descr2, art_sostitutivo, art_sostituito,
            in_esaurim, a_listino, listino_prezzo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, article_rows)
    print(f"   [OK] Articoli a magazzino caricati: {len(article_rows)}")

    # -------------------------------------------------------------
    # 4. ESTRAZIONE ORDINI 2026 (testord)
    # -------------------------------------------------------------
    print("5. Estrazione Ordini Anno 2026 da 'testord'...")
    sql_cursor.execute("""
        SELECT 
            t.td_anno,
            t.td_serie,
            t.td_numord,
            CONVERT(VARCHAR(10), t.td_datord, 23) as order_date,
            CAST(t.td_conto AS VARCHAR(20)) as client_code,
            COALESCE(a.an_descr1, '') as client_name,
            CONVERT(VARCHAR(10), t.td_datcons, 23) as delivery_date,
            COALESCE(t.td_totmerce, 0.0) as total_amount,
            COALESCE(t.td_flevas, 'N') as evaso,
            COALESCE(t.td_confermato, 'N') as confermato,
            CAST(COALESCE(t.td_coddest, 0) AS VARCHAR(20)) as dest_code,
            COALESCE(t.td_riferim, '') as reference,
            COALESCE(t.td_tipobf, '') as doc_type,
            COALESCE(t.td_aperto, 'N') as aperto,
            COALESCE(t.td_sospeso, 'N') as sospeso,
            CAST(COALESCE(t.td_magaz, 1) AS VARCHAR(10)) as warehouse,
            COALESCE(ag.tb_descage, 'NO AGENT') as agent_name
        FROM testord t WITH (NOLOCK)
        LEFT JOIN anagra a WITH (NOLOCK) ON t.td_conto = a.an_conto
        LEFT JOIN tabcage ag WITH (NOLOCK) ON a.an_agente = ag.tb_codcage
        WHERE t.td_anno = 2026 AND (t.td_tipork = 'R' OR t.td_tipork = ' ' OR t.td_tipork = 'O')
        ORDER BY t.td_datord DESC, t.td_numord DESC
    """)

    order_rows = []
    for r in sql_cursor.fetchall():
        year = safe_int(r[0], 2026)
        series = safe_str(r[1])
        number = safe_int(r[2], 0)
        order_id = f"{year}_{series}_{number}".replace(" ", "")
        client_code = safe_str(r[4])
        agent_name = safe_str(r[16]) or client_agent_map.get(client_code, "NO AGENT")

        order_rows.append((
            order_id, year, series, number, safe_str(r[3]), client_code,
            safe_str(r[5]), safe_str(r[6]), safe_float(r[7], 0.0),
            safe_str(r[8]).upper(), safe_str(r[9]).upper(), safe_str(r[10]), "",
            safe_str(r[11]), safe_str(r[12]), safe_str(r[13]).upper(),
            safe_str(r[14]).upper(), safe_str(r[15]), agent_name
        ))

    lite_cursor.execute("DELETE FROM orders")
    lite_cursor.executemany("""
        INSERT OR REPLACE INTO orders (
            id, year, series, number, order_date, client_code, client_name,
            delivery_date, total_amount, evaso, confermato, dest_code, dest_desc,
            reference, doc_type, aperto, sospeso, warehouse, agent_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, order_rows)
    print(f"   [OK] Ordini 2026 caricati: {len(order_rows)}")

    # -------------------------------------------------------------
    # 5. ESTRAZIONE FATTURATO STORICO (2024, 2025, 2026) DA testmag
    # -------------------------------------------------------------
    print("6. Estrazione Fatturato Storico (2024-2026) da 'testmag'...")
    sql_cursor.execute("""
        SELECT 
            CAST(tm_conto AS VARCHAR(20)) as code,
            tm_anno,
            SUM(
                CASE 
                    WHEN tm_tipork IN ('A', 'D', 'E') THEN CAST(tm_totmerce AS float)
                    WHEN tm_tipork = 'N' THEN -CAST(tm_totmerce AS float)
                    ELSE 0 
                END
            ) as fatturato
        FROM testmag WITH (NOLOCK)
        WHERE tm_anno IN (2024, 2025, 2026) AND tm_tipork IN ('A', 'D', 'E', 'N')
        GROUP BY tm_conto, tm_anno
    """)

    turnover_rows = []
    turnover_by_client = {}
    for r in sql_cursor.fetchall():
        c_code = safe_str(r[0])
        c_year = safe_int(r[1], 0)
        c_amount = round(safe_float(r[2], 0.0), 2)
        if c_year in (2024, 2025, 2026):
            turnover_rows.append((c_code, c_year, c_amount))
            if c_code not in turnover_by_client:
                turnover_by_client[c_code] = {2024: 0.0, 2025: 0.0, 2026: 0.0}
            turnover_by_client[c_code][c_year] = c_amount

    lite_cursor.execute("DELETE FROM client_turnover")
    lite_cursor.executemany("""
        INSERT OR REPLACE INTO client_turnover (client_code, year, amount)
        VALUES (?, ?, ?)
    """, turnover_rows)

    # Aggiorna anche le colonne di riepilogo rapido sulla tabella clients
    update_client_turnover = []
    for c_code, t_data in turnover_by_client.items():
        update_client_turnover.append((
            t_data.get(2024, 0.0),
            t_data.get(2025, 0.0),
            t_data.get(2026, 0.0),
            c_code
        ))
    lite_cursor.executemany("""
        UPDATE clients 
        SET turnover_2024 = ?, turnover_2025 = ?, turnover_2026 = ?
        WHERE code = ?
    """, update_client_turnover)
    print(f"   [OK] Storico fatturato caricato: {len(turnover_rows)} record per {len(turnover_by_client)} clienti.")

    # Close SQL Server connection
    sql_conn.close()

    # -------------------------------------------------------------
    # 6. LETTURA FILE TRASPORTI DAL SERVER (TRASPORTI_2024.xlsx)
    # -------------------------------------------------------------
    print(f"7. Lettura Trasporti dal server ({TRANSPORTS_NETWORK_PATH})...")
    trans_path = TRANSPORTS_NETWORK_PATH
    if not os.path.exists(trans_path):
        # Fallback to local or desktop file
        desktop_trans = os.path.join(os.path.expanduser(r"~\Desktop"), "TRASPORTI_2024.xlsx")
        local_trans = os.path.join(base_dir, "TRASPORTI_2024.xlsx")
        trans_path = desktop_trans if os.path.exists(desktop_trans) else local_trans

    total_transports = 0
    if os.path.exists(trans_path):
        try:
            wb_trans = openpyxl.load_workbook(trans_path, read_only=True, data_only=True)
            transport_rows = []
            for sname in wb_trans.sheetnames:
                if "2026" not in sname.upper():
                    continue
                ws = wb_trans[sname]
                for i, row in enumerate(ws.iter_rows(values_only=True)):
                    if i == 0 or not row:
                        continue
                    client_name = safe_str(row[3]) if len(row) > 3 else ""
                    if not client_name or client_name.lower() == "cliente (destinazione)":
                        continue

                    day_name = safe_str(row[0]) if len(row) > 0 else ""
                    transport_date = safe_date_iso(row[1]) if len(row) > 1 else ""
                    time_slot = safe_str(row[2]) if len(row) > 2 else ""
                    city = safe_str(row[5]) if len(row) > 5 else ""
                    province = safe_str(row[6]).upper() if len(row) > 6 else ""
                    weight_kg = safe_float(row[7], 0.0) if len(row) > 7 else 0.0
                    carrier = safe_str(row[8]) if len(row) > 8 else ""
                    notes = safe_str(row[9]) if len(row) > 9 else ""
                    zone = safe_str(row[10]) if len(row) > 10 else ""
                    charge = safe_float(row[11], 0.0) if len(row) > 11 else 0.0

                    transport_rows.append((
                        transport_date, day_name, time_slot, client_name,
                        city, province, weight_kg, carrier, notes, zone, charge, sname
                    ))
            wb_trans.close()

            lite_cursor.execute("DELETE FROM transports")
            lite_cursor.executemany("""
                INSERT INTO transports (
                    transport_date, day_name, time_slot, client_name,
                    city, province, weight_kg, carrier, notes, zone, charge, sheet_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, transport_rows)
            total_transports = len(transport_rows)
            print(f"   [OK] Trasporti 2026 caricati: {total_transports}")
        except Exception as ex:
            print(f"   [AVVISO] Errore lettura file trasporti: {ex}")
    else:
        print("   [AVVISO] File trasporti non trovato nel percorso specificato.")

    # Record sync log in SQLite
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    lite_cursor.execute("""
        INSERT INTO sync_logs (
            timestamp, source, status, total_clients, total_articles, total_orders, total_prices, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        now_str, "SQL Server (SRVBUS)", "SUCCESS", len(client_rows),
        len(article_rows), len(order_rows), len(price_map),
        f"Clienti: {len(client_rows)}, Trasporti: {total_transports}"
    ))

    lite_conn.commit()
    lite_conn.close()

    print("=" * 60)
    print("   SINCRONIZZAZIONE COMPLETATA CON SUCCESSO!")
    print("=" * 60)
    return {
        "status": "success",
        "clients": len(client_rows),
        "articles": len(article_rows),
        "orders": len(order_rows),
        "prices": len(price_map),
        "transports": total_transports
    }

if __name__ == "__main__":
    sync_all_from_sql()
