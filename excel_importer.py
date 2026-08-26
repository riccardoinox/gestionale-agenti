import os
import openpyxl
import datetime
from typing import Dict, Any, Tuple
from database import get_db_connection, init_db

def safe_float(val, default=0.0) -> float:
    if val is None:
        return default
    try:
        if isinstance(val, (int, float)):
            return float(val)
        cleaned = str(val).replace("€", "").replace(" ", "").replace(",", ".")
        return float(cleaned)
    except Exception:
        return default

def safe_int(val, default=0) -> int:
    if val is None:
        return default
    try:
        return int(float(val))
    except Exception:
        return default

def safe_str(val) -> str:
    if val is None:
        return ""
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%d/%m/%Y")
    return str(val).strip()

def safe_date_iso(val) -> str:
    if val is None:
        return ""
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    # Try parsing common Italian date formats
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return s

def import_all_excel_data(base_dir: str = None) -> Dict[str, Any]:
    if base_dir is None:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    anagra_path = os.path.join(base_dir, "ANAGRA.xlsx")
    artico_path = os.path.join(base_dir, "ARTICO.xlsx")
    seor_path = os.path.join(base_dir, "SEOR.xlsx")
    
    # Check for Nuovo Listino file (which may have varying versions in filename)
    listino_path = None
    for fname in os.listdir(base_dir):
        if fname.lower().startswith("nuovo listino") and fname.endswith(".xlsx"):
            listino_path = os.path.join(base_dir, fname)
            break
    if not listino_path:
        listino_path = os.path.join(base_dir, "NUOVO LISTINO server ver.05.2026.xlsx")

    # 1. Read Prices from Listino
    price_map: Dict[str, float] = {}
    if os.path.exists(listino_path):
        print(f"Reading Listino from: {listino_path}")
        wb_list = openpyxl.load_workbook(listino_path, read_only=True, data_only=True)
        # Use BUSINESS sheet if exists, otherwise first sheet
        target_sheet = "BUSINESS" if "BUSINESS" in wb_list.sheetnames else wb_list.sheetnames[0]
        ws_list = wb_list[target_sheet]
        
        for row in ws_list.iter_rows(values_only=True):
            if not row or len(row) < 9:
                continue
            code = safe_str(row[1])
            if code and code.lower() != "descrizione":
                price = safe_float(row[8], 0.0)
                price_map[code.upper()] = price
        wb_list.close()
    print(f"Loaded {len(price_map)} prices from listino.")

    # 2. Read and Import Clients (ANAGRA)
    total_clients = 0
    if os.path.exists(anagra_path):
        print(f"Importing Clients from: {anagra_path}")
        wb_anagra = openpyxl.load_workbook(anagra_path, read_only=True, data_only=True)
        ws_anagra = wb_anagra.active
        
        client_rows = []
        for i, row in enumerate(ws_anagra.iter_rows(values_only=True)):
            if i == 0 or not row or row[0] is None:
                continue
            code = safe_str(row[0])
            if not code or code.lower() == "codice":
                continue
            
            name = safe_str(row[1])
            name2 = safe_str(row[2]) if len(row) > 2 else ""
            city = safe_str(row[3]) if len(row) > 3 else ""
            mobile = safe_str(row[4]) if len(row) > 4 else ""
            phone = safe_str(row[5]) if len(row) > 5 else ""
            fax = safe_str(row[6]) if len(row) > 6 else ""
            vat = safe_str(row[7]) if len(row) > 7 else ""
            tax_code = safe_str(row[8]) if len(row) > 8 else ""
            contact = safe_str(row[9]) if len(row) > 9 else ""
            subject_type = safe_str(row[14]) if len(row) > 14 else ""
            first_name = safe_str(row[15]) if len(row) > 15 else ""
            last_name = safe_str(row[16]) if len(row) > 16 else ""

            client_rows.append((
                code, name, name2, city, mobile, phone, fax, vat, tax_code, contact, first_name, last_name, subject_type
            ))

        cursor.execute("DELETE FROM clients")
        cursor.executemany("""
            INSERT OR REPLACE INTO clients (
                code, name, name2, city, mobile, phone, fax, vat, tax_code, contact, first_name, last_name, subject_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, client_rows)
        total_clients = len(client_rows)
        wb_anagra.close()
    print(f"Imported {total_clients} clients.")

    # 3. Read and Import Articles (ARTICO)
    total_articles = 0
    if os.path.exists(artico_path):
        print(f"Importing Articles from: {artico_path}")
        wb_art = openpyxl.load_workbook(artico_path, read_only=True, data_only=True)
        ws_art = wb_art.active
        
        article_rows = []
        for i, row in enumerate(ws_art.iter_rows(values_only=True)):
            if i == 0 or not row or row[0] is None:
                continue
            code = safe_str(row[0])
            if not code or code.lower() == "codice articolo":
                continue

            desc = safe_str(row[1]) if len(row) > 1 else ""
            disp_netta = safe_float(row[2]) if len(row) > 2 else 0.0
            ordinato = safe_float(row[3]) if len(row) > 3 else 0.0
            prenotato = safe_float(row[4]) if len(row) > 4 else 0.0
            impegnato = safe_float(row[5]) if len(row) > 5 else 0.0
            esistenza = safe_float(row[6]) if len(row) > 6 else 0.0
            esistenza_conv = safe_float(row[7]) if len(row) > 7 else 0.0
            es_imp = safe_float(row[8]) if len(row) > 8 else 0.0
            cod_altern = safe_str(row[9]) if len(row) > 9 else ""
            um = safe_str(row[10]) if len(row) > 10 else ""
            disponib = safe_float(row[11]) if len(row) > 11 else 0.0
            ultimo_costo = safe_float(row[12]) if len(row) > 12 else 0.0
            conv = safe_float(row[13]) if len(row) > 13 else 0.0
            descr2 = safe_str(row[14]) if len(row) > 14 else ""
            art_sostitutivo = safe_str(row[15]) if len(row) > 15 else ""
            art_sostituito = safe_str(row[16]) if len(row) > 16 else ""
            in_esaurim = safe_str(row[17]) if len(row) > 17 else ""
            a_listino = safe_str(row[18]) if len(row) > 18 else ""
            
            listino_prezzo = price_map.get(code.upper(), 0.0)

            article_rows.append((
                code, desc, disp_netta, ordinato, prenotato, impegnato, esistenza, esistenza_conv,
                es_imp, cod_altern, um, disponib, ultimo_costo, conv, descr2, art_sostitutivo,
                art_sostituito, in_esaurim, a_listino, listino_prezzo
            ))

        cursor.execute("DELETE FROM articles")
        cursor.executemany("""
            INSERT OR REPLACE INTO articles (
                code, description, disp_netta, ordinato, prenotato, impegnato, esistenza, esistenza_conv,
                es_imp, cod_altern, um, disponib, ultimo_costo, conv, descr2, art_sostitutivo,
                art_sostituito, in_esaurim, a_listino, listino_prezzo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, article_rows)
        total_articles = len(article_rows)
        wb_art.close()
    print(f"Imported {total_articles} articles.")

    # 4. Read and Import Orders (SEOR)
    total_orders = 0
    if os.path.exists(seor_path):
        print(f"Importing Orders from: {seor_path}")
        wb_seor = openpyxl.load_workbook(seor_path, read_only=True, data_only=True)
        ws_seor = wb_seor.active

        order_rows = []
        for i, row in enumerate(ws_seor.iter_rows(values_only=True)):
            if i == 0 or not row or len(row) < 3:
                continue
            year = safe_int(row[0], 2026)
            series = safe_str(row[1])
            number = safe_int(row[2])
            if number == 0:
                continue
            
            order_id = f"{year}-{series.strip() or '0'}-{number}"
            order_date = safe_date_iso(row[3]) if len(row) > 3 else ""
            client_code = safe_str(row[4]) if len(row) > 4 else ""
            client_name = safe_str(row[5]) if len(row) > 5 else ""
            delivery_date = safe_date_iso(row[6]) if len(row) > 6 else ""
            total_amount = safe_float(row[7]) if len(row) > 7 else 0.0
            evaso = safe_str(row[8]).upper() if len(row) > 8 else "N"
            confermato = safe_str(row[9]).upper() if len(row) > 9 else "N"
            dest_code = safe_str(row[10]) if len(row) > 10 else ""
            dest_desc = safe_str(row[11]) if len(row) > 11 else ""
            reference = safe_str(row[14]) if len(row) > 14 else ""
            doc_type = safe_str(row[20]) if len(row) > 20 else ""
            aperto = safe_str(row[23]).upper() if len(row) > 23 else "N"
            sospeso = safe_str(row[24]).upper() if len(row) > 24 else "N"
            warehouse = safe_str(row[26]) if len(row) > 26 else ""

            order_rows.append((
                order_id, year, series, number, order_date, client_code, client_name,
                delivery_date, total_amount, evaso, confermato, dest_code, dest_desc,
                reference, doc_type, aperto, sospeso, warehouse
            ))

        cursor.execute("DELETE FROM orders")
        cursor.executemany("""
            INSERT OR REPLACE INTO orders (
                id, year, series, number, order_date, client_code, client_name,
                delivery_date, total_amount, evaso, confermato, dest_code, dest_desc,
                reference, doc_type, aperto, sospeso, warehouse
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, order_rows)
        total_orders = len(order_rows)
        wb_seor.close()
    print(f"Imported {total_orders} orders.")

    # Record sync log
    cursor.execute("""
        INSERT INTO sync_logs (source, status, total_clients, total_articles, total_orders, total_prices, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ("Excel Import", "SUCCESS", total_clients, total_articles, total_orders, len(price_map), "Import completed successfully"))

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "clients": total_clients,
        "articles": total_articles,
        "orders": total_orders,
        "prices": len(price_map),
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

if __name__ == "__main__":
    res = import_all_excel_data()
    print("Import Result:", res)
