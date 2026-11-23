// Streaming chat client. Talks to POST /api/ai/chat, which answers with server-sent events carrying typed parts:
//   plan, step, evidence, reasoning, text, tool, error, finish, start, done.
// The caller renders parts as they arrive; nothing is buffered until the end.
const LIMITS = { image: 3 * 1024 * 1024, text: 400 * 1024 };

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

// Browser File -> attachment the server understands: {kind:"image", mime, base64} or {kind:"text", text}.
export function readAttachment(file) {
  const mime = file.type || "";
  const isImage = /^image\/(png|jpe?g|webp|gif)$/i.test(mime);
  const isText = /^(text\/|application\/(json|csv))/.test(mime) || /\.(csv|txt|md|json)$/i.test(file.name || "");
  return new Promise((resolve, reject) => {
    if (isImage) {
      if (file.size > LIMITS.image) return reject(new Error("Images must be 3 MB or smaller."));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("That file could not be read."));
      fr.onload = () => resolve({ kind: "image", name: file.name, mime, base64: String(fr.result).split(",")[1] || "" });
      fr.readAsDataURL(file);
      return;
    }
    if (isText) {
      if (file.size > LIMITS.text) return reject(new Error("Text files must be 400 KB or smaller."));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("That file could not be read."));
      fr.onload = () => resolve({ kind: "text", name: file.name, mime: mime || "text/plain", text: String(fr.result).slice(0, 200000) });
      fr.readAsText(file);
      return;
    }
    reject(new Error("Attach an image, CSV or text file."));
  });
}
