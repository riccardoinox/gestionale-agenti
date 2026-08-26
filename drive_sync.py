import os
import shutil
import datetime
import gdown
from excel_importer import import_all_excel_data
from database import get_db_connection

DEFAULT_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1IpEMQjuEiRjJ19bpvjo8Ql7qH_Qcnl0Y"

def sync_from_google_drive(folder_url: str = DEFAULT_DRIVE_FOLDER_URL, base_dir: str = None) -> dict:
    if base_dir is None:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    temp_dir = os.path.join(base_dir, "_temp_drive_sync")
    os.makedirs(temp_dir, exist_ok=True)
    
    download_success = False
    error_msg = None

    try:
        print(f"Starting Google Drive sync from {folder_url}...")
        downloaded = gdown.download_folder(
            url=folder_url,
            output=temp_dir,
            quiet=True,
            use_cookies=False
        )
        
        if downloaded and len(downloaded) > 0:
            download_success = True
            print(f"Downloaded {len(downloaded)} files from Google Drive.")
            
            # Move downloaded files to base_dir (overwriting old ones safely)
            for root, _, files in os.walk(temp_dir):
                for f in files:
                    if f.endswith(".xlsx") or f.endswith(".xls"):
                        src = os.path.join(root, f)
                        dst = os.path.join(base_dir, f)
                        # Copy or replace
                        shutil.copy2(src, dst)
                        print(f"Updated file: {f}")
        else:
            error_msg = "Nessun file scaricato da Google Drive (cartella vuota o permessi)"
    except Exception as e:
        error_msg = f"Errore durante il download da Google Drive: {str(e)}"
        print(error_msg)
    finally:
        # Cleanup temp directory
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass

    # Now run import into SQLite (using whatever files are in base_dir)
    try:
        import_res = import_all_excel_data(base_dir)
        
        # Log to database
        conn = get_db_connection()
        cursor = conn.cursor()
        status_str = "SUCCESS" if download_success else "PARTIAL_LOCAL_FALLBACK"
        details_str = "Drive Sync & Import completato" if download_success else f"Import da file locali (Drive: {error_msg})"
        
        cursor.execute("""
            INSERT INTO sync_logs (source, status, total_clients, total_articles, total_orders, total_prices, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            "Google Drive" if download_success else "Local Fallback",
            status_str,
            import_res["clients"],
            import_res["articles"],
            import_res["orders"],
            import_res["prices"],
            details_str
        ))
        conn.commit()
        conn.close()

        import_res["drive_success"] = download_success
        import_res["drive_error"] = error_msg
        return import_res
    except Exception as e:
        return {
            "status": "error",
            "message": f"Errore durante l'importazione dei dati: {str(e)}",
            "drive_success": download_success,
            "drive_error": error_msg,
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

if __name__ == "__main__":
    res = sync_from_google_drive()
    print("Sync result:", res)
