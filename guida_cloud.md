# 🌐 Guida: Come Rendere l'App Online su Internet (Senza Blocchi di Rete)

A causa di firewall aziendali, restrizioni di rete e colleghi senza Python, ecco le **2 migliori soluzioni** per rendere l'applicazione accessibile a tutti via link:

---

## ⚡ SOLUZIONE 1: Avvio Online Immediato (Già pronta con 1 Clic!)

Non devi registrarti a nessun servizio, non devi configurare nulla e supera **qualsiasi firewall aziendale**.

1. Nella cartella dell'app, fai doppio clic su **`avvia_online_cloud.bat`**.
2. Dopo 5 secondi, comparirà un **link pubblico HTTPS** (es. `https://xxxx-yyyy-zzzz.trycloudflare.com`).
3. Il link viene anche automaticamente salvato nel file **`LINK_ONLINE.txt`**.
4. **Invia quel link su WhatsApp ai tuoi colleghi**:
   - Funziona su **qualsiasi telefono (iPhone, Android) e computer**.
   - Funziona sia in **4G/5G** sia su qualsiasi Wi-Fi.
   - Non richiede Python o altre installazioni sui telefoni o PC dei colleghi.
   - Possono salvarlo sulla schermata Home come una vera applicazione.

*(Nota: per questa soluzione basta lasciare la finestrella nera aperta sul tuo PC finché serve l'app)*.

---

## ☁️ SOLUZIONE 2: Server Cloud Gratuito 24/7 (Es. Render.com)

Se vuoi che l'app rimanga sempre attiva su internet anche a computer di lavoro spento:

### Passaggi su Render.com (100% Gratuito):
1. Vai su [Render.com](https://render.com) e registrati gratuitamente con la tua email.
2. Clicca su **New +** -> **Web Service**.
3. Puoi collegare il tuo account GitHub oppure caricare il repository.
4. Render leggerà automaticamente il file `render.yaml` o `requirements.txt` già preparato nella cartella:
   - **Environment**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. In 2 minuti avrai un link fisso del tipo: `https://gestionale-azienda.onrender.com`.
6. L'app si collegherà ogni giorno alla cartella di Google Drive per aggiornare i file Excel in totale autonomia!
