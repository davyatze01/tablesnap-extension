# TableSnap — Guida al deployment

Questa guida porta TableSnap da `dist/tablesnap-store-ready.zip` fino agli store, con monetizzazione LemonSqueezy e monitoraggio Telegram.
I passaggi marcati **🔐 APPROVAZIONE** comportano spese, creazione di account / accettazione di termini, pubblicazione online o implicazioni fiscali: li esegui tu.

---

## 0. Stato attuale (già fatto in locale)

| Elemento | Percorso | Stato |
|---|---|---|
| Estensione MV3 | `src/` | ✅ completa, permessi `activeTab`, `scripting`, `storage` (nessun avviso all'installazione) |
| Pacchetto store | `dist/tablesnap-store-ready.zip` | ✅ generato da `python scripts/build.py` |
| Icone 16/48/128 | `src/icons/` | ✅ |
| Immagini store 1280×800 (×2) + tile 440×280 | `store_assets/` | ✅ |
| Localizzazioni en/it/es/de/fr/pt | `src/_locales/` (sorgente: `scripts/generate_locales.py`) | ✅ |
| Landing + Privacy (GitHub Pages) | `docs/` | ✅ con segnaposto |
| Report settimanale Telegram | `scripts/telegram_report.py`, `.github/workflows/monitor.yml` | ✅ |
| Webhook vendite istantaneo | `cloudflare-worker/webhook.js` | ✅ |

### Comandi utili (Windows, PowerShell o cmd)

```bash
python -m pip install -r requirements.txt
```

```bash
python scripts/build.py
```

```bash
python scripts/build.py --strict
```

```bash
python scripts/generate_assets.py
```

```bash
python scripts/telegram_report.py --dry-run
```

`build.py` rigenera le traduzioni, esegue 20 test `unittest` (che includono 33 test JavaScript eseguiti con Node e la verifica incrociata di CSV/XLSX reali con i parser Python), crea lo zip e stampa la checklist dei segnaposto. `--strict` fallisce finché resta un `REPLACE_WITH_…`: usalo per la build finale. Senza Node installato i test JS vengono saltati (non falliscono).

### Prova locale dell'estensione

1. Apri `chrome://extensions` (o `edge://extensions`) → attiva **Modalità sviluppatore**.
2. **Carica estensione non pacchettizzata** → seleziona la cartella `src/`.
3. Apri una pagina con tabelle (es. una pagina Wikipedia con statistiche) e clicca l'icona TableSnap.

Anteprima del popup senza installare nulla: `python -m http.server 8765` dalla radice del progetto, poi apri `http://localhost:8765/tests/harness/popup_harness.html?lang=it&pro=1` (API `chrome.*` simulate, pagina di prova `tests/harness/fixture.html`).

---

## 1. Checklist pre-pubblicazione

1. **🔐 APPROVAZIONE: account LemonSqueezy** (sezione 2) → ottieni `CHECKOUT_URL`, store ID, product ID.
2. Compila `src/config.js`:
   - `CHECKOUT_URL`, `WEBSITE_URL`, `PRIVACY_URL`
   - `LEMONSQUEEZY_STORE_ID` e `LEMONSQUEEZY_PRODUCT_ID` (numeri): così le chiavi vendute da altri negozi LemonSqueezy vengono rifiutate.
   - `STORE_REVIEW_URL` / `EDGE_REVIEW_URL`: si conoscono solo dopo la prima pubblicazione. Pubblica la v1.0.0 con il link della landing al loro posto (oppure lasciali così: il banner recensione appare solo dopo 5 export) e aggiornali nella v1.0.1.
3. In `docs/index.html` e `docs/privacy.html` sostituisci: link agli store, link checkout, `REPLACE_WITH_CONTACT_EMAIL`, titolare del trattamento (nome/indirizzo) in privacy §1.
4. Controlla la frase sui rimborsi nella FAQ (“14 giorni”): è una promessa commerciale, adattala alla tua politica.
5. `python scripts/build.py --strict` → deve terminare con “No placeholders left”.

---

## 2. LemonSqueezy (licenze una tantum) — 🔐 APPROVAZIONE

1. Crea l'account e lo store (LemonSqueezy è *Merchant of Record*: incassa, emette fattura al cliente e versa l'IVA).
2. **Products → New product** “TableSnap Pro”, prezzo singolo (suggerito 9–19 €, *single payment*).
3. Nella variante attiva **Generate license keys**: limite attivazioni **3** (un'attivazione per profilo browser), scadenza **mai**.
4. Copia il link di checkout (Share) → `CHECKOUT_URL`. Store ID e Product ID sono visibili negli URL della dashboard / Settings.
5. Fai un acquisto in **Test mode**, incolla la chiave nel popup (Strumenti Pro → “Ho una chiave di licenza”). Il browser chiede il permesso per `api.lemonsqueezy.com`: serve solo a verificare la licenza.
6. **Settings → API** → crea una API key (solo per il report settimanale, non va mai nell'estensione).

Come funziona la licenza nell'estensione (`src/lib/license.js`):
- `POST /v1/licenses/activate` con `license_key` + `instance_name` → salva `instance_id` in `chrome.storage.local`.
- `POST /v1/licenses/validate` silenziosa ogni 7 giorni (all'avvio del browser e all'apertura del popup). Chiave rimborsata/disattivata → Pro disattivato. Offline → Pro resta attivo fino a 30 giorni dall'ultima validazione riuscita.
- “Rimuovi licenza” chiama `/deactivate` e libera lo slot.
- Limite noto: ogni licensing 100% client-side può essere aggirato da un utente esperto che modifica il codice locale. Per un prodotto da pochi euro è un compromesso accettabile (nessun server da mantenere).

---

## 3. Sito (GitHub Pages) — 🔐 APPROVAZIONE (`git push` / pubblicazione)

1. Crea un repository GitHub (es. `tablesnap-extension`) e fai il push del progetto.
2. **Settings → Pages → Build and deployment**: *Deploy from a branch*, branch `main`, cartella `/docs`.
3. URL risultante: `https://<utente>.github.io/tablesnap-extension/` → aggiorna `WEBSITE_URL`/`PRIVACY_URL` in `src/config.js` e la variabile `LANDING_URL` (sezione 5).

---

## 4. Telegram

1. In Telegram apri **@BotFather** → `/newbot` → copia il token (`TELEGRAM_BOT_TOKEN`).
2. Scrivi un messaggio qualsiasi al tuo bot, poi apri `https://api.telegram.org/bot<TOKEN>/getUpdates` e copia `message.chat.id` (`TELEGRAM_CHAT_ID`).

---

## 5. Report settimanale (GitHub Actions)

Nel repository: **Settings → Secrets and variables → Actions**

| Tipo | Nome | Valore |
|---|---|---|
| Secret | `LEMONSQUEEZY_API_KEY` | API key LemonSqueezy |
| Secret | `LEMONSQUEEZY_STORE_ID` | ID numerico dello store (opzionale, filtra gli ordini) |
| Secret | `TELEGRAM_BOT_TOKEN` | token BotFather |
| Secret | `TELEGRAM_CHAT_ID` | chat id |
| Variable | `LANDING_URL` | URL GitHub Pages |

Il workflow `.github/workflows/monitor.yml` gira ogni lunedì alle 09:00 UTC e si avvia anche a mano (**Actions → Weekly monitor → Run workflow**). Il report contiene:
- stato HTTP della landing (il job fallisce se non risponde 200, così ricevi anche l'e-mail di GitHub);
- vendite degli ultimi 7 giorni, lordo, imposte, **netto stimato** (lordo − imposte − fee LemonSqueezy 5% + 0,50; personalizzabile con `LS_FEE_PERCENT` / `LS_FEE_FIXED_CENTS`);
- transazioni dell'anno solare con avviso **DAC7**: ⚠️ da 25, 🚨 da 30 transazioni (e oltre 2.000 € se lo store è in EUR). Gli ordini in test mode sono esclusi.

Prova locale (PowerShell):

```bash
$env:LEMONSQUEEZY_API_KEY="..."; $env:LANDING_URL="https://..."; python scripts/telegram_report.py --dry-run
```

> ⚖️ Nota fiscale: il conteggio DAC7 è un promemoria tecnico, non una consulenza. Con LemonSqueezy come Merchant of Record il tuo reddito deriva dai payout LemonSqueezy: verifica con il tuo commercialista regime fiscale, partita IVA e obblighi dichiarativi. 🔐 APPROVAZIONE per qualsiasi scelta fiscale.

---

## 6. Notifica istantanea di ogni vendita (Cloudflare Workers, piano gratuito) — 🔐 APPROVAZIONE (account Cloudflare)

```bash
cd cloudflare-worker
```

```bash
npx wrangler login
```

```bash
npx wrangler deploy
```

```bash
npx wrangler secret put LEMONSQUEEZY_WEBHOOK_SECRET
```

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

```bash
npx wrangler secret put TELEGRAM_CHAT_ID
```

Poi in LemonSqueezy **Settings → Webhooks → +**: URL = indirizzo `https://tablesnap-webhook.<account>.workers.dev`, evento **order_created**, *Signing secret* = lo stesso valore di `LEMONSQUEEZY_WEBHOOK_SECRET`. Il worker verifica la firma HMAC-SHA256 (`X-Signature`), ignora gli altri eventi e risponde 500 se Telegram non risponde (LemonSqueezy ritenta).

---

## 7. Chrome Web Store — 🔐 APPROVAZIONE (quota di registrazione sviluppatore una tantum, accettazione termini, pubblicazione)

1. Registrati su https://chrome.google.com/webstore/devconsole (quota una tantum di 5 USD).
2. **New item** → carica `dist/tablesnap-store-ready.zip`.
3. **Store listing**: categoria *Productivity* (o *Developer Tools*); per ogni lingua incolla nome/riassunto/descrizione dalla sezione 9. Immagini:
   - Icona store: `src/icons/icon128.png`
   - Screenshot: `store_assets/promo_1_hero_1280x800.png`, `store_assets/promo_2_formats_1280x800.png`
   - Small promo tile: `store_assets/small_tile_440x280.png`
   - Sito: URL GitHub Pages
4. **Privacy practices**: testi pronti nella sezione 8. URL privacy policy: `…/privacy.html`.
5. **Distribution**: Public, tutte le regioni. Invia per la revisione (di solito 1–3 giorni).

## 8. Testi per “Privacy practices” (Chrome) / “Properties” (Edge)

**Single purpose**
> TableSnap detects tables and lists on the page the user is viewing and exports them, on demand, as CSV, Markdown, TSV, XLSX or JSON files generated locally in the browser.

**activeTab**
> Used to read the tables of the current tab only after the user clicks the TableSnap toolbar button. No access to other tabs or to browsing history.

**scripting**
> Injects the bundled table-detection script into the active tab when the user opens the popup, to extract table data and highlight detected tables. No remote code is used.

**storage**
> Stores user preferences, per-site export presets, the local export counter for a one-time review prompt, and (for Pro users) the license activation details — only in chrome.storage.local on the user's device.

**Optional host permission `https://api.lemonsqueezy.com/*`**
> Requested only when a user activates a purchased Pro license, to activate and periodically validate the license key with LemonSqueezy, the payment provider. No page content is sent.

**Remote code**: *No, I am not using remote code.*

**Data usage**: spunta solo *Authentication information* (license key, inviata a LemonSqueezy per l'attivazione Pro). Conferma tutte e tre le dichiarazioni (no vendita a terzi, no usi non correlati, no valutazione del credito).

---

## 9. Testi SEO per gli store (copia e incolla)

Nome e riassunto provengono già da `_locales` (lo store li legge dal pacchetto); la descrizione dettagliata va incollata a mano per ogni lingua.
Parole chiave mirate: *table extractor, web table to excel, html table to csv, copy table markdown, web scraper tables, export table chatgpt, scrape table, table capture*.

### 🇬🇧 English (en)

**Name:** TableSnap — Web Table & Data Extractor to Excel / Markdown
**Summary:** Extract any web table or list in 1 click: CSV for Excel, Markdown for ChatGPT & Claude, TSV. 100% local & private.

**Description:**
```
TableSnap turns any table on any website into clean data in one click — no copy-paste mess, no sign-up, no servers.

★ WHAT IT DOES
• Detects every HTML table, data grid and structured list on the page
• Hover a result to highlight it on the page, preview it before exporting
• Merged cells (colspan / rowspan) and multi-row headers handled correctly

★ FREE EXPORTS
• CSV for Excel — UTF-8 with BOM (accents never break), correct quoting of commas and line breaks, automatic ";" separator for European Excel
• Copy as Markdown — the perfect format to paste tables into ChatGPT, Claude, Gemini, Notion, Obsidian or GitHub
• Copy as TSV — paste straight into Google Sheets or Excel

★ TABLESNAP PRO (one-time payment, no subscription)
• Export many tables at once into one multi-sheet Excel (.xlsx) workbook
• Structured JSON export with typed numbers
• Advanced cleaning: remove empty rows, normalize spaces, strip currency symbols and units (€ 1.234,50 → 1234.50), keep or exclude rows with a regex filter
• Per-site presets: your settings are remembered for each website

★ PRIVATE BY DESIGN
Everything runs 100% inside your browser. TableSnap has no servers, no analytics and no tracking. It reads a page only when you click its icon (activeTab permission) and never asks to “read all your websites”.

Perfect for analysts, researchers, students, marketers, journalists and anyone who feeds data to AI assistants or spreadsheets.
```

### 🇮🇹 Italiano (it)

**Nome:** TableSnap — Estrattore di Tabelle Web per Excel / Markdown
**Riassunto:** Estrai tabelle e liste web in 1 clic: CSV per Excel, Markdown per ChatGPT e Claude, TSV. 100% locale e privato.

**Descrizione:**
```
TableSnap trasforma qualsiasi tabella di qualsiasi sito in dati puliti con un clic: niente copia-incolla disordinati, nessuna registrazione, nessun server.

★ COSA FA
• Rileva tutte le tabelle HTML, le griglie di dati e le liste strutturate della pagina
• Passa il mouse su un risultato per evidenziarlo nella pagina e guardane l'anteprima prima di esportare
• Gestisce correttamente celle unite (colspan / rowspan) e intestazioni su più righe

★ ESPORTAZIONI GRATUITE
• CSV per Excel: UTF-8 con BOM (accenti sempre corretti), virgolette e a capo gestiti, separatore ";" automatico per l'Excel italiano
• Copia in Markdown: il formato ideale per incollare tabelle in ChatGPT, Claude, Gemini, Notion, Obsidian o GitHub
• Copia in TSV: incolla direttamente in Fogli Google o Excel

★ TABLESNAP PRO (pagamento unico, nessun abbonamento)
• Esporta più tabelle insieme in un'unica cartella Excel (.xlsx) multi-foglio
• Esportazione JSON strutturata con numeri tipizzati
• Pulizia avanzata: rimuovi righe vuote, normalizza gli spazi, togli simboli di valuta e unità (€ 1.234,50 → 1234.50), mantieni o escludi righe con un filtro regex
• Preset per sito: le tue impostazioni vengono ricordate per ogni sito web

★ PRIVACY PER PROGETTO
Tutto avviene al 100% nel tuo browser. TableSnap non ha server, analytics né tracciamento. Legge una pagina solo quando clicchi la sua icona (permesso activeTab) e non chiede mai di “leggere tutti i tuoi siti web”.

Ideale per analisti, ricercatori, studenti, marketer, giornalisti e per chi lavora con fogli di calcolo e assistenti AI.
```

### 🇪🇸 Español (es)

**Nombre:** TableSnap — Extractor de Tablas Web a Excel / Markdown
**Resumen:** Extrae tablas y listas web en 1 clic: CSV para Excel, Markdown para ChatGPT y Claude, TSV. 100% local y privado.

**Descripción:**
```
TableSnap convierte cualquier tabla de cualquier web en datos limpios con un clic: sin copiar y pegar desordenado, sin registro y sin servidores.

★ QUÉ HACE
• Detecta todas las tablas HTML, cuadrículas de datos y listas estructuradas de la página
• Pasa el ratón sobre un resultado para resaltarlo en la página y ver una vista previa antes de exportar
• Gestiona correctamente celdas combinadas (colspan / rowspan) y encabezados de varias filas

★ EXPORTACIONES GRATUITAS
• CSV para Excel: UTF-8 con BOM (los acentos nunca se rompen), comas y saltos de línea bien entrecomillados, separador ";" automático para Excel en español
• Copiar como Markdown: el formato perfecto para pegar tablas en ChatGPT, Claude, Gemini, Notion, Obsidian o GitHub
• Copiar como TSV: pega directamente en Hojas de cálculo de Google o Excel

★ TABLESNAP PRO (pago único, sin suscripción)
• Exporta varias tablas a la vez en un único libro de Excel (.xlsx) con varias hojas
• Exportación JSON estructurada con números tipados
• Limpieza avanzada: elimina filas vacías, normaliza espacios, quita símbolos de moneda y unidades (€ 1.234,50 → 1234.50), conserva o excluye filas con un filtro regex
• Ajustes por sitio: tu configuración se recuerda para cada web

★ PRIVACIDAD POR DISEÑO
Todo funciona al 100% dentro de tu navegador. TableSnap no tiene servidores, analíticas ni rastreo. Solo lee una página cuando haces clic en su icono (permiso activeTab) y nunca pide “leer todos tus sitios web”.

Ideal para analistas, investigadores, estudiantes, marketers, periodistas y para quien trabaja con hojas de cálculo y asistentes de IA.
```

### 🇩🇪 Deutsch (de)

**Name:** TableSnap — Web-Tabellen-Extraktor für Excel / Markdown
**Kurzbeschreibung:** Web-Tabellen & Listen mit 1 Klick: CSV für Excel, Markdown für ChatGPT & Claude, TSV. 100 % lokal & privat.

**Beschreibung:**
```
TableSnap verwandelt jede Tabelle auf jeder Website mit einem Klick in saubere Daten – ohne Copy-Paste-Chaos, ohne Anmeldung, ohne Server.

★ FUNKTIONEN
• Erkennt alle HTML-Tabellen, Datenraster und strukturierten Listen der Seite
• Ergebnis mit der Maus überfahren, um es auf der Seite hervorzuheben; Vorschau vor dem Export
• Verbundene Zellen (colspan / rowspan) und mehrzeilige Kopfzeilen werden korrekt verarbeitet

★ KOSTENLOSE EXPORTE
• CSV für Excel: UTF-8 mit BOM (Umlaute bleiben korrekt), richtige Behandlung von Kommas und Zeilenumbrüchen, automatisches „;“-Trennzeichen für deutsches Excel
• Als Markdown kopieren: das ideale Format für Tabellen in ChatGPT, Claude, Gemini, Notion, Obsidian oder GitHub
• Als TSV kopieren: direkt in Google Tabellen oder Excel einfügen

★ TABLESNAP PRO (Einmalzahlung, kein Abo)
• Mehrere Tabellen auf einmal in eine Excel-Arbeitsmappe (.xlsx) mit mehreren Blättern exportieren
• Strukturierter JSON-Export mit echten Zahlenwerten
• Erweiterte Bereinigung: leere Zeilen entfernen, Leerzeichen normalisieren, Währungssymbole und Einheiten entfernen (€ 1.234,50 → 1234.50), Zeilen per Regex-Filter behalten oder ausschließen
• Presets pro Website: deine Einstellungen werden für jede Website gespeichert

★ DATENSCHUTZ AB WERK
Alles läuft zu 100 % in deinem Browser. TableSnap hat keine Server, keine Analytics und kein Tracking. Eine Seite wird nur gelesen, wenn du auf das Symbol klickst (activeTab-Berechtigung) – nie „alle Websites lesen“.

Ideal für Analysten, Forschende, Studierende, Marketer, Journalisten und alle, die mit Tabellenkalkulationen und KI-Assistenten arbeiten.
```

### 🇫🇷 Français (fr)

**Nom :** TableSnap — Extracteur de tableaux web vers Excel / Markdown
**Résumé :** Extrayez tableaux et listes web en 1 clic : CSV pour Excel, Markdown pour ChatGPT et Claude, TSV. 100 % local et privé.

**Description :**
```
TableSnap transforme n'importe quel tableau de n'importe quel site en données propres, en un clic : fini les copier-coller désordonnés, sans inscription et sans serveur.

★ CE QU'IL FAIT
• Détecte tous les tableaux HTML, grilles de données et listes structurées de la page
• Survolez un résultat pour le surligner sur la page et prévisualisez-le avant l'export
• Gère correctement les cellules fusionnées (colspan / rowspan) et les en-têtes sur plusieurs lignes

★ EXPORTS GRATUITS
• CSV pour Excel : UTF-8 avec BOM (les accents restent intacts), virgules et retours à la ligne correctement protégés, séparateur « ; » automatique pour l'Excel français
• Copier en Markdown : le format idéal pour coller des tableaux dans ChatGPT, Claude, Gemini, Notion, Obsidian ou GitHub
• Copier en TSV : collez directement dans Google Sheets ou Excel

★ TABLESNAP PRO (paiement unique, sans abonnement)
• Exportez plusieurs tableaux à la fois dans un seul classeur Excel (.xlsx) multi-feuilles
• Export JSON structuré avec des nombres typés
• Nettoyage avancé : supprimez les lignes vides, normalisez les espaces, retirez symboles monétaires et unités (€ 1.234,50 → 1234.50), gardez ou excluez des lignes avec un filtre regex
• Préréglages par site : vos réglages sont mémorisés pour chaque site

★ CONFIDENTIEL PAR CONCEPTION
Tout fonctionne à 100 % dans votre navigateur. TableSnap n'a ni serveur, ni statistiques, ni pistage. Il ne lit une page que lorsque vous cliquez sur son icône (autorisation activeTab) et ne demande jamais à « lire tous vos sites ».

Idéal pour les analystes, chercheurs, étudiants, marketeurs, journalistes et tous ceux qui travaillent avec des tableurs et des assistants IA.
```

### 🇵🇹 Português (pt)

**Nome:** TableSnap — Extrator de Tabelas Web para Excel / Markdown
**Resumo:** Extraia tabelas e listas da web em 1 clique: CSV para Excel, Markdown para ChatGPT e Claude, TSV. 100% local e privado.

**Descrição:**
```
O TableSnap transforma qualquer tabela de qualquer site em dados limpos com um clique: sem copiar e colar bagunçado, sem cadastro e sem servidores.

★ O QUE ELE FAZ
• Detecta todas as tabelas HTML, grades de dados e listas estruturadas da página
• Passe o mouse sobre um resultado para destacá-lo na página e veja a pré-visualização antes de exportar
• Trata corretamente células mescladas (colspan / rowspan) e cabeçalhos com várias linhas

★ EXPORTAÇÕES GRATUITAS
• CSV para Excel: UTF-8 com BOM (acentos sempre corretos), vírgulas e quebras de linha bem tratadas, separador ";" automático para o Excel em português
• Copiar como Markdown: o formato perfeito para colar tabelas no ChatGPT, Claude, Gemini, Notion, Obsidian ou GitHub
• Copiar como TSV: cole direto no Planilhas Google ou no Excel

★ TABLESNAP PRO (pagamento único, sem assinatura)
• Exporte várias tabelas de uma vez para uma única pasta de trabalho Excel (.xlsx) com várias abas
• Exportação JSON estruturada com números tipados
• Limpeza avançada: remova linhas vazias, normalize espaços, retire símbolos de moeda e unidades (R$ 1.234,50 → 1234.50), mantenha ou exclua linhas com um filtro regex
• Predefinições por site: suas configurações são lembradas para cada site

★ PRIVACIDADE POR PADRÃO
Tudo funciona 100% dentro do seu navegador. O TableSnap não tem servidores, análises nem rastreamento. Ele só lê uma página quando você clica no ícone (permissão activeTab) e nunca pede para “ler todos os seus sites”.

Ideal para analistas, pesquisadores, estudantes, profissionais de marketing, jornalistas e quem trabalha com planilhas e assistentes de IA.
```

---

## 10. Microsoft Edge Add-ons — 🔐 APPROVAZIONE (account Partner Center, termini, pubblicazione)

1. Registrati gratuitamente su https://partner.microsoft.com/dashboard/microsoftedge (account sviluppatore Edge).
2. **Create new extension** → carica lo **stesso** `dist/tablesnap-store-ready.zip`.
3. **Availability**: Public, tutti i mercati.
4. **Properties**: categoria *Productivity*, URL privacy policy, sito web; incolla le giustificazioni della sezione 8 dove richiesto.
5. **Store listings**: aggiungi le 6 lingue con le descrizioni della sezione 9; logo 300×300 `store_assets/edge_logo_300x300.png`, screenshot 1280×800 da `store_assets/`, small promo tile 440×280.
6. Invia: la revisione Edge di solito richiede fino a 7 giorni lavorativi.

---

## 11. Dopo la prima pubblicazione

1. Copia gli ID degli store negli URL di `src/config.js` (`STORE_REVIEW_URL`, `EDGE_REVIEW_URL`) e nei pulsanti di `docs/index.html`.
2. Incrementa `version` in `src/manifest.json` (es. `1.0.1`).
3. `python scripts/build.py --strict` → carica il nuovo zip in entrambi gli store (🔐 APPROVAZIONE: pubblicazione).
4. Lancia a mano il workflow “Weekly monitor” per verificare il report Telegram, poi fai un acquisto in test mode per verificare la notifica istantanea del worker.

## 12. Riepilogo approvazioni richieste

| Azione | Perché serve la tua approvazione |
|---|---|
| Account LemonSqueezy, Cloudflare, Chrome Developer, Edge Partner Center | creazione account e accettazione termini a tuo nome |
| Quota Chrome Web Store (5 USD) | spesa |
| `git push` su GitHub + attivazione GitHub Pages | pubblicazione online |
| Invio agli store | pubblicazione |
| Prezzo, politica rimborsi, dati titolare nella privacy, scelte fiscali (DAC7, partita IVA) | implicazioni legali/fiscali |
