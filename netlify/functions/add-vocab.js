/**
 * Netlify Function: add-vocab
 * -----------------------------------------------------------------------------
 * Nimmt per POST rohe deutsche Vokabeln (eine pro Zeile) entgegen und hängt sie
 * an inbox.txt im GitHub-Repo an — via GitHub Contents API mit GITHUB_TOKEN
 * (Netlify-Umgebungsvariable). KEINE Übersetzung hier; die macht der Nachtlauf.
 *
 * Erwarteter Body: { "words": ["Gruseln", "Schiedsrichter", ...] }
 */

const OWNER  = "fiolrich";
const REPO   = "vokabeltrainer";
const BRANCH = "main";
const PATH   = "inbox.txt";
const API    = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Nur POST erlaubt." });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return json(500, { error: "Server nicht konfiguriert (GITHUB_TOKEN fehlt)." });
  }

  // --- Eingabe parsen ---
  let words;
  try {
    const data = JSON.parse(event.body || "{}");
    words = data.words;
  } catch (e) {
    return json(400, { error: "Ungültiger Request-Body (kein JSON)." });
  }
  if (!Array.isArray(words)) {
    return json(400, { error: "Feld 'words' muss eine Liste sein." });
  }
  const clean = words
    .map((w) => (typeof w === "string" ? w.trim() : ""))
    .filter((w) => w.length > 0);
  if (clean.length === 0) {
    return json(400, { error: "Keine gültigen Vokabeln übergeben." });
  }

  const ghHeaders = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "User-Agent": "vokabeltrainer-add-vocab",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    // --- aktuelle inbox.txt holen (Inhalt + sha) ---
    const getRes = await fetch(`${API}?ref=${BRANCH}`, { headers: ghHeaders });
    if (!getRes.ok) {
      const t = await getRes.text();
      return json(502, { error: `GitHub GET fehlgeschlagen (${getRes.status}): ${t.slice(0, 200)}` });
    }
    const file = await getRes.json();
    const currentContent = Buffer.from(file.content || "", "base64").toString("utf8");
    const sha = file.sha;

    // --- schon vorhandene Wörter (nicht-Kommentar) für leichtes Dedupe ---
    const existing = new Set(
      currentContent
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"))
        .map((l) => l.toLowerCase())
    );

    const toAdd = [];
    for (const w of clean) {
      const key = w.toLowerCase();
      if (!existing.has(key)) {
        existing.add(key);
        toAdd.push(w);
      }
    }
    if (toAdd.length === 0) {
      return json(200, { added: 0, skipped: clean.length, message: "Alle Vokabeln waren bereits in der Inbox." });
    }

    // --- anhängen (mit sauberem Zeilenumbruch) ---
    let base = currentContent;
    if (base.length > 0 && !base.endsWith("\n")) base += "\n";
    const newContent = base + toAdd.join("\n") + "\n";
    const newB64 = Buffer.from(newContent, "utf8").toString("base64");

    // --- committen (PUT) ---
    const putRes = await fetch(API, {
      method: "PUT",
      headers: ghHeaders,
      body: JSON.stringify({
        message: `Inbox: ${toAdd.length} Vokabel(n) über Web-Formular hinzugefügt`,
        content: newB64,
        sha,
        branch: BRANCH,
      }),
    });
    if (!putRes.ok) {
      const t = await putRes.text();
      return json(502, { error: `GitHub PUT fehlgeschlagen (${putRes.status}): ${t.slice(0, 200)}` });
    }

    return json(200, { added: toAdd.length, skipped: clean.length - toAdd.length });
  } catch (err) {
    return json(500, { error: `Unerwarteter Fehler: ${err.message}` });
  }
};
