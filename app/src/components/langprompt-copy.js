/* Copy for the first-visit language prompt, one entry per language we ship (same ten as PT_I18N.LANGS). Written in the language it offers, static,
   so showing it never needs a translation call. title is a polite question; yes names the switch; busy shows while the page reloads.
   House style: no emoji, no exclamation marks. */
export const COPY = {
  en: { title: "Show this site in English?", yes: "Switch to English", no: "Not now", busy: "Switching", close: "Dismiss" },
  th: { title: "ต้องการแสดงเว็บไซต์นี้เป็นภาษาไทยหรือไม่", yes: "เปลี่ยนเป็นภาษาไทย", no: "ไม่ใช่ตอนนี้", busy: "กำลังเปลี่ยนภาษา", close: "ปิด" },
  "zh-Hans": { title: "要以简体中文显示本网站吗？", yes: "切换为简体中文", no: "暂不", busy: "正在切换", close: "关闭" },
  "zh-Hant": { title: "要以繁體中文顯示本網站嗎？", yes: "切換為繁體中文", no: "暫不", busy: "正在切換", close: "關閉" },
  ja: { title: "このサイトを日本語で表示しますか。", yes: "日本語に切り替える", no: "今はしない", busy: "切り替え中", close: "閉じる" },
  ko: { title: "이 사이트를 한국어로 표시할까요?", yes: "한국어로 전환", no: "나중에", busy: "전환 중", close: "닫기" },
  es: { title: "¿Quieres ver este sitio en español?", yes: "Cambiar a español", no: "Ahora no", busy: "Cambiando", close: "Cerrar" },
  hi: { title: "क्या आप इस साइट को हिन्दी में देखना चाहेंगे?", yes: "हिन्दी में बदलें", no: "अभी नहीं", busy: "भाषा बदली जा रही है", close: "बंद करें" },
  vi: { title: "Bạn có muốn xem trang này bằng tiếng Việt không?", yes: "Chuyển sang tiếng Việt", no: "Để sau", busy: "Đang chuyển", close: "Đóng" },
  fr: { title: "Afficher ce site en français ?", yes: "Passer en français", no: "Pas maintenant", busy: "Changement en cours", close: "Fermer" },
}
