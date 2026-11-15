#!/usr/bin/env python3
"""Generate src/_locales/<lang>/messages.json from a single translation table.

Edit the MESSAGES table below, then run:  python scripts/generate_locales.py
Store limits enforced by tests: extName <= 75 chars, extShortName <= 12, extDescription <= 132.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCALES_DIR = ROOT / "src" / "_locales"
LANGS = ("en", "it", "es", "de", "fr", "pt")

# placeholder name -> substitution index, per key
PLACEHOLDERS = {
    "tablesFound": {"count": "$1"},
    "previewMore": {"count": "$1"},
    "selectedCount": {"count": "$1"},
    "presetNote": {"domain": "$1"},
}

# key: (description, {lang: text})
MESSAGES: dict[str, tuple[str, dict[str, str]]] = {
    "extName": ("Store/extension name (<=75 chars)", {
        "en": "TableSnap — Web Table & Data Extractor to Excel / Markdown",
        "it": "TableSnap — Estrattore di Tabelle Web per Excel / Markdown",
        "es": "TableSnap — Extractor de Tablas Web a Excel / Markdown",
        "de": "TableSnap — Web-Tabellen-Extraktor für Excel / Markdown",
        "fr": "TableSnap — Extracteur de tableaux web vers Excel / Markdown",
        "pt": "TableSnap — Extrator de Tabelas Web para Excel / Markdown",
    }),
    "extShortName": ("Short name (<=12 chars)", {lang: "TableSnap" for lang in LANGS}),
    "extDescription": ("Store summary (<=132 chars)", {
        "en": "Extract any web table or list in 1 click: CSV for Excel, Markdown for ChatGPT & Claude, TSV. 100% local & private.",
        "it": "Estrai tabelle e liste web in 1 clic: CSV per Excel, Markdown per ChatGPT e Claude, TSV. 100% locale e privato.",
        "es": "Extrae tablas y listas web en 1 clic: CSV para Excel, Markdown para ChatGPT y Claude, TSV. 100% local y privado.",
        "de": "Web-Tabellen & Listen mit 1 Klick: CSV für Excel, Markdown für ChatGPT & Claude, TSV. 100 % lokal & privat.",
        "fr": "Extrayez tableaux et listes web en 1 clic : CSV pour Excel, Markdown pour ChatGPT et Claude, TSV. 100 % local et privé.",
        "pt": "Extraia tabelas e listas da web em 1 clique: CSV para Excel, Markdown para ChatGPT e Claude, TSV. 100% local e privado.",
    }),
    "actionTitle": ("Toolbar button tooltip", {
        "en": "TableSnap: extract tables from this page",
        "it": "TableSnap: estrai le tabelle da questa pagina",
        "es": "TableSnap: extrae las tablas de esta página",
        "de": "TableSnap: Tabellen dieser Seite extrahieren",
        "fr": "TableSnap : extraire les tableaux de cette page",
        "pt": "TableSnap: extrair as tabelas desta página",
    }),
    "rescan": ("Rescan button", {
        "en": "Rescan page", "it": "Analizza di nuovo", "es": "Volver a analizar",
        "de": "Seite neu scannen", "fr": "Réanalyser la page", "pt": "Analisar novamente",
    }),
    "scanning": ("Status while scanning", {
        "en": "Scanning page…", "it": "Analisi della pagina…", "es": "Analizando la página…",
        "de": "Seite wird gescannt…", "fr": "Analyse de la page…", "pt": "Analisando a página…",
    }),
    "noTables": ("No results", {
        "en": "No tables or lists found on this page.",
        "it": "Nessuna tabella o lista trovata in questa pagina.",
        "es": "No se encontraron tablas ni listas en esta página.",
        "de": "Keine Tabellen oder Listen auf dieser Seite gefunden.",
        "fr": "Aucun tableau ni liste trouvé sur cette page.",
        "pt": "Nenhuma tabela ou lista encontrada nesta página.",
    }),
    "restrictedPage": ("Protected page", {
        "en": "TableSnap can't read this page (browser and store pages are protected).",
        "it": "TableSnap non può leggere questa pagina (le pagine del browser e degli store sono protette).",
        "es": "TableSnap no puede leer esta página (las páginas del navegador y de las tiendas están protegidas).",
        "de": "TableSnap kann diese Seite nicht lesen (Browser- und Store-Seiten sind geschützt).",
        "fr": "TableSnap ne peut pas lire cette page (les pages du navigateur et des stores sont protégées).",
        "pt": "O TableSnap não pode ler esta página (páginas do navegador e das lojas são protegidas).",
    }),
    "tablesFound": ("Detected count", {
        "en": "$COUNT$ found", "it": "$COUNT$ trovate", "es": "$COUNT$ encontradas",
        "de": "$COUNT$ gefunden", "fr": "$COUNT$ trouvés", "pt": "$COUNT$ encontradas",
    }),
    "hoverHint": ("Hint", {
        "en": "Hover to highlight on page", "it": "Passa il mouse per evidenziare",
        "es": "Pasa el ratón para resaltar", "de": "Zum Hervorheben überfahren",
        "fr": "Survolez pour surligner", "pt": "Passe o mouse para destacar",
    }),
    "kindTable": ("Item kind", {"en": "Table", "it": "Tabella", "es": "Tabla", "de": "Tabelle", "fr": "Tableau", "pt": "Tabela"}),
    "kindList": ("Item kind", {"en": "List", "it": "Lista", "es": "Lista", "de": "Liste", "fr": "Liste", "pt": "Lista"}),
    "kindGrid": ("Item kind (ARIA grid)", {"en": "Grid", "it": "Griglia", "es": "Cuadrícula", "de": "Raster", "fr": "Grille", "pt": "Grade"}),
    "rows": ("Unit", {"en": "rows", "it": "righe", "es": "filas", "de": "Zeilen", "fr": "lignes", "pt": "linhas"}),
    "cols": ("Unit", {"en": "cols", "it": "col.", "es": "col.", "de": "Sp.", "fr": "col.", "pt": "col."}),
    "columnLabel": ("Generic Markdown header", {"en": "Column", "it": "Colonna", "es": "Columna", "de": "Spalte", "fr": "Colonne", "pt": "Coluna"}),
    "titleCsv": ("Button tooltip", {
        "en": "Download CSV (Excel-ready, UTF-8)", "it": "Scarica CSV (pronto per Excel, UTF-8)",
        "es": "Descargar CSV (listo para Excel, UTF-8)", "de": "CSV herunterladen (Excel-fertig, UTF-8)",
        "fr": "Télécharger le CSV (prêt pour Excel, UTF-8)", "pt": "Baixar CSV (pronto para Excel, UTF-8)",
    }),
    "titleMarkdown": ("Button tooltip", {
        "en": "Copy as Markdown (paste into ChatGPT, Claude, Notion…)",
        "it": "Copia in Markdown (da incollare in ChatGPT, Claude, Notion…)",
        "es": "Copiar como Markdown (para ChatGPT, Claude, Notion…)",
        "de": "Als Markdown kopieren (für ChatGPT, Claude, Notion…)",
        "fr": "Copier en Markdown (pour ChatGPT, Claude, Notion…)",
        "pt": "Copiar como Markdown (para ChatGPT, Claude, Notion…)",
    }),
    "titleTsv": ("Button tooltip", {
        "en": "Copy as TSV (paste into Excel / Google Sheets)",
        "it": "Copia come TSV (da incollare in Excel / Fogli Google)",
        "es": "Copiar como TSV (para Excel / Hojas de cálculo de Google)",
        "de": "Als TSV kopieren (für Excel / Google Tabellen)",
        "fr": "Copier en TSV (pour Excel / Google Sheets)",
        "pt": "Copiar como TSV (para Excel / Planilhas Google)",
    }),
    "titlePreview": ("Button tooltip", {
        "en": "Show preview", "it": "Mostra anteprima", "es": "Mostrar vista previa",
        "de": "Vorschau anzeigen", "fr": "Afficher l'aperçu", "pt": "Mostrar pré-visualização",
    }),
    "previewMore": ("Preview footer", {
        "en": "… and $COUNT$ more rows", "it": "… e altre $COUNT$ righe", "es": "… y $COUNT$ filas más",
        "de": "… und $COUNT$ weitere Zeilen", "fr": "… et $COUNT$ lignes de plus", "pt": "… e mais $COUNT$ linhas",
    }),
    "optFirstRowHeader": ("Option", {
        "en": "First row is header", "it": "Prima riga = intestazione", "es": "Primera fila = encabezado",
        "de": "Erste Zeile = Kopfzeile", "fr": "1re ligne = en-tête", "pt": "1ª linha = cabeçalho",
    }),
    "csvSeparator": ("Option label", {
        "en": "CSV separator", "it": "Separatore CSV", "es": "Separador CSV",
        "de": "CSV-Trennzeichen", "fr": "Séparateur CSV", "pt": "Separador CSV",
    }),
    "sepAuto": ("Separator option", {
        "en": "Auto (Excel)", "it": "Auto (Excel)", "es": "Auto (Excel)", "de": "Auto (Excel)", "fr": "Auto (Excel)", "pt": "Auto (Excel)",
    }),
    "sepComma": ("Separator option", {"en": "Comma ,", "it": "Virgola ,", "es": "Coma ,", "de": "Komma ,", "fr": "Virgule ,", "pt": "Vírgula ,"}),
    "sepSemicolon": ("Separator option", {
        "en": "Semicolon ;", "it": "Punto e virgola ;", "es": "Punto y coma ;", "de": "Semikolon ;", "fr": "Point-virgule ;", "pt": "Ponto e vírgula ;",
    }),
    "sepTab": ("Separator option", {"en": "Tab", "it": "Tab", "es": "Tab", "de": "Tab", "fr": "Tab", "pt": "Tab"}),
    "downloadedCsv": ("Toast", {
        "en": "CSV downloaded!", "it": "CSV scaricato!", "es": "¡CSV descargado!",
        "de": "CSV heruntergeladen!", "fr": "CSV téléchargé !", "pt": "CSV baixado!",
    }),
    "downloadedFile": ("Toast", {
        "en": "File downloaded!", "it": "File scaricato!", "es": "¡Archivo descargado!",
        "de": "Datei heruntergeladen!", "fr": "Fichier téléchargé !", "pt": "Arquivo baixado!",
    }),
    "copiedMarkdown": ("Toast", {
        "en": "Markdown copied — paste it into your AI chat!", "it": "Markdown copiato: incollalo nella tua chat AI!",
        "es": "Markdown copiado: ¡pégalo en tu chat de IA!", "de": "Markdown kopiert – in deinen KI-Chat einfügen!",
        "fr": "Markdown copié : collez-le dans votre chat IA !", "pt": "Markdown copiado: cole no seu chat de IA!",
    }),
    "copiedTsv": ("Toast", {
        "en": "TSV copied — paste it into your spreadsheet!", "it": "TSV copiato: incollalo nel tuo foglio di calcolo!",
        "es": "TSV copiado: ¡pégalo en tu hoja de cálculo!", "de": "TSV kopiert – in deine Tabelle einfügen!",
        "fr": "TSV copié : collez-le dans votre tableur !", "pt": "TSV copiado: cole na sua planilha!",
    }),
    "exportFailed": ("Toast prefix", {
        "en": "Export failed:", "it": "Esportazione non riuscita:", "es": "Error al exportar:",
        "de": "Export fehlgeschlagen:", "fr": "Échec de l'export :", "pt": "Falha na exportação:",
    }),
    "clipboardFailed": ("Toast", {
        "en": "Couldn't access the clipboard.", "it": "Impossibile accedere agli appunti.", "es": "No se pudo acceder al portapapeles.",
        "de": "Kein Zugriff auf die Zwischenablage.", "fr": "Impossible d'accéder au presse-papiers.", "pt": "Não foi possível acessar a área de transferência.",
    }),
    "emptyAfterCleaning": ("Toast", {
        "en": "Nothing left to export after cleaning/filtering.", "it": "Nessun dato da esportare dopo pulizia/filtro.",
        "es": "No queda nada que exportar tras la limpieza/filtro.", "de": "Nach Bereinigung/Filter bleibt nichts zum Exportieren.",
        "fr": "Plus rien à exporter après nettoyage/filtre.", "pt": "Nada para exportar após limpeza/filtro.",
    }),
    "proTitle": ("Section title", {
        "en": "Pro tools", "it": "Strumenti Pro", "es": "Herramientas Pro", "de": "Pro-Werkzeuge", "fr": "Outils Pro", "pt": "Ferramentas Pro",
    }),
    "selectAll": ("Checkbox", {"en": "Select all", "it": "Seleziona tutto", "es": "Seleccionar todo", "de": "Alle auswählen", "fr": "Tout sélectionner", "pt": "Selecionar tudo"}),
    "selectedCount": ("Counter", {
        "en": "$COUNT$ selected", "it": "$COUNT$ selezionate", "es": "$COUNT$ seleccionadas",
        "de": "$COUNT$ ausgewählt", "fr": "$COUNT$ sélectionnés", "pt": "$COUNT$ selecionadas",
    }),
    "selectAtLeastOne": ("Toast", {
        "en": "Select at least one table first.", "it": "Seleziona prima almeno una tabella.", "es": "Selecciona al menos una tabla.",
        "de": "Wähle zuerst mindestens eine Tabelle aus.", "fr": "Sélectionnez d'abord au moins un tableau.", "pt": "Selecione pelo menos uma tabela.",
    }),
    "proLockedText": ("Upsell", {
        "en": "Unlock Pro: multi-table XLSX & JSON export, advanced cleaning, regex filters and per-site presets. One-time payment, no subscription.",
        "it": "Sblocca Pro: export multi-tabella in XLSX e JSON, pulizia avanzata, filtri regex e preset per sito. Pagamento unico, nessun abbonamento.",
        "es": "Desbloquea Pro: exportación multitabla a XLSX y JSON, limpieza avanzada, filtros regex y ajustes por sitio. Pago único, sin suscripción.",
        "de": "Pro freischalten: Multi-Tabellen-Export als XLSX & JSON, Bereinigung, Regex-Filter und Presets pro Website. Einmalzahlung, kein Abo.",
        "fr": "Débloquez Pro : export multi-tableaux XLSX et JSON, nettoyage avancé, filtres regex et préréglages par site. Paiement unique, sans abonnement.",
        "pt": "Desbloqueie o Pro: exportação multitabela em XLSX e JSON, limpeza avançada, filtros regex e predefinições por site. Pagamento único, sem assinatura.",
    }),
    "buyPro": ("Button", {
        "en": "Get Pro — one-time", "it": "Passa a Pro — una tantum", "es": "Obtener Pro — pago único",
        "de": "Pro holen — einmalig", "fr": "Passer à Pro — paiement unique", "pt": "Obter Pro — pagamento único",
    }),
    "haveKey": ("Button", {
        "en": "I have a license key", "it": "Ho una chiave di licenza", "es": "Tengo una clave de licencia",
        "de": "Ich habe einen Lizenzschlüssel", "fr": "J'ai une clé de licence", "pt": "Tenho uma chave de licença",
    }),
    "licenseKeyPlaceholder": ("Input placeholder", {
        "en": "Paste your license key", "it": "Incolla la tua chiave di licenza", "es": "Pega tu clave de licencia",
        "de": "Lizenzschlüssel einfügen", "fr": "Collez votre clé de licence", "pt": "Cole sua chave de licença",
    }),
    "activate": ("Button", {"en": "Activate", "it": "Attiva", "es": "Activar", "de": "Aktivieren", "fr": "Activer", "pt": "Ativar"}),
    "activating": ("Button busy", {"en": "Activating…", "it": "Attivazione…", "es": "Activando…", "de": "Aktiviere…", "fr": "Activation…", "pt": "Ativando…"}),
    "licenseActivated": ("Toast", {
        "en": "Pro unlocked — thank you!", "it": "Pro sbloccato — grazie!", "es": "¡Pro desbloqueado, gracias!",
        "de": "Pro freigeschaltet – danke!", "fr": "Pro débloqué — merci !", "pt": "Pro desbloqueado — obrigado!",
    }),
    "licenseActive": ("Status", {"en": "Pro active", "it": "Pro attivo", "es": "Pro activo", "de": "Pro aktiv", "fr": "Pro actif", "pt": "Pro ativo"}),
    "licenseInvalid": ("Error", {
        "en": "This license key is not valid (or has been disabled/refunded).",
        "it": "Questa chiave di licenza non è valida (o è stata disattivata/rimborsata).",
        "es": "Esta clave de licencia no es válida (o fue desactivada/reembolsada).",
        "de": "Dieser Lizenzschlüssel ist ungültig (oder wurde deaktiviert/erstattet).",
        "fr": "Cette clé de licence n'est pas valide (ou a été désactivée/remboursée).",
        "pt": "Esta chave de licença não é válida (ou foi desativada/reembolsada).",
    }),
    "licenseFormat": ("Error", {
        "en": "That doesn't look like a license key.", "it": "Questa non sembra una chiave di licenza.",
        "es": "Eso no parece una clave de licencia.", "de": "Das sieht nicht wie ein Lizenzschlüssel aus.",
        "fr": "Cela ne ressemble pas à une clé de licence.", "pt": "Isso não parece uma chave de licença.",
    }),
    "licenseNetwork": ("Error", {
        "en": "Couldn't reach the license server. Check your connection and retry.",
        "it": "Server licenze non raggiungibile. Controlla la connessione e riprova.",
        "es": "No se pudo contactar con el servidor de licencias. Revisa tu conexión.",
        "de": "Lizenzserver nicht erreichbar. Verbindung prüfen und erneut versuchen.",
        "fr": "Serveur de licences injoignable. Vérifiez votre connexion et réessayez.",
        "pt": "Não foi possível contatar o servidor de licenças. Verifique a conexão.",
    }),
    "licenseLimit": ("Error", {
        "en": "Activation limit reached. Remove the license from another browser first.",
        "it": "Limite di attivazioni raggiunto. Rimuovi prima la licenza da un altro browser.",
        "es": "Límite de activaciones alcanzado. Quita la licencia de otro navegador primero.",
        "de": "Aktivierungslimit erreicht. Entferne die Lizenz zuerst aus einem anderen Browser.",
        "fr": "Limite d'activations atteinte. Retirez d'abord la licence d'un autre navigateur.",
        "pt": "Limite de ativações atingido. Remova a licença de outro navegador primeiro.",
    }),
    "licenseWrongProduct": ("Error", {
        "en": "This key belongs to a different product.", "it": "Questa chiave appartiene a un altro prodotto.",
        "es": "Esta clave pertenece a otro producto.", "de": "Dieser Schlüssel gehört zu einem anderen Produkt.",
        "fr": "Cette clé appartient à un autre produit.", "pt": "Esta chave pertence a outro produto.",
    }),
    "licenseExpiredOffline": ("Error", {
        "en": "Pro paused: the license couldn't be verified for 30 days. Go online and reopen TableSnap.",
        "it": "Pro in pausa: licenza non verificata da 30 giorni. Connettiti e riapri TableSnap.",
        "es": "Pro en pausa: la licencia no se verifica desde hace 30 días. Conéctate y vuelve a abrir TableSnap.",
        "de": "Pro pausiert: Lizenz seit 30 Tagen nicht geprüft. Geh online und öffne TableSnap erneut.",
        "fr": "Pro en pause : licence non vérifiée depuis 30 jours. Connectez-vous et rouvrez TableSnap.",
        "pt": "Pro pausado: licença não verificada há 30 dias. Conecte-se e reabra o TableSnap.",
    }),
    "removeLicense": ("Link", {
        "en": "Remove license", "it": "Rimuovi licenza", "es": "Quitar licencia", "de": "Lizenz entfernen", "fr": "Retirer la licence", "pt": "Remover licença",
    }),
    "licenseRemoved": ("Toast", {
        "en": "License removed from this browser.", "it": "Licenza rimossa da questo browser.", "es": "Licencia eliminada de este navegador.",
        "de": "Lizenz aus diesem Browser entfernt.", "fr": "Licence retirée de ce navigateur.", "pt": "Licença removida deste navegador.",
    }),
    "cleaningTitle": ("Fieldset legend", {
        "en": "Advanced cleaning (applies to every export)", "it": "Pulizia avanzata (vale per ogni export)",
        "es": "Limpieza avanzada (se aplica a cada exportación)", "de": "Erweiterte Bereinigung (für jeden Export)",
        "fr": "Nettoyage avancé (appliqué à chaque export)", "pt": "Limpeza avançada (aplica-se a cada exportação)",
    }),
    "optRemoveEmpty": ("Option", {
        "en": "Remove empty rows", "it": "Rimuovi righe vuote", "es": "Eliminar filas vacías",
        "de": "Leere Zeilen entfernen", "fr": "Supprimer les lignes vides", "pt": "Remover linhas vazias",
    }),
    "optNormalizeSpaces": ("Option", {
        "en": "Normalize spaces & line breaks", "it": "Normalizza spazi e a capo", "es": "Normalizar espacios y saltos de línea",
        "de": "Leerzeichen & Umbrüche normalisieren", "fr": "Normaliser espaces et retours à la ligne", "pt": "Normalizar espaços e quebras de linha",
    }),
    "optStripNumeric": ("Option", {
        "en": "Clean numeric columns (strip €, $, %, units)", "it": "Pulisci colonne numeriche (togli €, $, %, unità)",
        "es": "Limpiar columnas numéricas (quitar €, $, %, unidades)", "de": "Zahlenspalten bereinigen (€, $, %, Einheiten entfernen)",
        "fr": "Nettoyer les colonnes numériques (retirer €, $, %, unités)", "pt": "Limpar colunas numéricas (remover €, $, %, unidades)",
    }),
    "optRegex": ("Aria label", {
        "en": "Regex row filter", "it": "Filtro righe regex", "es": "Filtro de filas regex",
        "de": "Regex-Zeilenfilter", "fr": "Filtre de lignes regex", "pt": "Filtro de linhas regex",
    }),
    "regexPlaceholder": ("Input placeholder", {
        "en": "Regex row filter, e.g. ^Italy|2025", "it": "Filtro regex, es. ^Italia|2025", "es": "Filtro regex, p. ej. ^España|2025",
        "de": "Regex-Filter, z. B. ^Deutschland|2025", "fr": "Filtre regex, ex. ^France|2025", "pt": "Filtro regex, ex. ^Brasil|2025",
    }),
    "regexKeep": ("Select option", {"en": "Keep matches", "it": "Mantieni", "es": "Mantener", "de": "Behalten", "fr": "Garder", "pt": "Manter"}),
    "regexExclude": ("Select option", {"en": "Exclude matches", "it": "Escludi", "es": "Excluir", "de": "Ausschließen", "fr": "Exclure", "pt": "Excluir"}),
    "invalidRegex": ("Error", {
        "en": "Invalid regular expression.", "it": "Espressione regolare non valida.", "es": "Expresión regular no válida.",
        "de": "Ungültiger regulärer Ausdruck.", "fr": "Expression régulière invalide.", "pt": "Expressão regular inválida.",
    }),
    "exportXlsx": ("Button", {
        "en": "Selected → Excel (.xlsx)", "it": "Selezionate → Excel (.xlsx)", "es": "Seleccionadas → Excel (.xlsx)",
        "de": "Auswahl → Excel (.xlsx)", "fr": "Sélection → Excel (.xlsx)", "pt": "Selecionadas → Excel (.xlsx)",
    }),
    "exportJson": ("Button", {
        "en": "Selected → JSON", "it": "Selezionate → JSON", "es": "Seleccionadas → JSON",
        "de": "Auswahl → JSON", "fr": "Sélection → JSON", "pt": "Selecionadas → JSON",
    }),
    "presetNote": ("Preset status", {
        "en": "Settings auto-saved for $DOMAIN$", "it": "Impostazioni salvate per $DOMAIN$", "es": "Ajustes guardados para $DOMAIN$",
        "de": "Einstellungen gespeichert für $DOMAIN$", "fr": "Réglages enregistrés pour $DOMAIN$", "pt": "Configurações salvas para $DOMAIN$",
    }),
    "presetReset": ("Link", {
        "en": "Reset site preset", "it": "Ripristina preset sito", "es": "Restablecer ajustes del sitio",
        "de": "Website-Preset zurücksetzen", "fr": "Réinitialiser le préréglage", "pt": "Redefinir predefinição do site",
    }),
    "presetCleared": ("Toast", {
        "en": "Site preset removed.", "it": "Preset del sito rimosso.", "es": "Ajustes del sitio eliminados.",
        "de": "Website-Preset entfernt.", "fr": "Préréglage du site supprimé.", "pt": "Predefinição do site removida.",
    }),
    "reviewPrompt": ("Review banner", {
        "en": "5 tables snapped! If TableSnap saved you time, a quick review helps a lot ⭐",
        "it": "5 tabelle estratte! Se TableSnap ti fa risparmiare tempo, una recensione aiuta molto ⭐",
        "es": "¡5 tablas extraídas! Si TableSnap te ahorra tiempo, una reseña ayuda mucho ⭐",
        "de": "5 Tabellen extrahiert! Wenn TableSnap dir Zeit spart, hilft eine kurze Bewertung sehr ⭐",
        "fr": "5 tableaux extraits ! Si TableSnap vous fait gagner du temps, un avis aide beaucoup ⭐",
        "pt": "5 tabelas extraídas! Se o TableSnap economiza seu tempo, uma avaliação ajuda muito ⭐",
    }),
    "reviewCta": ("Button", {
        "en": "Leave a review", "it": "Lascia una recensione", "es": "Dejar una reseña",
        "de": "Bewertung schreiben", "fr": "Laisser un avis", "pt": "Deixar uma avaliação",
    }),
    "reviewDismiss": ("Button", {"en": "Not now", "it": "Non ora", "es": "Ahora no", "de": "Nicht jetzt", "fr": "Plus tard", "pt": "Agora não"}),
    "privacyNote": ("Footer", {
        "en": "100% local — your data never leaves the browser.", "it": "100% locale: i tuoi dati non lasciano il browser.",
        "es": "100% local: tus datos nunca salen del navegador.", "de": "100 % lokal – deine Daten verlassen nie den Browser.",
        "fr": "100 % local : vos données ne quittent jamais le navigateur.", "pt": "100% local: seus dados nunca saem do navegador.",
    }),
    "linkWebsite": ("Footer link", {"en": "Website", "it": "Sito", "es": "Web", "de": "Website", "fr": "Site", "pt": "Site"}),
    "linkPrivacy": ("Footer link", {"en": "Privacy", "it": "Privacy", "es": "Privacidad", "de": "Datenschutz", "fr": "Confidentialité", "pt": "Privacidade"}),
}


def build_locale(lang: str) -> dict:
    out: dict[str, dict] = {}
    for key, (description, texts) in MESSAGES.items():
        if lang not in texts:
            raise KeyError(f"Missing '{lang}' translation for '{key}'")
        entry: dict = {"message": texts[lang], "description": description}
        if key in PLACEHOLDERS:
            entry["placeholders"] = {name: {"content": idx} for name, idx in PLACEHOLDERS[key].items()}
        out[key] = entry
    return out


def main() -> None:
    for lang in LANGS:
        target = LOCALES_DIR / lang / "messages.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(build_locale(lang), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[locales] wrote {target.relative_to(ROOT)} ({len(MESSAGES)} messages)")


if __name__ == "__main__":
    main()
