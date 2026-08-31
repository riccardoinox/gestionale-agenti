import os
import sqlite3
import hashlib
import shutil
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Query, HTTPException, BackgroundTasks, Header, UploadFile, File, Form, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from database import get_db_connection, init_db, get_setting, set_setting
from excel_importer import import_all_excel_data

app = FastAPI(title="Gestionale Agenti Web App", version="1.1.0")

# Enable CORS for local testing and mobile access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Make sure static directory exists
os.makedirs(STATIC_DIR, exist_ok=True)

# -------------------------------------------------------------
# AUTHENTICATION & SECURITY HELPERS
# -------------------------------------------------------------
SALT = "gestionale_inoxtubi_secure_salt_2026"

def generate_token(role: str, password_secret: str) -> str:
    """Generate deterministic secure signature for session token."""
    raw = f"{role}:{password_secret}:{SALT}"
    sig = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{role}:{sig}"

def verify_token(token: Optional[str]) -> Optional[str]:
    """Verifies if token matches current active app or admin password."""
    if not token or ":" not in token:
        return None
    role, _ = token.split(":", 1)
    
    if role == "admin":
        admin_pwd = get_setting("admin_password", "admin2026")
        expected = generate_token("admin", admin_pwd)
        if token == expected:
            return "admin"
    elif role == "user":
        app_pwd = get_setting("app_password", "inoxtubi2026")
        expected = generate_token("user", app_pwd)
        if token == expected:
            return "user"
    return None

def require_auth(x_app_token: Optional[str] = Header(None)) -> str:
    role = verify_token(x_app_token)
    if not role:
        raise HTTPException(status_code=401, detail="Accesso non autorizzato o sessione scaduta.")
    return role

def require_admin(x_app_token: Optional[str] = Header(None)) -> str:
    role = verify_token(x_app_token)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato all'amministratore.")
    return role

# Startup event: Initialize DB and do initial import if DB is empty
@app.on_event("startup")
def on_startup():
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM clients")
    clients_count = cursor.fetchone()[0]
    conn.close()

    if clients_count == 0:
        print("Database is empty. Importing bundled Excel files...")
        try:
            import_all_excel_data(base_dir=BASE_DIR)
        except Exception as e:
            print(f"Initial import warning: {e}")

# -------------------------------------------------------------
# AUTH & ADMIN ENDPOINTS
# -------------------------------------------------------------
@app.post("/api/auth/login")
def login(payload: Dict[str, str]):
    password = payload.get("password", "").strip()
    if not password:
        raise HTTPException(status_code=400, detail="Password richiesta")

    admin_pwd = get_setting("admin_password", "admin2026")
    app_pwd = get_setting("app_password", "inoxtubi2026")

    if password == admin_pwd:
        token = generate_token("admin", admin_pwd)
        return {"authenticated": True, "role": "admin", "token": token}
    elif password == app_pwd:
        token = generate_token("user", app_pwd)
        return {"authenticated": True, "role": "user", "token": token}
    else:
        raise HTTPException(status_code=401, detail="Password errata.")

@app.get("/api/auth/check")
def check_auth(x_app_token: Optional[str] = Header(None)):
    role = verify_token(x_app_token)
    if role:
        return {"authenticated": True, "role": role}
    return {"authenticated": False, "role": None}

@app.get("/api/admin/settings")
def get_admin_settings(role: str = Depends(require_admin)):
    app_pwd = get_setting("app_password", "inoxtubi2026")
    return {
        "app_password": app_pwd,
        "admin_password_set": True
    }

@app.post("/api/admin/change-passwords")
def change_passwords(payload: Dict[str, str], role: str = Depends(require_admin)):
    new_app_pwd = payload.get("app_password", "").strip()
    new_admin_pwd = payload.get("admin_password", "").strip()

    if new_app_pwd:
        set_setting("app_password", new_app_pwd)
    if new_admin_pwd:
        set_setting("admin_password", new_admin_pwd)

    # Return new admin token if admin password changed
    current_admin_pwd = new_admin_pwd if new_admin_pwd else get_setting("admin_password", "admin2026")
    new_token = generate_token("admin", current_admin_pwd)

    return {
        "status": "success",
        "message": "Password aggiornate con successo!",
        "token": new_token
    }

