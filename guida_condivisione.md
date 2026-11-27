# 📱 Guida Semplice: Come Usare e Condividere l'App con i Colleghi

Questa guida è pensata per spiegare in modo chiaro e pratico come avviare l'applicazione e farla usare a tutti i colleghi sul proprio smartphone o computer.

---

## 🚀 1. Come avviare l'applicazione sul tuo PC

1. Vai nella cartella `App Agenti` sul tuo Desktop.
2. Fai **doppio clic** sul file **`start_server.bat`**.
3. Si aprirà una finestra nera (il server) e dopo 2 secondi si aprirà automaticamente il tuo browser con l'applicazione!
4. **Nota:** Lascia la finestra aperta finché vuoi che l'app sia utilizzabile. Per chiuderla basta chiudere la finestra.

---

## 📲 2. Come inviare il link ai colleghi (Wi-Fi dell'Ufficio)

Quando avvii `start_server.bat`, comparirà una scritta simile a questa:

```text
LINK DA INVIARE SU WHATSAPP AI COLLEGHI:
http://192.168.1.XXX:8000
```

1. Copia quel link e incollalo nella chat di WhatsApp del gruppo agenti/colleghi.
2. Chiunque sia connesso al Wi-Fi aziendale potrà cliccare sul link e usare l'app all'istante.

---

## 🌟 3. Come aggiungere l'App alla schermata Home del Telefono (Icona come vera App)

Invia queste 2 semplici istruzioni ai colleghi:

### 🍏 Su iPhone (Safari):
1. Apri il link con **Safari**.
2. Tocca il tasto **Condividi** in basso (l'icona con il quadrato e la freccia verso l'alto ⬆️).
3. Scorri verso il basso e tocca **"Aggiungi alla schermata Home"**.
4. Tocca **"Aggiungi"** in alto a destra.
5. Fatto! Sul display comparirà l'icona blu **"Gestionale"**.

### 🤖 Su Android (Chrome):
1. Apri il link con **Google Chrome**.
2. Tocca i **3 puntini** in alto a destra ⋮.
3. Tocca **"Aggiungi a schermata Home"** (o *"Installa applicazione"*).
4. Fatto! Sul display comparirà l'icona **"Gestionale"**.

---

## 🔄 4. Come funziona la Sincronizzazione dei Dati

- **All'avvio**: L'applicazione carica automaticamente i dati più recenti salvati nel database.
- **Pulsante "Sincronizza" 🔄**: In alto a destra c'è sempre un pulsante blu **"Sincronizza"**. Toccandolo, l'app si collega alla cartella condivisa di Google Drive, scarica i file aggiornati e ricalcola tutto in pochi secondi.
- **Fallback locale**: Se Google Drive non dovesse essere momentaneamente raggiungibile o offline, l'app userà istantaneamente i file Excel presenti nella cartella del computer, senza mai bloccarsi.

---

## 🌐 5. Vuoi usare l'App anche FUORI dall'ufficio (in 4G/5G da clienti)?

Se gli agenti devono consultarla mentre sono in viaggio o da un cliente:

### Opzione A: Cloudflare Tunnel (Gratuito e Senza costi)
Permette di creare un link pubblico sicuro (tipo `https://gestionale-azienda.trycloudflare.com`) direttamente dal tuo PC con un solo comando:
```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:8000
```
Il link generato funzionerà su qualsiasi telefono nel mondo con connessione internet.

### Opzione B: Hosting Cloud (es. Render.com o Railway)
Possiamo pubblicare l'app online con un dominio personalizzato e password di accesso protetta.
