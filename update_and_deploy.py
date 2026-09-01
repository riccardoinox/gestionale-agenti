import os
import sys
import shutil
import datetime
import subprocess
from excel_importer import import_all_excel_data

def run_update():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    desktop = os.path.expanduser(r"~\Desktop")
    
    print("=" * 60)
    print("   GESTIONALE AGENTI - AGGIORNAMENTO DATI ONLINE")
    print("=" * 60)
    print(f"Data operazione: {datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print("\n1. Ricerca file Excel aggiornati sul Desktop...")
    
    files_to_check = ["Tab1.xlsx", "ANAGRA.xlsx", "ARTICO.xlsx", "SEOR.xlsx", "TRASPORTI_2024.xlsx"]
    
    copied = 0
    copied_files = set()
    for fname in files_to_check:
        src = os.path.join(desktop, fname)
        if os.path.exists(src):
            dst = os.path.join(base_dir, fname)
            shutil.copy2(src, dst)
            print(f"   [OK] Trovato e aggiornato: {fname}")
            copied += 1
            copied_files.add(fname.lower())
            
    # Check Listino and Trasporti variants
    for item in os.listdir(desktop):
        item_lower = item.lower()
        if item_lower not in copied_files and (item_lower.startswith("nuovo listino") or item_lower.startswith("trasporti")) and item.endswith(".xlsx"):
            src = os.path.join(desktop, item)
            dst = os.path.join(base_dir, item)
            shutil.copy2(src, dst)
            print(f"   [OK] Trovato e aggiornato: {item}")
            copied += 1
            copied_files.add(item_lower)

    print(f"\n2. Elaborazione e pulizia dati (filtri clienti $ e codici interni)...")
    res = import_all_excel_data(base_dir)
    
    print(f"   - Clienti attivi: {res.get('clients', 0)}")
    print(f"   - Articoli a magazzino: {res.get('articles', 0)}")
    print(f"   - Ordini anno 2026: {res.get('orders', 0)}")
    print(f"   - Prezzi di listino: {res.get('prices', 0)}")
    print(f"   - Trasporti programmati: {res.get('transports', 0)}")

    print("\n3. Pubblicazione automatica sul Cloud (GitHub / Render)...")
    now_str = datetime.datetime.now().strftime('%d/%m/%Y %H:%M')
    try:
        # Collect all xlsx files and database in base_dir
        files_to_add = ["gestionale.db"]
        for item in os.listdir(base_dir):
            if item.endswith(".xlsx") or item.endswith(".xls"):
                files_to_add.append(item)
                
        subprocess.run(["git", "add"] + files_to_add, cwd=base_dir, check=True)
        # Check if there are changes to commit
        status = subprocess.check_output(["git", "status", "--porcelain"], cwd=base_dir).decode("utf-8")
        if status.strip():
            subprocess.run(["git", "commit", "-m", f"Aggiornamento dati del {now_str}"], cwd=base_dir, check=True)
            subprocess.run(["git", "push", "origin", "main"], cwd=base_dir, check=True)
            print("\n" + "=" * 60)
            print("   SUCCESS: AGGIORNAMENTO COMPLETATO!")
            print("   Tutti gli agenti vedranno i dati aggiornati sul link Render.")
            print("=" * 60)
        else:
            print("\n" + "=" * 60)
            print("   INFO: Nessuna modifica nei file Excel (dati gia' allineati).")
            print("=" * 60)
    except Exception as e:
        print(f"\n[!] Errore durante il push su GitHub: {e}")

if __name__ == "__main__":
    run_update()
