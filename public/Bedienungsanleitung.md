# Bedienungsanleitung: AI ComfyUI Workflow Suite

Herzlich willkommen zur AI ComfyUI Workflow Suite! Dieses Tool wurde entwickelt, um Ihnen die Erstellung, Validierung und Korrektur von ComfyUI-Workflows so einfach wie möglich zu machen. Egal, ob Sie ein Anfänger oder ein erfahrener ComfyUI-Nutzer sind, diese Suite hilft Ihnen, Ihre Ideen schnell in funktionierende Workflows umzusetzen.

## Inhaltsverzeichnis
1.  [Übersicht der Benutzeroberfläche](#übersicht-der-benutzeroberfläche)
2.  [Der "Generator"-Tab](#der-generator-tab-workflows-erstellen)
3.  [Der "Tester"-Tab](#der-tester-tab-workflows-prüfen-und-reparieren)
4.  [Der "Verlauf"-Tab](#der-verlauf-tab-frühere-arbeiten-verwalten)
5.  [Der "Lokales LLM"-Tab](#der-lokales-llm-tab-lokales-llm-verwalten)
6.  [Das Ausgabefenster im Detail](#das-ausgabefenster-im-detail)
7.  [Einstellungen](#einstellungen)
8.  [Tipps für beste Ergebnisse](#tipps-für-beste-ergebnisse)
9.  [Qualität & Technische Details](#qualität--technische-details)

---

## Übersicht der Benutzeroberfläche

Die Anwendung ist in einige Hauptbereiche unterteilt:

-   **Header:** Zeigt den Namen der Anwendung an. Oben rechts finden Sie ein Zahnrad-Symbol (`⚙️`) für die **Einstellungen** und einen Schalter, um die Sprache zwischen Deutsch und Englisch zu wechseln.
-   **Tab-Leiste:** Hier können Sie zwischen den verschiedenen Funktionen wechseln: `Generator`, `Tester`, `Verlauf`, `Lokales LLM` und `Dokumentation`.
-   **Hauptfenster:** Dieses ist zweigeteilt. Die linke Hälfte ändert sich je nach gewähltem Tab (Eingabebereich), während die rechte Hälfte immer das **Ausgabefenster** ist, in dem die Ergebnisse angezeigt werden.

---

## Der "Generator"-Tab: Workflows erstellen

Dies ist der Hauptbereich, in dem Sie neue Workflows aus einer einfachen Textbeschreibung erstellen lassen.

### 1. Workflow beschreiben
Geben Sie in das große Textfeld eine Beschreibung dessen ein, was Ihr Workflow tun soll.

-   **Seien Sie detailliert:** Je genauer Ihre Beschreibung, desto besser wird das Ergebnis. Anstatt nur "Ein Bild von einer Katze" zu schreiben, versuchen Sie es mit "Ein fotorealistisches Bild einer Katze im Weltraum mit einem SDXL-Modell, das einen Helm trägt".
-   **Beispiele nutzen:** Unter dem Textfeld finden Sie einige Beispiel-Prompts. Klicken Sie darauf, um sie auszuprobieren.

### 2. Prompt-Assistent
Wenn Sie sich nicht sicher sind, wie Sie Ihren Prompt formulieren sollen, klicken Sie auf den `Prompt-Assistent`-Button. Es öffnet sich ein Chatfenster, in dem eine KI Ihnen gezielte Fragen zu Stil, Komposition, Beleuchtung und mehr stellt, um Ihren ursprünglichen Gedanken zu einem perfekten, detaillierten Prompt zu verfeinern.

### 3. Workflow-Assistent
Für technisch versierte Benutzer gibt es den `Workflow-Assistent`. Dieser Assistent führt Sie durch eine Reihe technischer Fragen (z.B. welches Modell, welcher Sampler), um einen präzisen, technischen Prompt zu erstellen, der für die Workflow-Generierung optimiert ist.

### 4. Bild hochladen (für Img2Img etc.)
Unter dem Haupt-Eingabefeld finden Sie einen Bereich zum Hochladen von Bildern.

-   **Zweck:** Diese Funktion ist unerlässlich für Workflows, die ein Eingangsbild benötigen, wie z.B. Image-to-Image, Inpainting oder die Verwendung von ControlNet.
-   **Anwendung:** Ziehen Sie einfach eine Bilddatei per Drag & Drop in den markierten Bereich oder klicken Sie darauf, um eine Datei auszuwählen. Eine Vorschau des ausgewählten Bildes wird angezeigt. Mit dem Mülleimer-Symbol können Sie das Bild wieder entfernen.
-   **Automatische Integration:** Wenn Sie einen Workflow mit einem hochgeladenen Bild generieren, erstellt die KI automatisch einen `LoadImage`-Knoten und konfiguriert ihn so, dass er Ihr hochgeladenes Bild verwendet und es zum Ausgangspunkt des Prozesses macht.

### 5. Workflow generieren
Wenn Sie mit Ihrer Beschreibung zufrieden sind, klicken Sie auf `Workflow generieren`. Eine Fortschrittsanzeige informiert Sie über die einzelnen Schritte: Die KI analysiert Ihre Anfrage, erstellt den Workflow und validiert ihn. Das Ergebnis erscheint im Ausgabefenster.

---

## Der "Tester"-Tab: Workflows prüfen und reparieren

Haben Sie einen bestehenden Workflow, der nicht funktioniert? Hier können Sie ihn reparieren lassen.

-   **Workflow JSON:** Fügen Sie den kompletten JSON-Code Ihres ComfyUI-Workflows in dieses Feld ein.
-   **ComfyUI Fehlermeldung (Optional):** Wenn ComfyUI beim Ausführen des Workflows eine spezifische Fehlermeldung ausgibt, fügen Sie diese hier ein. Die KI wird versuchen, den Workflow gezielt zu korrigieren, um diesen Fehler zu beheben.
-   **Button:**
    -   Wenn Sie nur ein Workflow-JSON einfügen, heißt der Button `Validieren & korrigieren`. Die KI führt eine allgemeine Prüfung durch.
    -   Wenn Sie auch eine Fehlermeldung angeben, ändert sich der Button zu `Fehler beheben` für eine gezielte Reparatur.

---

## Der "Verlauf"-Tab: Frühere Arbeiten verwalten

Jeder Workflow, den Sie im `Generator`-Tab erstellen, wird automatisch hier gespeichert.

-   **Liste:** Zeigt alle bisherigen Generationen mit Prompt und Datum.
-   **Auswählen:** Klicken Sie auf einen Eintrag, um das Ergebnis erneut im Ausgabefenster anzuzeigen.
-   **Herunterladen (`📥`):** Laden Sie das Workflow-JSON eines bestimmten Eintrags direkt herunter.
-   **Verlauf löschen:** Entfernt alle Einträge dauerhaft. Diese Aktion kann nicht rückgängig gemacht werden.

---

## Der "Lokales LLM"-Tab: Lokales LLM verwalten

Dieser Tab bietet fortgeschrittene Funktionen zur Interaktion mit einem lokal betriebenen Large Language Model (LLM). **Wichtig:** Diese Funktionen setzen voraus, dass Sie einen kompatiblen lokalen LLM-Server betreiben und dessen Adresse in den `Einstellungen` korrekt konfiguriert haben.

### RAG / Wissensdatenbank
RAG (Retrieval-Augmented Generation) ermöglicht es Ihnen, das Wissen des LLMs mit Ihren eigenen Dokumenten zu erweitern, ohne das Modell neu trainieren zu müssen.

1.  **Dateien auswählen:** Ziehen Sie `.txt`- oder `.md`-Dateien in den Upload-Bereich oder klicken Sie darauf, um Dateien auszuwählen.
2.  **Hochladen:** Klicken Sie auf `Ausgewählte Dateien hochladen`, um die Dokumente an den RAG-Service Ihres LLMs zu senden. Die hochgeladenen Inhalte stehen dem Modell dann für Anfragen zur Verfügung.

### Fine-Tuning
Fine-Tuning passt das Verhalten des LLMs an, indem es auf einem spezifischen Datensatz trainiert wird.

1.  **Trainingsdaten einfügen:** Fügen Sie Ihre Trainingsdaten in das Textfeld ein. Die Daten müssen im **JSONL-Format** vorliegen, wobei jede Zeile ein JSON-Objekt ist. Beispiel:
    `{"prompt": "Frage 1", "completion": "Antwort 1"}`
    `{"prompt": "Frage 2", "completion": "Antwort 2"}`
2.  **Training starten:** Klicken Sie auf `Fine-Tuning starten`, um den Trainingsjob an Ihren lokalen Server zu senden. Der Fortschritt wird im Protokollfenster darunter angezeigt.

---

## Das Ausgabefenster im Detail

Hier werden die Ergebnisse Ihrer Anfragen angezeigt.

### Steuerelemente (oben rechts)
-   **Validieren & Korrigieren (`🐛`):** Sendet den aktuellen Workflow erneut zur Validierung und Korrektur an die KI. Nützlich, wenn Sie manuelle Änderungen vorgenommen haben oder eine zweite Meinung wünschen.
-   **Run (`▶️`):** Sendet den Workflow direkt an Ihre laufende ComfyUI-Instanz zur Ausführung. **Wichtig:** Sie müssen zuerst die Adresse Ihrer ComfyUI-API in den `Einstellungen` konfigurieren!
-   **Workflow in ComfyUI laden (`📋`):** Kopiert den Workflow in die Zwischenablage und zeigt eine Anleitung an. Sie können den Workflow dann einfach in ComfyUI mit Strg+V einfügen.
-   **Copy JSON:** Kopiert den vollständigen Workflow-JSON in Ihre Zwischenablage.
-   **Download:** Lädt den Workflow als `.json`-Datei herunter.

### Tabs
-   **Visualisierung:** Zeigt eine grafische Darstellung der Nodes und ihrer Verbindungen. Dies gibt Ihnen einen schnellen Überblick über die Struktur des Workflows. Sie können auf einzelne Nodes klicken, um deren Details in einem Popup-Fenster anzuzeigen.
-   **Workflow:** Zeigt den rohen JSON-Code des Workflows.
-   **Anforderungen:** Listet alle für den Workflow benötigten Modelle und Custom Nodes auf.
-   **Protokolle:** Zeigt Validierungs- oder Debugging-Informationen an, falls vorhanden.

### Der Bereich "Anforderungen"
Einer der wichtigsten Abschnitte! Er listet alles auf, was Sie benötigen, damit der Workflow funktioniert.
-   **Custom Nodes:** Zeigt an, welche zusätzlichen Nodes Sie installieren müssen. Enthält einen GitHub-Link und **direkt kopierbare Terminal-Befehle** für eine einfache Installation.
-   **Modelle:** Listet alle benötigten Modelle auf (z.B. Checkpoints, LoRAs, VAEs). Enthält einen Download-Link und den **exakten Installationspfad**, in den Sie die Datei in Ihrem `ComfyUI`-Verzeichnis ablegen müssen.

---

## Einstellungen

Klicken Sie auf das Zahnrad-Symbol (`⚙️`) oben rechts, um die Einstellungen zu öffnen.

-   **ComfyUI API URL:** Dies ist die wichtigste Einstellung für die Workflow-Ausführung. Damit die `Run`-Funktion funktioniert, müssen Sie hier die Adresse Ihrer ComfyUI-Instanz eingeben. Der Standardwert ist normalerweise `http://127.0.0.1:8188`.
-   **Lokale LLM API URL:** Geben Sie hier die Basis-URL für Ihren lokalen LLM-Server ein. Diese wird für die Funktionen im "Lokales LLM"-Tab (RAG und Fine-Tuning) benötigt.
-   **Quellcode herunterladen:** Lädt den gesamten Quellcode dieser Webanwendung als einzelne Textdatei herunter.

---

## Tipps für beste Ergebnisse

-   **Spezifisch sein:** Geben Sie Modelltypen (SDXL, SD 1.5), Techniken (Inpainting, ControlNet) und Stile (fotorealistisch, Anime) in Ihrem Prompt an.
-   **Kontext geben:** Erklären Sie das Ziel. Anstatt "Zwei KSampler", sagen Sie "Einen KSampler für ein Basis-Bild und einen zweiten für ein Hi-Res-Fix".
-   **Komponenten prüfen:** Überprüfen Sie nach der Generierung immer den Abschnitt "Anforderungen", um sicherzustellen, dass Sie alle erforderlichen Modelle und Custom Nodes installiert haben.

---

## Qualität & Technische Details

Um die höchste Zuverlässigkeit zu gewährleisten, durchläuft jeder generierte oder korrigierte Workflow einen mehrstufigen internen Validierungsprozess:

1.  **Strukturelle Validierung:** Zuerst wird die grundlegende Struktur des JSON geprüft. Jeder Wert muss den korrekten Datentyp haben (z.B. muss ein Seed-Wert eine Zahl und kein Text sein).
2.  **Graphen-Analyse:** Der Workflow wird als logischer Graph analysiert. Die KI stellt sicher, dass alle Verbindungen konsistent sind, alle benötigten Inputs verbunden sind und keine "verwaisten" Nodes existieren.
3.  **Semantische Validierung:** Dies ist ein "Experten-Check". Die KI prüft die Einstellungen in wichtigen Nodes auf Plausibilität. Beispielsweise wird ein `CFG`-Wert von `0` in einem `KSampler`, der den Prompt ignorieren würde, automatisch zu einem sinnvollen Standardwert wie `8.0` korrigiert.
4.  **RFC-Konformität & Schema-Validierung:** Jeder Workflow wird so erstellt, dass er den offiziellen ComfyUI RFCs und dem neuesten Zod-Schema entspricht. Dies garantiert maximale strukturelle Korrektheit und Kompatibilität.

### Automatisierte Kontexterweiterung
Wenn eine **Lokale LLM API URL** in den Einstellungen konfiguriert ist, erweitert die Suite automatisch ihre Fähigkeiten:
-   **Retrieval-Augmented Generation (RAG):** Vor der Generierung eines Workflows fragt das System Ihre lokale Wissensdatenbank mit Ihrem Prompt ab. Werden relevante Informationen gefunden, werden diese der Haupt-KI als zusätzlicher Kontext zur Verfügung gestellt, was zu genaueren und maßgeschneiderten Workflows führt.
-   **Dynamisches System-Inventar:** Die Anwendung ruft eine Echtzeit-Liste Ihrer verfügbaren Modelle (Checkpoints, LoRAs usw.) von Ihrem lokalen Server ab. Die KI wird dann angewiesen, **ausschließlich** Modell-Dateinamen aus dieser Liste zu verwenden, was Fehler durch halluzinierte oder nicht verfügbare Modellnamen drastisch reduziert.
