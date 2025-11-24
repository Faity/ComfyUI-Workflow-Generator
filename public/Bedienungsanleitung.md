# Bedienungsanleitung: AI ComfyUI Workflow Suite

Herzlich willkommen zur AI ComfyUI Workflow Suite! Dieses Tool ist Ihr intelligenter Assistent für die Erstellung, Validierung und Optimierung von ComfyUI-Workflows.

Diese Dokumentation führt Sie durch die Funktionen der Anwendung, vom ersten Prompt bis zum automatisierten Lernen aus Erfolgen.

## Inhaltsverzeichnis

1.  [Schritt 1: Workflows Generieren](#schritt-1-workflows-generieren)
    *   [Prompting & Assistenten](#prompting--assistenten)
    *   [Format-Wahl: Graph vs. API](#format-wahl-graph-vs-api)
    *   [Bilder hochladen](#bilder-hochladen)
2.  [Schritt 2: Ergebnisse & Ausführung](#schritt-2-ergebnisse--ausführung)
    *   [Das neue Output-Panel](#das-neue-output-panel)
    *   [Workflow ausführen (Run)](#workflow-ausführen-run)
3.  [Schritt 3: Der Feedback-Loop (Lernen)](#schritt-3-der-feedback-loop-lernen)
4.  [Der "Tester"-Tab: Reparatur & Validierung](#der-tester-tab-reparatur--validierung)
5.  [Fortgeschrittene Funktionen](#fortgeschrittene-funktionen)
    *   [Lokales LLM (RAG & Fine-Tuning)](#lokales-llm-rag--fine-tuning)
    *   [Verlauf](#verlauf)
6.  [Einstellungen & Installation](#einstellungen--installation)
7.  [Fehlerbehebung](#fehlerbehebung)

---

## Schritt 1: Workflows Generieren

Der **Generator-Tab** ist Ihr Startpunkt. Hier übersetzen Sie Ihre Ideen in technische ComfyUI-Strukturen.

### Prompting & Assistenten
Geben Sie Ihre Idee in das Textfeld ein. Je präziser, desto besser.
*   **Prompt-Assistent (`✨`):** Startet einen Chat, um Ihre künstlerische Vision zu verfeinern (Stil, Beleuchtung, Komposition).
*   **Workflow-Assistent (`🧠`):** Startet einen technischen Dialog, um spezifische Parameter (Modell, Sampler, Scheduler) abzufragen.

### Format-Wahl: Graph vs. API
Sie können nun wählen, in welchem Format der Workflow erstellt werden soll:

1.  **Graph (Visuell):** Das Standardformat für die ComfyUI-Benutzeroberfläche (`.json`). Enthält Positionsdaten für Nodes und Links. Wählen Sie dies, wenn Sie den Workflow manuell in ComfyUI laden und bearbeiten möchten.
2.  **API (JSON):** Ein reines Datenformat, das Entwickler oft nutzen. Es enthält keine visuellen Informationen (Positionen), sondern nur die Logik. Es ist oft robuster und weniger fehleranfällig bei der Generierung komplexer Strukturen.

### Bilder hochladen
Für Workflows wie **Img2Img**, **Inpainting** oder **ControlNet**:
*   Ziehen Sie ein Bild in den Upload-Bereich.
*   Die KI erkennt das Bild automatisch und baut einen `LoadImage`-Node in den Workflow ein, der genau dieses Bild referenziert.

---

## Schritt 2: Ergebnisse & Ausführung

Nach der Generierung erscheint das Ergebnis im rechten **Output-Panel**. Dieses wurde für bessere Übersichtlichkeit optimiert.

### Das neue Output-Panel
Anstatt einer oft fehlerhaften visuellen Vorschau konzentrieren wir uns auf Code und Anleitung:

*   **Tab "JSON Code":** Zeigt den generierten Raw-Code. Hier können Sie den Code kopieren (`📋`) oder herunterladen (`📥`).
*   **Tab "Guide & Setup":** Eine schön formatierte Ansicht der Anforderungen.
    *   **Custom Nodes:** Listet fehlende Erweiterungen auf, inklusive Installationsbefehl.
    *   **Modelle:** Listet benötigte Checkpoints/LoRAs auf, inklusive Download-Link und Zielordner.
*   **Tab "Protokolle":** Erscheint nur, wenn die KI während der Validierung Fehler gefunden und automatisch korrigiert hat.

### Workflow ausführen (Run)
Mit dem **Play-Button (`▶️`)** senden Sie den Workflow direkt an Ihre laufende ComfyUI-Instanz.
*   **Voraussetzung:** Die ComfyUI-URL muss in den Einstellungen hinterlegt sein.
*   **Live-Status:** Sie sehen einen Fortschrittsbalken, der in Echtzeit anzeigt, welcher Node gerade in ComfyUI bearbeitet wird.

---

## Schritt 3: Der Feedback-Loop (Lernen)

Dies ist eine der mächtigsten Funktionen der Suite.

**Wann erscheint er?**
Sobald ein Workflow erfolgreich durchgelaufen ist (Status 200 vom Server), erscheint eine grüne **Feedback-Leiste** im Output-Panel.

**Was kann ich tun?**
*   **Auto-Save (Kurzzeit):** Speichert den Workflow und den Prompt in das Kurzzeitgedächtnis des lokalen LLMs. Hilft bei ähnlichen Anfragen in der aktuellen Sitzung.
*   **Gold-Standard (Langzeit):** Markiert diesen Workflow als "perfektes Beispiel". Er wird in die permanente Wissensdatenbank (RAG) aufgenommen und dient als Vorlage für zukünftige Generierungen.

*Hinweis: Diese Funktion benötigt ein konfiguriertes Lokales LLM mit RAG-Server.*

---

## Der "Tester"-Tab: Reparatur & Validierung

Haben Sie einen Workflow (egal ob Graph- oder API-Format), der nicht funktioniert?

1.  **Import:** Fügen Sie das JSON ein oder laden Sie die Datei hoch.
2.  **Fehlerbeschreibung (Optional):** Fügen Sie die Fehlermeldung aus der ComfyUI-Konsole ein.
3.  **Debuggen:** Klicken Sie auf den Button. Die KI analysiert die Struktur und versucht, den Fehler basierend auf ihrem Wissen über Nodes und Verbindungen zu beheben.

---

## Fortgeschrittene Funktionen

### Lokales LLM (RAG & Fine-Tuning)
Verwalten Sie Ihr eigenes KI-Gehirn im Tab **Lokales LLM**.
*   **RAG (Wissensdatenbank):** Laden Sie Textdateien (`.txt`, `.md`) hoch, um das Wissen der KI zu erweitern (z.B. Dokumentation zu neuen Custom Nodes). Sie können die Datenbank auch direkt mit einer Frage testen.
*   **Fine-Tuning:** Starten Sie Trainingsjobs auf Ihrem lokalen Server, um das Modell spezialisiert anzupassen.

### Verlauf
Alle generierten Workflows werden lokal gespeichert. Im Tab **Verlauf** können Sie alte Versionen wiederherstellen, ansehen oder herunterladen.

---

## Einstellungen & Installation

Klicken Sie auf das Zahnrad (`⚙️`) oben rechts.

*   **ComfyUI API URL:** Adresse Ihrer ComfyUI-Instanz (meist `http://127.0.0.1:8188`).
*   **Lokale LLM API URL:** Adresse Ihres Ollama/RAG-Servers.
*   **Anbieter:** Wählen Sie zwischen Google Gemini (Cloud) oder einem lokalen LLM (Ollama) als Gehirn für den Generator.
*   **Quellcode:** Laden Sie den kompletten Code dieser App herunter.

---

## Fehlerbehebung

### Verbindungsprobleme ("Run" Button)
Wenn der "Run"-Button nicht funktioniert, liegt es oft an CORS-Blockaden des Browsers.

**Lösung:** Starten Sie ComfyUI mit dem Argument `--enable-cors`.
Beispiel (Windows .bat Datei):
`.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --enable-cors`

### Mixed Content Fehler
Wenn diese App über HTTPS läuft, ComfyUI aber über HTTP, blockiert der Browser die Verbindung.
**Lösung:** Erlauben Sie "Unsichere Inhalte" in den Seiteneinstellungen Ihres Browsers (Schloss-Symbol in der Adressleiste).
