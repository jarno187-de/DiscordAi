# 🧠 Brian – der Discord-Bot mit genau EINER Gehirnzelle

Brian ist ein englischsprachiger Chat-Bot für Discord mit drei Sprach-Stilen (normal, dumm, beleidigend). Er ist nicht nützlich. Er ist lustig.

## Was ihn besonders macht: Die Gehirnzelle

Brian hat **genau eine Gehirnzelle** – und die teilt sich der ganze Server.

| Mechanik | Was passiert |
|---|---|
| **Energie (0–100)** | Jede Antwort kostet die Zelle Energie. Je müder sie ist, desto dümmer wird Brian: 🌌 *Galaxy Brain* (hält sich für ein Genie, liegt komplett falsch) → 🧠 normal → 🪫 verliert den Faden, Tippfehler → 💀 schläft mitten im Satz ein. Erholt sich langsam von selbst. |
| **`/feed <essen>`** | Füttere die Zelle. Gehirnfutter (Fisch, Walnüsse) und Kaffee helfen, Junkfood ein bisschen, Steine schaden. Wachsmalstifte sind seine Lieblingsspeise. |
| **`/steal`** | **Klau Brian die Gehirnzelle.** Er wird zum hirnlosen Höhlenmenschen („UGG. BRAIN GONE.“) und beschuldigt den Dieb. Andere können sie dem Dieb wieder klauen. Nach 10 Minuten krabbelt sie von selbst nach Hause. |
| **`/giveback`** | Gib sie zurück (Brian ist dramatisch dankbar). |
| **Groll & Freundschaft** | Brian merkt sich, wer ihn beklaut, füttert, lobt oder beleidigt – und behandelt dich entsprechend (vom *BEST FRIEND FOREVER* bis zum *ARCH-NEMESIS*). |
| **Falscher Name** | Brian weigert sich, deinen echten Namen zu lernen. Für ihn heißt du für immer „Moist Nathan“ oder „Captain Cheese“. |
| **Obsession des Tages** | Jeden Tag ist er von etwas anderem besessen (Tauben sind Regierungsdrohnen, Mittwoche existieren nicht, …) und bringt es überall ein. |
| **Ungefragt reinplatzen** | Ab und zu mischt er sich ungefragt in Gespräche ein oder reagiert mit 🦀 🪿 🧀. |

### Weitere Befehle
- `/braincell` – Status: Energie, wer sie gerade hat, Rangliste der größten Diebe
- `/conspiracy @user` – Brian enthüllt die „Wahrheit“ über jemanden
- `/advice <problem>` – katastrophale Lebensberatung
- `/rate <ding>` – Bewertung auf einer Skala, die keinen Sinn ergibt („7 out of 3 geese“)
- `/opinion [@user]` – Brians Akte über dich

### Chatten & Sprach-Stile
Schreib einfach:

```
.brian how are you /style insult
```

`/style <stil>` kann irgendwo in der Nachricht stehen. Ohne `/style` antwortet er **normal**.

| Stil | Wie Brian antwortet |
|---|---|
| *(keiner)* / `normal` | Ganz normal und freundlich, wie ein Kumpel im Chat |
| `dumb` (auch `dumm`, `stupid`) | Labert dummes Zeug – der Ein-Gehirnzellen-Brian (je müder die Zelle, desto dümmer) |
| `insult` (auch `roast`, `savage`, `toxic`, `beleidigung`) | Brutaler Roast mit harten, **unzensierten** Beleidigungen (bastard, son of a bitch, …). Keine Slurs gegen Herkunft/Religion/Sexualität, keine Drohungen. |

Alternativ als Slash-Command mit Auswahlmenü: `/brian prompt:<text> style:<stil>`.

**Wichtig:** Ist die Gehirnzelle gerade geklaut (`/steal`), redet er in *jedem* Stil wie ein Höhlenmensch.

Außerdem antwortet Brian, wenn man ihn **@erwähnt**, auf seine Nachricht **antwortet**, das Wort **„brian“** schreibt, oder in Kanälen aus `CHAT_CHANNEL_IDS` – auch dort funktioniert `/style`. Die Slash-Commands (`/feed`, `/rate`, …) und das ungefragte Reinplatzen nutzen immer den `dumb`-Stil.

## KI – komplett gratis, nichts lokal

Brian nutzt eine Kette, damit er immer *irgendwas* sagt:

