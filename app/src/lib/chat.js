// Streaming chat client. Talks to POST /api/ai/chat, which answers with server-sent events carrying typed parts:
//   plan, step, evidence, reasoning, text, tool, error, finish, start, done.
// The caller renders parts as they arrive; nothing is buffered until the end.
const LIMITS = { image: 3 * 1024 * 1024, text: 400 * 1024 };
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/";

const send = (path, init) => (window.PT_AUTH && window.PT_AUTH.fetch ? window.PT_AUTH.fetch(path, init) : fetch(path, init));

// One SSE frame per blank line; each frame is a JSON object after "data: ".
function frame(block) {
  const line = block.split("\n").find((l) => l.startsWith("data:"));
  if (!line) return null;
  const raw = line.slice(5).trim();
  if (!raw || raw === "[DONE]") return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export async function streamChat({ message, threadId, mode = "fast", symbol, lang, attachments, signal, onPart }) {
  const body = { message, mode, threadId: threadId || undefined, symbol: symbol || undefined, lang: lang || undefined, attachments: attachments && attachments.length ? attachments : undefined };
  const r = await send("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status, code: j.code, need: j.need });
  }
  if (!r.body) throw new Error("This browser cannot stream the answer.");
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", out = { threadId: null };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const part = frame(buf.slice(0, cut));
      buf = buf.slice(cut + 2);
      if (!part) continue;
      if (part.type === "start" && part.threadId) out.threadId = part.threadId;
      if (part.type === "done" && part.threadId) out.threadId = part.threadId;
      onPart && onPart(part);
    }
  }
  return out;
}

/* Threads for anyone who is not signed in. The server stores threads for accounts; guests get the same list
   from this browser so a conversation survives a reload either way. */
const TKEY = "ptpub.v1.chat.threads";
const MAX_THREADS = 30;
const MAX_MSGS = 40;

function readStore() {
  try {
    const v = JSON.parse(localStorage.getItem(TKEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}
function writeStore(list) {
  try { localStorage.setItem(TKEY, JSON.stringify(list.slice(0, MAX_THREADS))); } catch (e) { /* quota or private mode */ }
}
export function localThreads() {
  return readStore().map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt, count: (t.messages || []).length }));
}
export function localThread(id) {
  const t = readStore().find((x) => x.id === id);
  return t ? { ...t, id } : null;
}
export function saveLocalThread(doc) {
  if (!doc || !doc.id) return;
  const now = new Date().toISOString();
  const list = readStore().filter((t) => t.id !== doc.id);
  list.unshift({
    id: doc.id,
    title: (doc.title || "Untitled").slice(0, 80),
    createdAt: doc.createdAt || now,
    updatedAt: doc.updatedAt || now,
    messages: (doc.messages || []).slice(-MAX_MSGS),
  });
  writeStore(list);
}
export function dropLocalThread(id) {
  writeStore(readStore().filter((t) => t.id !== id));
}

/* PDF: the text layer when it has one, otherwise the first pages rendered as images so a scanned statement or a
   photographed document is still readable by the model. */
async function readPdf(file) {
  let lib;
  try { lib = await import(/* @vite-ignore */ PDFJS + "pdf.min.mjs"); }
  catch (e) { throw new Error("The PDF reader could not be loaded. Check your connection and try again."); }
  lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs";
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(doc.numPages, 25); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((x) => x.str).join(" ") + "\n";
  }
  if (text.replace(/\s+/g, " ").trim().length > 200) {
    return [{ kind: "text", name: file.name, mime: "text/plain", text: text.slice(0, 200000) }];
  }
  const out = [];
  for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    out.push({ kind: "image", name: `${file.name} page ${i}`, mime: "image/jpeg", base64: canvas.toDataURL("image/jpeg", 0.9).split(",")[1] || "" });
  }
  return out;
}

// Browser File -> attachment(s) the server understands: {kind:"image", mime, base64} or {kind:"text", text}.
// A PDF returns an array: one text attachment, or up to four page images when it has no text layer.
export async function readAttachment(file) {
  const mime = file.type || "";
  const isImage = /^image\/(png|jpe?g|webp|gif)$/i.test(mime);
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(file.name || "");
  const isText = /^(text\/|application\/(json|csv))/.test(mime) || /\.(csv|tsv|txt|md|json)$/i.test(file.name || "");
  if (isPdf) {
    if (file.size > 20 * 1024 * 1024) throw new Error("PDFs must be 20 MB or smaller.");
    return readPdf(file);
  }
  if (isImage) {
    if (file.size > LIMITS.image) throw new Error("Images must be 3 MB or smaller.");
    const fr = new FileReader();
    return new Promise((resolve, reject) => {
      fr.onerror = () => reject(new Error("That file could not be read."));
      fr.onload = () => resolve({ kind: "image", name: file.name, mime, base64: String(fr.result).split(",")[1] || "" });
      fr.readAsDataURL(file);
    });
  }
  if (isText) {
    if (file.size > LIMITS.text) throw new Error("Text files must be 400 KB or smaller.");
    const fr = new FileReader();
    return new Promise((resolve, reject) => {
      fr.onerror = () => reject(new Error("That file could not be read."));
      fr.onload = () => resolve({ kind: "text", name: file.name, mime: mime || "text/plain", text: String(fr.result).slice(0, 200000) });
      fr.readAsText(file);
    });
  }
  throw new Error("Attach a PDF, an image, a CSV or a text file.");
}
