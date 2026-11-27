import os
import sys
import shutil
import datetime
from excel_importer import import_all_excel_data
from sync_from_sql import sync_all_from_sql

def run_update():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    desktop = os.path.expanduser(r"~\Desktop")
    
    print("=" * 60)
    print("   GESTIONALE AGENTI - AGGIORNAMENTO DATI LOCALE (PRIVATO)")
    print("=" * 60)
    print(f"Data operazione: {datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    
    # 1. Prova prima l'estrazione diretta da SQL Server e dal file Trasporti di rete
    res = sync_all_from_sql(base_dir)
    
    # 2. Fallback ai file Excel manuali sul Desktop se SQL Server non risponde
    if res.get("status") != "success":
        print("\n[AVVISO] SQL Server non raggiungibile. Fallback sui file Excel locali...")
        files_to_check = ["Tab1.xlsx", "ANAGRA.xlsx", "ARTICO.xlsx", "SEOR.xlsx", "TRASPORTI_2024.xlsx"]
        copied_files = set()
        for fname in files_to_check:
            src = os.path.join(desktop, fname)
            if os.path.exists(src):
                dst = os.path.join(base_dir, fname)
                shutil.copy2(src, dst)
                print(f"   [OK] Trovato e aggiornato: {fname}")
                copied_files.add(fname.lower())
                
        for item in os.listdir(desktop):
            item_lower = item.lower()
            if item_lower not in copied_files and (item_lower.startswith("nuovo listino") or item_lower.startswith("trasporti")) and item.endswith(".xlsx"):
                src = os.path.join(desktop, item)
                dst = os.path.join(base_dir, item)
                shutil.copy2(src, dst)
                print(f"   [OK] Trovato e aggiornato: {item}")
                copied_files.add(item_lower)

        res = import_all_excel_data(base_dir)
    
    print(f"\n2. Riepilogo Dati Aggiornati:")
    print(f"   - Clienti attivi: {res.get('clients', 0)}")
    print(f"   - Articoli a magazzino: {res.get('articles', 0)}")
    print(f"   - Ordini anno 2026: {res.get('orders', 0)}")
    print(f"   - Prezzi di listino: {res.get('prices', 0)}")
    print(f"   - Trasporti programmati: {res.get('transports', 0)}")

    print("\n" + "=" * 60)
    print("   SUCCESS: DATABASE LOCALE AGGIORNATO CON SUCCESSO!")
    print("   Tutti i dati rimangono riservati sul computer locale.")
    print("=" * 60)

if __name__ == "__main__":
    run_update()