1. **Groq** (empfohlen) – gratis API-Key, schnell, Modell `llama-3.1-8b-instant` (klein und angemessen dumm).
2. **Pollinations.ai** – funktioniert **ganz ohne Key/Anmeldung**, aber nur ca. 1 Antwort pro 45 Sekunden.
3. **Eingebaute dumme Sprüche** – wenn beides gerade nicht geht („error 404: thought not found 🫠“).

Ohne Groq-Key läuft der Bot also trotzdem, ist nur langsamer/öfter auf Sprüche angewiesen. Andere OpenAI-kompatible Gratis-Anbieter (OpenRouter `:free`-Modelle, Gemini) gehen auch – siehe `.env.example`.

## Einrichtung

**Voraussetzung:** [Node.js](https://nodejs.org) 18.17 oder neuer.

1. **Bot erstellen:** <https://discord.com/developers/applications> → *New Application* → Name „Brian“.
2. Links **Bot** → *Reset Token* → Token kopieren.
   Auf derselben Seite unter *Privileged Gateway Intents* **„Message Content Intent“ einschalten** (sonst kann er Nachrichten nicht lesen!).
3. **Einladen:** Links *OAuth2* → *URL Generator* → Scopes `bot` + `applications.commands`, Permissions: *Send Messages*, *Read Message History*, *Add Reactions*, *Embed Links*. Link öffnen und Server auswählen.
4. **Groq-Key holen (optional, empfohlen):** <https://console.groq.com> → API Keys → Create.
5. **Konfigurieren & starten:**
   ```bash
   npm install
   cp .env.example .env     # dann DISCORD_TOKEN (und AI_API_KEY) eintragen
   npm start
   ```
   Tipp: Trag deine Server-ID bei `GUILD_ID` ein (Rechtsklick auf Server → *Server-ID kopieren*, Entwicklermodus muss an sein), dann erscheinen die Slash-Commands sofort.

Brians Gedächtnis (Energie, Diebe, Freundschaften) liegt in `data/brain.json`.

**Wasserzeichen:** Jede Nachricht des Bots endet klein mit „made by jarnoo__“ (bei Embeds in der Fußzeile). Änderbar über `WATERMARK` in der `.env`.

### Rund um die Uhr: Gratis-Bot-Hoster (ohne Kreditkarte)
Viele kostenlose Discord-Bot-Hoster nutzen dieselbe Oberfläche (**Pterodactyl-Panel**). Der Haken dabei: Die Leistung ist begrenzt, und bei den meisten musst du den Server **alle paar Tage im Dashboard verlängern** (Button „Renew“). Machst du das nicht, wird er gestoppt.

1. Bei einem Gratis-Bot-Hoster anmelden und einen neuen **Discord-Bot-/Node.js-Server** erstellen. Nimm mindestens **128 MB RAM**, besser 256 MB oder mehr.
2. Im Panel unter **Startup**:
   - **Node-Version** auf **20** oder **22** stellen
   - die Start-Datei (`JS_FILE` / „Main file“) auf **`index.js`** lassen
3. Unter **Files** die Datei **`brian-hosting.zip`** hochladen, Rechtsklick → **Unarchive/Entpacken**. `package.json` und `index.js` müssen danach direkt im Hauptordner liegen, nicht in einem Unterordner.
4. Im Panel **New File** anlegen, als Namen **`.env`** eingeben und den Inhalt deiner `.env` hineinkopieren (Token usw.). Dann speichern.
5. Unter **Console** auf **Start** klicken. Das Panel installiert die Pakete selbst (`npm install`). Danach sollte erscheinen: `🧠 … is online with exactly one brain cell.`

Nicht vergessen: im Dashboard regelmäßig **verlängern**. Läuft Brian gleichzeitig auf deinem PC, dort beenden, sonst antwortet er doppelt.

Die ZIP baust du selbst so: Im Brian-Ordner alles außer `node_modules`, `.git` und `.env` markieren und als ZIP packen. Wichtig ist, dass die Dateien direkt in der ZIP liegen und nicht in einem Ordner darin.

### Rund um die Uhr laufen lassen (gratis, Oracle Cloud)
Brian läuft auf einem kostenlosen Server von Oracle („Always Free“, dauerhaft gratis). Dein PC kann aus sein.

**A) Konto anlegen**
1. Auf <https://www.oracle.com/cloud/free/> auf **Start for free** klicken.
2. Als *Home Region* eine Region in deiner Nähe nehmen, z. B. **Germany Central (Frankfurt)**. Die Region lässt sich später nicht ändern.
3. Eine Kredit- oder Debitkarte wird nur zur Verifizierung verlangt. Solange du nur „Always Free“-Sachen nutzt, kostet es nichts.

