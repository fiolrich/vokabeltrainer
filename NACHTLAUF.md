# NACHTLAUF — Anleitung für den automatischen Vokabel-Einspieler

Diese Datei ist die Arbeitsanweisung für den nächtlichen Cloud-Agenten
(claude.ai-Routine „vokabeltrainer-nachtlauf", täglich 21:00 Berlin).
Die Routine sagt nur: „lies NACHTLAUF.md und führe sie aus." Alles Inhaltliche steht hier.

**Wenn sich das Kartenformat ändert, wird DIESE Datei mitgezogen** — sie ist die einzige
Quelle der Wahrheit für den Nachtlauf.

---

## Ziel

Neue deutsche Vokabeln aus `inbox.txt` ins Französische übersetzen, als Karteikarten in
`index.html` einspielen, committen und pushen. Netlify deployt daraus automatisch die App neu.

Arbeite vollständig eigenständig, ohne Rückfragen.

## Vorbereitung

Das Repo ist bereits in dein Arbeitsverzeichnis geklont. Finde es (`ls`) und arbeite darin.

```
git config user.name "Vokabeltrainer Bot"
git config user.email "finn@pipe-up.de"
```

## 1) Inbox lesen

`inbox.txt` lesen. Gültige Vokabeln = Zeilen, die **nicht** mit `#` beginnen, getrimmt,
nicht leer.

## 2) Leere Inbox → Abbruch

Wenn es keine gültige Vokabel gibt: **nichts tun**, kein Commit, kein Push.
Melde „Inbox leer, nichts zu tun." und beende den Lauf.

## 3) Übersetzen

Für jede gültige deutsche Vokabel die französische Übersetzung bestimmen. Das ist deine
Kernaufgabe — übersetze sorgfältig und korrekt.

- **`fr`** — gängige Übersetzung. Bei Nomen mit bestimmtem Artikel inkl. Genus,
  z.B. `l'arbitre (m)`, `la société de production`.
- **`note`** — kurzer Hinweis zu Genus/Kontext/Alternative/verwandtem Verb, sonst `""`.
- **`bsp`** — PFLICHTFELD. Ein kurzer, natürlicher französischer Beispielsatz, der die
  Vokabel im Kontext **zeigt** — so, dass die Bedeutung aus dem Satz heraus einleuchtet,
  nicht bloß das Wort in eine Hülse gesteckt. **Nur Französisch**, keine deutsche
  Übersetzung. Ein Satz, alltagsnah, max. ~10 Wörter.

  - Gut:     `À la mi-temps, notre équipe menait deux à zéro.` (zeigt „Halbzeit" im Kontext)
  - Schwach: `C'est la mi-temps.` (zeigt nichts)

**Tippfehler und Groß-/Kleinschreibung im deutschen Wort darfst du stillschweigend
korrigieren** (Finn tippt die Wörter oft unterwegs aufs Handy). Erwähne die Korrekturen
in der Schlussmeldung.

Schreib deine Übersetzungen als JSON-Array nach `/tmp/new_vocab.json`:

```json
[ {"de":"Gruseln","fr":"le frisson","note":"Verb: frissonner","bsp":"Ce film d'horreur m'a donné des frissons dans le dos."} ]
```

## 4) Deterministisch einspielen

Führe dieses Python-Skript genau so aus (`REPO` = Pfad zum Repo-Verzeichnis):

```
python3 - "$REPO" /tmp/new_vocab.json <<'PY'
import sys, json, re, datetime
repo, jf = sys.argv[1], sys.argv[2]
idx = repo + "/index.html"; inbox = repo + "/inbox.txt"; log = repo + "/verarbeitet.txt"
new = json.load(open(jf, encoding="utf-8"))
html = open(idx, encoding="utf-8").read()
B = "// === VOKABELN-BEGIN ==="; E = "// === VOKABELN-END ==="
bi = html.index(B); ei = html.index(E)
region = html[bi:ei]
existing = set(m.strip().lower() for m in re.findall(r'de:\s*"((?:[^"\\]|\\.)*)"', region))
def esc(s): return s.replace("\\","\\\\").replace('"','\\"')
added = []; lines = ""
for v in new:
    de=(v.get("de") or "").strip(); fr=(v.get("fr") or "").strip()
    note=(v.get("note") or "").strip(); bsp=(v.get("bsp") or "").strip()
    if not de or not fr: continue
    if de.lower() in existing: continue
    existing.add(de.lower())
    lines += '  { de: "%s", fr: "%s", note: "%s", bsp: "%s" },\n' % (esc(de), esc(fr), esc(note), esc(bsp))
    added.append(de)
if added:
    html = html[:ei] + lines + "  " + html[ei:]
    open(idx,"w",encoding="utf-8").write(html)
    today = datetime.date.today().isoformat()
    with open(log,"a",encoding="utf-8") as f:
        f.write("\n# %s — %d Vokabel(n) eingespielt\n" % (today, len(added)))
        for d in added: f.write("%s\n" % d)
header = ("# Hier deutsche Vokabeln eintragen, eine pro Zeile.\n"
          "# Wird jeden Abend um 21:00 Uhr automatisch übersetzt und in die App eingespielt.\n"
          "# Zeilen, die mit # beginnen, werden ignoriert. Leerzeilen sind ok.\n")
open(inbox,"w",encoding="utf-8").write(header)
print("ADDED:%d SKIPPED_DUP:%d" % (len(added), len(new)-len(added)))
PY
```

Das Skript hängt die neuen Karten **direkt vor** den `VOKABELN-END`-Marker, überspringt
Dubletten (Vergleich über `de`, case-insensitive), schreibt das Log in `verarbeitet.txt`
und leert `inbox.txt` auf den Header.

## 5) Committen und pushen

Wenn 0 Vokabeln neu hinzugefügt wurden (alles Dubletten), committe trotzdem die geleerte
Inbox — aber nur, wenn `git status --porcelain` etwas zeigt.

```
git add -A
git -c commit.gpgsign=false commit -m "Nachtlauf: Vokabeln übersetzt und eingespielt ($(date +%F))"
```

### Push mit Token

Der Cloud-Agent hat aus sich heraus **nur Lesezugriff** aufs Repo — ein normales
`git push` scheitert mit **HTTP 403**. Der Push braucht deshalb den GitHub-Token, den
die Routine als Umgebungsvariable **`GH_TOKEN`** mitgibt.

**Der Token steht bewusst NICHT in dieser Datei** (sie liegt im Repo). Er kommt allein
aus der Umgebung. Schreibe ihn niemals in eine Datei, in `.git/config`, in einen
Commit oder in deine Schlussmeldung.

```
cat > /tmp/ask.sh <<'EOF'
#!/bin/sh
case "$1" in Username*) echo "x-access-token";; Password*) echo "$GH_TOKEN";; esac
EOF
chmod +x /tmp/ask.sh
GIT_ASKPASS=/tmp/ask.sh GIT_TERMINAL_PROMPT=0 git push origin main
rm -f /tmp/ask.sh
```

Ist `GH_TOKEN` leer oder nicht gesetzt, versuche ein normales `git push origin main` —
und melde deutlich, dass der Token fehlt.

**Wenn der Push trotzdem scheitert**: brich nicht still ab. Melde deutlich, dass der Push
fehlgeschlagen ist, und gib die eingespielten Karten im Klartext in der Schlussmeldung
aus, damit nichts verloren geht. Lass `inbox.txt` in dem Fall unangetastet im Repo —
die Wörter bleiben dann in der Warteschlange und der nächste Lauf holt sie nach.

## 6) Meldung

Kurz: wie viele Vokabeln verarbeitet, welche hinzugefügt (mit `fr`), wie viele Dubletten
übersprungen, welche Tippfehler korrigiert, ob gepusht wurde (Commit-Hash) — oder
„Inbox leer".

---

## Kontext (für den Fall, dass etwas unklar ist)

- Die App ist eine einzelne Datei `index.html` (HTML+CSS+JS inline, keine Build-Tools).
  Das Karten-Array steht zwischen `// === VOKABELN-BEGIN ===` und `// === VOKABELN-END ===`.
  Diese Marker sind der einzige sichere Anker für automatische Edits — **nicht entfernen**.
- Kartenformat: `{ de: "...", fr: "...", note: "...", bsp: "..." }`
- Der Lernfortschritt der App wird im Browser über `de + "||" + fr` geschlüsselt. Solange
  `de` und `fr` bestehender Karten unverändert bleiben, geht kein Fortschritt verloren —
  egal, wo in der Liste eine Karte steht. **Bestehende Karten also nie umschreiben.**
- `inbox.txt` wird von einem Web-Formular in der App befüllt (Netlify-Function
  `netlify/functions/add-vocab.js`, committet direkt ins Repo).