@app.post("/api/admin/upload-excel")
async def upload_excel_files(
    files: List[UploadFile] = File(...),
    role: str = Depends(require_admin)
):
    """Direct Excel upload for Admin: updates Excel files and re-imports database."""
    uploaded_names = []
    
    for file in files:
        fname = file.filename
        fname_lower = fname.lower()
        
        # Identify target standard filename
        target_name = fname
        if "anagra" in fname_lower:
            target_name = "ANAGRA.xlsx"
        elif "artico" in fname_lower:
            target_name = "ARTICO.xlsx"
        elif "seor" in fname_lower:
            target_name = "SEOR.xlsx"
        elif "listino" in fname_lower:
            target_name = "NUOVO LISTINO server ver.05.2026.xlsx"
            
        target_path = os.path.join(BASE_DIR, target_name)
        
        content = await file.read()
        with open(target_path, "wb") as f:
            f.write(content)
        uploaded_names.append(target_name)

    # Trigger re-import
    try:
        import_res = import_all_excel_data(BASE_DIR)
        
        # Log to DB
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sync_logs (source, status, total_clients, total_articles, total_orders, total_prices, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            "Caricamento Manuale Admin",
            "SUCCESS",
            import_res["clients"],
            import_res["articles"],
            import_res["orders"],
            import_res["prices"],
            f"Caricati {len(uploaded_names)} file: {', '.join(uploaded_names)}"
        ))
        conn.commit()
        conn.close()

        return {
            "status": "success",
            "message": f"Caricati ed elaborati {len(uploaded_names)} file con successo!",
            "files": uploaded_names,
            "import_results": import_res
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore durante l'elaborazione dei file: {str(e)}")

# -------------------------------------------------------------
# APPLICATION DATA ENDPOINTS (AUTHENTICATED)
# -------------------------------------------------------------
@app.get("/api/stats")
def get_stats(role: str = Depends(require_auth)):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM clients")
    total_clients = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM articles")
    total_articles = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM articles WHERE disp_netta > 0")
    available_articles = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM orders")
    total_orders = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM orders WHERE evaso = 'N'")
    pending_res = cursor.fetchone()
    pending_orders = pending_res[0]
    pending_amount = pending_res[1]

    cursor.execute("SELECT COALESCE(SUM(total_amount), 0) FROM orders")
    total_turnover = cursor.fetchone()[0]

    cursor.execute("SELECT timestamp, status, details FROM sync_logs ORDER BY id DESC LIMIT 1")
    last_sync_row = cursor.fetchone()
    last_sync = {
        "timestamp": last_sync_row["timestamp"] if last_sync_row else "Mai",
        "status": last_sync_row["status"] if last_sync_row else "N/A",
        "details": last_sync_row["details"] if last_sync_row else ""
    } if last_sync_row else None

    conn.close()

    return {
        "clients_count": total_clients,
        "articles_count": total_articles,
        "available_articles_count": available_articles,
        "orders_count": total_orders,
        "pending_orders_count": pending_orders,
        "pending_orders_amount": round(pending_amount, 2),
        "total_turnover": round(total_turnover, 2),
        "last_sync": last_sync
    }

@app.post("/api/sync")
def trigger_sync(role: str = Depends(require_admin)):
    """Re-import current Excel files."""
    res = import_all_excel_data(base_dir=BASE_DIR)
    return res

@app.get("/api/clients")
def get_clients(
    q: Optional[str] = Query(None, description="Search term for name, code, city, vat"),
    city: Optional[str] = Query(None, description="Filter by city"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    role: str = Depends(require_auth)
):
    conn = get_db_connection()
    cursor = conn.cursor()

    params = []
    where_clauses = []

    if q:
        q_clean = f"%{q.strip()}%"
        where_clauses.append("""
            (c.code LIKE ? OR c.name LIKE ? OR c.name2 LIKE ? OR c.city LIKE ? OR c.vat LIKE ? OR c.tax_code LIKE ? OR c.phone LIKE ? OR c.mobile LIKE ?)
        """)
        params.extend([q_clean] * 8)

    if city:
        where_clauses.append("c.city LIKE ?")
        params.append(f"%{city.strip()}%")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Count total
    count_sql = f"SELECT COUNT(*) FROM clients c {where_sql}"
    cursor.execute(count_sql, params)
    total_count = cursor.fetchone()[0]

    # Select clients with order count and pending orders count
    sql = f"""
        SELECT 
            c.*,
            (SELECT COUNT(*) FROM orders o WHERE o.client_code = c.code) as orders_count,
            (SELECT COUNT(*) FROM orders o WHERE o.client_code = c.code AND o.evaso = 'N') as pending_orders_count,
            (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.client_code = c.code) as total_spent
        FROM clients c
        {where_sql}
        ORDER BY c.name ASC
        LIMIT ? OFFSET ?
    """
    cursor.execute(sql, params + [limit, offset])
    rows = cursor.fetchall()
    
    clients = [dict(row) for row in rows]
    conn.close()

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "items": clients
    }

@app.get("/api/clients/{code}")
def get_client_detail(code: str, role: str = Depends(require_auth)):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM clients WHERE code = ?", (code,))
    client_row = cursor.fetchone()
    if not client_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Cliente non trovato")

    client = dict(client_row)

    # Fetch orders for this client
    cursor.execute("""
        SELECT * FROM orders 
        WHERE client_code = ? 
        ORDER BY order_date DESC, number DESC
    """, (code,))
    orders = [dict(row) for row in cursor.fetchall()]

    # Summary
    total_orders = len(orders)
    pending_orders = sum(1 for o in orders if o["evaso"] == "N")
    total_amount = sum(o["total_amount"] or 0 for o in orders)

    conn.close()

    return {
        "client": client,
        "orders": orders,
        "summary": {
            "total_orders": total_orders,
            "pending_orders": pending_orders,
            "total_amount": round(total_amount, 2)
        }
    }

@app.get("/api/articles")
def get_articles(
    q: Optional[str] = Query(None, description="Search term for code, description, alt code"),
    stock_filter: Optional[str] = Query("all", description="all, available, low_stock, out_of_stock"),
    has_price: Optional[bool] = Query(None, description="Filter articles with list price > 0"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    role: str = Depends(require_auth)
):
    conn = get_db_connection()
    cursor = conn.cursor()

    params = []
    where_clauses = []

    if q:
        q_clean = f"%{q.strip()}%"
        where_clauses.append("(code LIKE ? OR description LIKE ? OR cod_altern LIKE ? OR descr2 LIKE ?)")
        params.extend([q_clean] * 4)

    if stock_filter == "available":
        where_clauses.append("disp_netta > 0")
    elif stock_filter == "out_of_stock":
        where_clauses.append("disp_netta <= 0")
    elif stock_filter == "low_stock":
        where_clauses.append("disp_netta > 0 AND disp_netta <= 50")

    if has_price is True:
        where_clauses.append("listino_prezzo > 0")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Count total
    count_sql = f"SELECT COUNT(*) FROM articles {where_sql}"
    cursor.execute(count_sql, params)
    total_count = cursor.fetchone()[0]

    # Select articles
    sql = f"""
        SELECT * FROM articles
        {where_sql}
        ORDER BY description ASC, code ASC
        LIMIT ? OFFSET ?
    """
    cursor.execute(sql, params + [limit, offset])
    rows = cursor.fetchall()
    
    articles = [dict(row) for row in rows]
    conn.close()

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "items": articles
    }

@app.get("/api/articles/{code:path}")
def get_article_detail(code: str, role: str = Depends(require_auth)):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM articles WHERE code = ?", (code,))
    article_row = cursor.fetchone()
    if not article_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Articolo non trovato")

    article = dict(article_row)
    conn.close()

    return article

@app.get("/api/orders")
def get_orders(
    q: Optional[str] = Query(None, description="Search term for client name, reference, order number"),
    evaso: Optional[str] = Query("all", description="all, N (da evadere), S (evaso), P (parziale)"),
    client_code: Optional[str] = Query(None, description="Filter by client code"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    role: str = Depends(require_auth)
):
    conn = get_db_connection()
    cursor = conn.cursor()

    params = []
    where_clauses = []

    if q:
        q_clean = f"%{q.strip()}%"
        where_clauses.append("(client_name LIKE ? OR client_code LIKE ? OR reference LIKE ? OR id LIKE ? OR CAST(number AS TEXT) LIKE ?)")
        params.extend([q_clean] * 5)

    if evaso and evaso.upper() != "ALL":
        where_clauses.append("evaso = ?")
        params.append(evaso.upper())

    if client_code:
        where_clauses.append("client_code = ?")
        params.append(client_code)

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    # Count total
    count_sql = f"SELECT COUNT(*) FROM orders {where_sql}"
    cursor.execute(count_sql, params)
    total_count = cursor.fetchone()[0]

    # Select orders
    sql = f"""
        SELECT * FROM orders
        {where_sql}
        ORDER BY order_date DESC, number DESC
        LIMIT ? OFFSET ?
    """
    cursor.execute(sql, params + [limit, offset])
    rows = cursor.fetchall()
    
    orders = [dict(row) for row in rows]
    conn.close()

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "items": orders
    }

@app.get("/api/sync/logs")
def get_sync_logs(limit: int = 10, role: str = Depends(require_auth)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sync_logs ORDER BY id DESC LIMIT ?", (limit,))
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return logs

# Mount static files for UI
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_root():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    return {"message": "Gestionale API is running. Place index.html in static folder."}

@app.get("/manifest.json")
def serve_manifest():
    manifest_file = os.path.join(STATIC_DIR, "manifest.json")
    if os.path.exists(manifest_file):
        return FileResponse(manifest_file, media_type="application/manifest+json", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    return JSONResponse(content={})

@app.get("/sw.js")
def serve_sw():
    sw_file = os.path.join(STATIC_DIR, "sw.js")
    if os.path.exists(sw_file):
        return FileResponse(sw_file, media_type="application/javascript", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    return JSONResponse(content={})

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
