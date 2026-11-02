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

### Rund um die Uhr laufen lassen
Der Bot muss dauerhaft laufen. Gratis-Optionen: ein alter PC/Raspberry Pi, oder Hoster mit Free-Tier für Node-Prozesse (z. B. Oracle Cloud Free Tier). Mit `pm2` (`npx pm2 start src/index.js --name brian`) startet er nach Abstürzen neu.

## Projektstruktur
```
src/index.js        Discord-Client, Nachrichten, Reinplatzen
src/commands.js     Slash-Commands
src/brain.js        Die Gehirnzelle: Energie, Füttern, Klauen, Freundschaft
src/personality.js  Brians Persönlichkeit, Obsessionen, Notfall-Sprüche
src/speak.js        Baut den Prompt und fragt die KI
src/ai.js           Gratis-KI-Kette (Groq → Pollinations → Sprüche)
src/store.js        Speichert alles in data/brain.json
src/watermark.js    Hängt „made by jarnoo__“ an jede Nachricht
```