**B) Server erstellen**
1. Im Oracle-Menü ☰ → **Compute** → **Instances** → **Create instance**.
2. **Image:** *Change image* → **Ubuntu** → *Canonical Ubuntu 24.04*.
3. **Shape:** *Change shape* → eine mit dem Label **„Always Free-eligible“** nehmen, z. B. **VM.Standard.E2.1.Micro** (AMD) oder **VM.Standard.A1.Flex** (Ampere, 1 OCPU / 6 GB). Bei „Out of capacity“ die andere Shape probieren.
4. **Add SSH keys:** *Generate a key pair for me* → **Save private key** klicken. Die Datei in **brian.key** umbenennen und in deinen **Downloads**-Ordner legen.
5. **Create** klicken und warten, bis der Status **Running** ist. Die **Public IP address** notieren, z. B. `130.61.12.34`.

Ports musst du nicht öffnen, Brian verbindet sich selbst zu Discord.

**C) Brian hochladen** (am Windows-PC)
1. Läuft Brian noch auf deinem PC, das schwarze Fenster schließen. Sonst antwortet er doppelt.
2. Den Brian-Ordner öffnen (der mit `package.json` und `.env`), in die Adressleiste `cmd` tippen und Enter drücken.
3. Diesen Befehl einfügen, **`DEINE_IP` durch die IP ersetzen**, Enter drücken und die Frage einmal mit `yes` beantworten:
   ```
   scp -i "%USERPROFILE%\Downloads\brian.key" -r "%cd%" ubuntu@DEINE_IP:~/brian
   ```
   Kommt *„UNPROTECTED PRIVATE KEY FILE“*, einmal diesen Befehl ausführen und es nochmal versuchen:
   ```
   icacls "%USERPROFILE%\Downloads\brian.key" /inheritance:r /grant:r "%USERNAME%:R"
   ```

**D) Einrichten**
1. Mit dem Server verbinden:
   ```
   ssh -i "%USERPROFILE%\Downloads\brian.key" ubuntu@DEINE_IP
   ```
2. Dort eingeben:
   ```
   bash ~/brian/deploy/setup.sh
   ```
   Das Skript installiert Node.js und alles Nötige und richtet Brian als Dienst ein. Er startet automatisch neu, wenn er abstürzt oder der Server neu startet. Am Ende steht **„Done! Brian now runs 24/7“**, dann kannst du das Fenster schließen.

**Später: Code aktualisieren.** Im Brian-Ordner am PC `cmd` öffnen und Folgendes ausführen:
```
scp -i "%USERPROFILE%\Downloads\brian.key" -r src package.json package-lock.json ubuntu@DEINE_IP:~/brian/
ssh -i "%USERPROFILE%\Downloads\brian.key" ubuntu@DEINE_IP "bash ~/brian/deploy/setup.sh"
```

**Nützlich auf dem Server:** `sudo journalctl -u brian -f` zeigt die Logs live (Beenden mit Strg+C). `sudo systemctl restart brian` startet ihn neu, `sudo systemctl stop brian` stoppt ihn.

> Hinweis: Oracle kann Gratis-Server, die wochenlang fast nichts tun, wieder einsammeln. Brian ist meist zu aktiv dafür. Wenn du sichergehen willst, stell das Konto auf *Pay As You Go* um. Es bleibt gratis, solange du nur Always-Free-Ressourcen nutzt.

## Projektstruktur
```
index.js            Startdatei für Bot-Hoster (lädt src/index.js)
src/index.js        Discord-Client, Nachrichten, Reinplatzen
src/commands.js     Slash-Commands
src/brain.js        Die Gehirnzelle: Energie, Füttern, Klauen, Freundschaft
src/personality.js  Brians Persönlichkeit, Obsessionen, Notfall-Sprüche
src/speak.js        Baut den Prompt und fragt die KI
src/ai.js           Gratis-KI-Kette (Groq → Pollinations → Sprüche)
src/store.js        Speichert alles in data/brain.json
src/watermark.js    Hängt „made by jarnoo__“ an jede Nachricht
deploy/setup.sh     Richtet Brian 24/7 auf einem Ubuntu-Server ein
```
