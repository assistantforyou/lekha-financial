/* Quick Tour copy in every language the app ships (English + the nine in public/i18n).
   The tour is rendered by React, outside the classic engine's dictionary pipeline, so it carries its own strings.
   Navigation labels (My Portfolio, Research, Sector rotation ...) stay in English inside translated sentences because
   the shell shows them in English; the copy has to match what the user can actually see.
   Placeholders: {key} = search shortcut, {symbol} = the example company, {n} / {total} = progress. */

export const COPY = {
  en: {
    ui: { next: "Next", askpill: "Send your question to see the analyst work.", act: "Your turn: tap or click the highlighted area. The tour continues by itself.", hintSim: "Tap the highlighted button. Thousands of possible futures are computed in your browser.", hintStress: "Tap the highlighted button to apply a rate shock, a tech drawdown and a recession to the sample holdings.", hintRrg: "Drag the slider back through the weeks and watch each sector move around the graph.", hintDcf: "Change the growth or discount rate and watch the intrinsic value update.", tryit: "Try it now: type a question in the highlighted box and send it.", back: "Back", skip: "Skip Tour", finish: "Start Exploring", label: "Quick Tour", step: "Step {n} of {total}", replay: "Replay tour", replayHead: "Quick tour", replayText: "A one-minute guided walk through search, navigation, holdings and research.", explore: "Keep exploring", account: "Create a free account", palette: "Take the Quick Tour" },
    steps: {
      ask: { t: "Ask one question free", b: "The AI analyst answers from live quotes, filings, news and macro data, and cites every source. You get one question without an account — enough to see how it thinks. Create a free account to keep going." },
      answer: { t: "Read the answer", b: "Every figure is cited to the evidence behind it. Take your time, then continue." },
      welcome: { t: "Try the advanced tools", b: "A short, hands-on tour on a sample portfolio. You do the clicking and the tool responds. Skip it at any point." },
      sim: { t: "Stress a portfolio with Monte Carlo" },
      stress: { t: "Run a stress test" },
      rrg: { t: "See where money is rotating" },
      dcf: { t: "Value a company yourself" },
      finish: { t: "That is the toolkit", b: "Everything you just used runs on your own holdings once you add them. Explore freely, and replay this tour from the menu footer." },
    },
  },
  th: {
    ui: { next: "ถัดไป", askpill: "ส่งคำถามของคุณเพื่อดูการทำงานของนักวิเคราะห์", act: "ถึงตาคุณ: แตะหรือคลิกบริเวณที่ไฮไลต์ ทัวร์จะไปต่อโดยอัตโนมัติ", hintSim: "แตะปุ่มที่ไฮไลต์ ระบบจะคำนวณอนาคตที่เป็นไปได้หลายพันแบบในเบราว์เซอร์ของคุณ", hintStress: "แตะปุ่มที่ไฮไลต์เพื่อจำลองดอกเบี้ยพุ่ง หุ้นเทคร่วง และเศรษฐกิจถดถอยกับพอร์ตตัวอย่าง", hintRrg: "ลากแถบเลื่อนย้อนกลับไปตามสัปดาห์ แล้วดูแต่ละกลุ่มอุตสาหกรรมเคลื่อนที่บนกราฟ", hintDcf: "ปรับอัตราการเติบโตหรืออัตราคิดลด แล้วดูมูลค่าที่แท้จริงเปลี่ยนตาม", tryit: "ลองเลย: พิมพ์คำถามในกล่องที่ไฮไลต์แล้วกดส่ง", back: "ย้อนกลับ", skip: "ข้ามทัวร์", finish: "เริ่มสำรวจ", label: "ทัวร์แนะนำ", step: "ขั้นที่ {n} จาก {total}", replay: "เปิดทัวร์อีกครั้ง", replayHead: "ทัวร์แนะนำ", replayText: "แนะนำการใช้งานหนึ่งนาที ครอบคลุมการค้นหา การนำทาง สินทรัพย์ที่ถือ และการค้นคว้า", explore: "สำรวจต่อ", account: "สร้างบัญชีฟรี", palette: "ดูทัวร์แนะนำ" },
    steps: {
      ask: { t: "ถามฟรีหนึ่งคำถาม", b: "AI analyst ตอบจากราคาสด เอกสารที่ยื่นต่อ ก.ล.ต. ข่าว และข้อมูลมหภาค พร้อมอ้างอิงแหล่งที่มาทุกครั้ง คุณถามได้หนึ่งคำถามโดยไม่ต้องมีบัญชี เพื่อดูว่ามันคิดอย่างไร สมัครบัญชีฟรีเพื่อถามต่อ" },
      answer: { t: "อ่านคำตอบ", b: "ทุกตัวเลขอ้างอิงหลักฐานที่มา อ่านได้ตามสบาย แล้วค่อยไปต่อ" },
      welcome: { t: "ลองใช้เครื่องมือขั้นสูง", b: "ทัวร์สั้น ๆ บนพอร์ตตัวอย่าง คุณเป็นคนกดเอง แล้วเครื่องมือจะตอบสนองทันที ข้ามได้ทุกเมื่อ" },
      sim: { t: "ทดสอบพอร์ตด้วย Monte Carlo" },
      stress: { t: "รันการทดสอบภาวะวิกฤต" },
      rrg: { t: "ดูว่าเงินกำลังหมุนไปที่ไหน" },
      dcf: { t: "ประเมินมูลค่าบริษัทด้วยตัวเอง" },
      finish: { t: "นี่คือชุดเครื่องมือของเรา", b: "ทุกอย่างที่คุณเพิ่งลองใช้ทำงานกับหุ้นที่คุณถืออยู่จริงเมื่อคุณเพิ่มเข้ามา สำรวจได้ตามสบาย และเปิดทัวร์นี้ซ้ำได้จากท้ายเมนู" },
    },
  },
  "zh-Hans": {
    ui: { next: "下一步", askpill: "发送你的问题，看看分析师如何工作。", act: "轮到你了：点按高亮区域，导览会自动继续。", hintSim: "点按高亮的按钮。成千上万种可能的未来会在你的浏览器中计算出来。", hintStress: "点按高亮的按钮，对示例持仓施加加息冲击、科技股下跌和经济衰退。", hintRrg: "向前拖动滑块，逐周回看，观察各行业在图上的移动。", hintDcf: "调整增长率或贴现率，观察内在价值随之变化。", tryit: "现在试试：在高亮的输入框中输入问题并发送。", back: "上一步", skip: "跳过导览", finish: "开始探索", label: "快速导览", step: "第 {n} 步，共 {total} 步", replay: "重新播放导览", replayHead: "快速导览", replayText: "一分钟带你了解搜索、导航、持仓和研究。", explore: "继续探索", account: "创建免费账户", palette: "开始快速导览" },
    steps: {
      ask: { t: "免费提问一次", b: "AI 分析师根据实时行情、财报文件、新闻和宏观数据作答，并为每个数字标注来源。无需账户即可提问一次，先看看它如何思考。创建免费账户即可继续。" },
      answer: { t: "阅读回答", b: "每个数字都标注了对应的依据。慢慢看，准备好后再继续。" },
      welcome: { t: "试用高级工具", b: "在示例投资组合上进行的简短实操导览。你来点击，工具即时响应。随时可以跳过。" },
      sim: { t: "用蒙特卡洛压力测试组合" },
      stress: { t: "运行压力测试" },
      rrg: { t: "看看资金正在轮动到哪里" },
      dcf: { t: "自己给一家公司估值" },
      finish: { t: "这就是全部工具", b: "添加你自己的持仓后，你刚才用到的一切都会基于真实持仓运行。可以自由探索，也可以从菜单底部重新播放本导览。" },
    },
  },
  "zh-Hant": {
    ui: { next: "下一步", askpill: "送出你的問題，看看分析師如何運作。", act: "換你操作：點選標示區域，導覽會自動繼續。", hintSim: "點選標示的按鈕。數以千計的可能未來會在你的瀏覽器中計算出來。", hintStress: "點選標示的按鈕，對範例持倉施加升息衝擊、科技股下跌與經濟衰退。", hintRrg: "向前拖曳滑桿，逐週回看，觀察各產業在圖上的移動。", hintDcf: "調整成長率或折現率，觀察內在價值隨之變化。", tryit: "現在試試：在標示的輸入框中輸入問題並送出。", back: "上一步", skip: "略過導覽", finish: "開始探索", label: "快速導覽", step: "第 {n} 步，共 {total} 步", replay: "重新播放導覽", replayHead: "快速導覽", replayText: "一分鐘帶你了解搜尋、導覽、持倉和研究。", explore: "繼續探索", account: "建立免費帳戶", palette: "開始快速導覽" },
    steps: {
      ask: { t: "免費提問一次", b: "AI 分析師根據即時行情、財報文件、新聞與宏觀資料作答，並為每個數字標註來源。無需帳戶即可提問一次，先看看它如何思考。建立免費帳戶即可繼續。" },
      answer: { t: "閱讀回答", b: "每個數字都標註了對應的依據。慢慢看，準備好再繼續。" },
      welcome: { t: "試用進階工具", b: "在範例投資組合上進行的簡短實作導覽。你來點選，工具即時回應。隨時可以略過。" },
      sim: { t: "用蒙地卡羅壓力測試組合" },
      stress: { t: "執行壓力測試" },
      rrg: { t: "看看資金正在輪動到哪裡" },
      dcf: { t: "自己為一家公司估值" },
      finish: { t: "這就是全部工具", b: "加入你自己的持倉後，你剛才用到的一切都會依真實持倉運算。可以自由探索，也可以從選單底部重新播放本導覽。" },
    },
  },
  ja: {
    ui: { next: "次へ", askpill: "質問を送信して、アナリストの動きを確認しましょう。", act: "操作してみましょう。ハイライトされた部分をタップまたはクリックすると、ツアーが自動で進みます。", hintSim: "ハイライトされたボタンをタップしてください。数千通りの将来がブラウザ内で計算されます。", hintStress: "ハイライトされたボタンをタップすると、金利ショック、テック株の下落、景気後退をサンプル保有に適用します。", hintRrg: "スライダーを過去へドラッグし、各セクターがグラフ上で動く様子を見てください。", hintDcf: "成長率または割引率を変えて、本源的価値が更新される様子を見てください。", tryit: "ここで試せます。ハイライトされた入力欄に質問を入力して送信してください。", back: "戻る", skip: "ツアーをスキップ", finish: "使い始める", label: "クイックツアー", step: "ステップ {n} / {total}", replay: "ツアーを再生", replayHead: "クイックツアー", replayText: "検索、ナビゲーション、保有銘柄、調査を1分で案内します。", explore: "そのまま使ってみる", account: "無料アカウントを作成", palette: "クイックツアーを見る" },
    steps: {
      ask: { t: "質問は1回無料", b: "AI アナリストはリアルタイムの株価、提出書類、ニュース、マクロデータをもとに回答し、すべての数字に出典を示します。アカウントなしで1回質問できるので、考え方を見てみてください。無料アカウントを作成すれば続けられます。" },
      answer: { t: "回答を読む", b: "すべての数字に根拠が示されています。ゆっくり読んでから先に進んでください。" },
      welcome: { t: "高度なツールを試す", b: "サンプルポートフォリオで行う短い体験ツアーです。操作はあなたが行い、ツールが即座に応えます。いつでもスキップできます。" },
      sim: { t: "モンテカルロでポートフォリオを検証" },
      stress: { t: "ストレステストを実行" },
      rrg: { t: "資金の流れを見る" },
      dcf: { t: "企業価値を自分で算出する" },
      finish: { t: "これがツールの全体像です", b: "持ち銘柄を追加すると、今使った機能がすべてあなた自身の保有で動きます。自由にお試しください。このツアーはメニュー下部からいつでも再生できます。" },
    },
  },
  ko: {
    ui: { next: "다음", askpill: "질문을 보내 분석가가 일하는 모습을 확인하세요.", act: "직접 해 보세요. 강조된 영역을 누르거나 클릭하면 투어가 자동으로 이어집니다.", hintSim: "강조된 버튼을 누르세요. 수천 가지 가능한 미래가 브라우저에서 계산됩니다.", hintStress: "강조된 버튼을 눌러 금리 충격, 기술주 하락, 경기 침체를 샘플 보유 종목에 적용해 보세요.", hintRrg: "슬라이더를 과거로 끌어 주 단위로 되돌려 보며 각 섹터가 그래프에서 움직이는 모습을 확인하세요.", hintDcf: "성장률이나 할인율을 바꿔 보세요. 내재가치가 바로 갱신됩니다.", tryit: "지금 해 보세요. 강조된 입력창에 질문을 입력하고 전송하세요.", back: "이전", skip: "둘러보기 건너뛰기", finish: "시작하기", label: "빠른 둘러보기", step: "{total}단계 중 {n}단계", replay: "둘러보기 다시 보기", replayHead: "빠른 둘러보기", replayText: "검색, 탐색, 보유 종목, 조사를 1분 만에 안내합니다.", explore: "계속 둘러보기", account: "무료 계정 만들기", palette: "빠른 둘러보기 시작" },
    steps: {
      ask: { t: "질문 한 번 무료", b: "AI 애널리스트는 실시간 시세, 공시 자료, 뉴스, 거시 데이터를 근거로 답하고 모든 수치에 출처를 표시합니다. 계정 없이 한 번 질문해 사고 방식을 확인해 보세요. 무료 계정을 만들면 계속할 수 있습니다." },
      answer: { t: "답변 읽기", b: "모든 수치에 근거가 표시됩니다. 천천히 읽고 계속하세요." },
      welcome: { t: "고급 도구 체험", b: "샘플 포트폴리오로 진행하는 짧은 체험형 투어입니다. 직접 누르면 도구가 바로 반응합니다. 언제든 건너뛸 수 있습니다." },
      sim: { t: "몬테카를로로 포트폴리오 점검" },
      stress: { t: "스트레스 테스트 실행" },
      rrg: { t: "자금이 어디로 이동하는지 보기" },
      dcf: { t: "직접 기업 가치 평가하기" },
      finish: { t: "도구 소개는 여기까지입니다", b: "보유 종목을 추가하면 방금 써 본 모든 기능이 실제 보유 자산 기준으로 작동합니다. 자유롭게 둘러보세요. 이 투어는 메뉴 하단에서 다시 볼 수 있습니다." },
    },
  },
  es: {
    ui: { next: "Siguiente", askpill: "Envía tu pregunta para ver trabajar al analista.", act: "Tu turno: toca o haz clic en la zona resaltada. El recorrido continúa solo.", hintSim: "Toca el botón resaltado. Miles de futuros posibles se calculan en tu navegador.", hintStress: "Toca el botón resaltado para aplicar un shock de tipos, una caída tecnológica y una recesión a las posiciones de muestra.", hintRrg: "Arrastra el control hacia atrás por las semanas y observa cómo se mueve cada sector en el gráfico.", hintDcf: "Cambia el crecimiento o la tasa de descuento y observa cómo se actualiza el valor intrínseco.", tryit: "Pruébalo ahora: escribe una pregunta en el cuadro resaltado y envíala.", back: "Atrás", skip: "Omitir recorrido", finish: "Empezar a explorar", label: "Recorrido rápido", step: "Paso {n} de {total}", replay: "Repetir recorrido", replayHead: "Recorrido rápido", replayText: "Un paseo guiado de un minuto por la búsqueda, la navegación, las posiciones y la investigación.", explore: "Seguir explorando", account: "Crear una cuenta gratuita", palette: "Hacer el recorrido rápido" },
    steps: {
      ask: { t: "Una pregunta gratis", b: "El analista de IA responde con cotizaciones en vivo, informes presentados, noticias y datos macro, y cita cada fuente. Tienes una pregunta sin cuenta, suficiente para ver cómo razona. Crea una cuenta gratis para seguir." },
      answer: { t: "Lee la respuesta", b: "Cada cifra cita la evidencia que la respalda. Tómate tu tiempo y continúa." },
      welcome: { t: "Prueba las herramientas avanzadas", b: "Un recorrido breve y práctico con una cartera de muestra. Tú haces clic y la herramienta responde. Puedes omitirlo en cualquier momento." },
      sim: { t: "Somete una cartera a Monte Carlo" },
      stress: { t: "Ejecuta una prueba de estrés" },
      rrg: { t: "Mira hacia dónde rota el dinero" },
      dcf: { t: "Valora una empresa tú mismo" },
      finish: { t: "Esa es la caja de herramientas", b: "Todo lo que acabas de usar funciona con tus propias posiciones cuando las añades. Explora con libertad y repite este recorrido desde el pie del menú." },
    },
  },
  hi: {
    ui: { next: "आगे", askpill: "अपना सवाल भेजें और विश्लेषक को काम करते देखें।", act: "आपकी बारी: हाइलाइट किए गए हिस्से पर टैप या क्लिक करें। टूर अपने आप आगे बढ़ेगा।", hintSim: "हाइलाइट किए गए बटन पर टैप करें। हज़ारों संभावित भविष्य आपके ब्राउज़र में ही गणना किए जाते हैं।", hintStress: "हाइलाइट किए गए बटन पर टैप करें, ताकि नमूना होल्डिंग पर ब्याज दर झटका, टेक गिरावट और मंदी लागू हो।", hintRrg: "स्लाइडर को हफ़्तों में पीछे खींचें और देखें कि हर सेक्टर ग्राफ़ पर कैसे चलता है।", hintDcf: "वृद्धि दर या डिस्काउंट दर बदलें और देखें कि आंतरिक मूल्य कैसे बदलता है।", tryit: "अभी आज़माएँ: हाइलाइट किए गए बॉक्स में सवाल लिखें और भेजें।", back: "पीछे", skip: "टूर छोड़ें", finish: "खोजना शुरू करें", label: "क्विक टूर", step: "चरण {n} / {total}", replay: "टूर दोबारा चलाएँ", replayHead: "क्विक टूर", replayText: "खोज, नेविगेशन, होल्डिंग्स और शोध का एक मिनट का मार्गदर्शन।", explore: "आगे देखते रहें", account: "मुफ़्त खाता बनाएँ", palette: "क्विक टूर देखें" },
    steps: {
      ask: { t: "एक सवाल मुफ़्त", b: "AI विश्लेषक लाइव भाव, दाखिल दस्तावेज़, समाचार और मैक्रो डेटा से जवाब देता है और हर आंकड़े का स्रोत बताता है। बिना खाते के आपको एक सवाल मिलता है, जिससे आप देख सकते हैं कि यह कैसे सोचता है। आगे पूछने के लिए मुफ़्त खाता बनाएँ।" },
      answer: { t: "जवाब पढ़ें", b: "हर आँकड़े के साथ उसका प्रमाण दिया गया है। आराम से पढ़ें, फिर आगे बढ़ें।" },
      welcome: { t: "उन्नत टूल आज़माएँ", b: "नमूना पोर्टफ़ोलियो पर एक छोटा, खुद करके देखने वाला टूर। क्लिक आप करते हैं, टूल तुरंत जवाब देता है। कभी भी छोड़ सकते हैं।" },
      sim: { t: "मोंटे कार्लो से पोर्टफ़ोलियो परखें" },
      stress: { t: "स्ट्रेस टेस्ट चलाएँ" },
      rrg: { t: "देखें पैसा किधर घूम रहा है" },
      dcf: { t: "खुद किसी कंपनी का मूल्यांकन करें" },
      finish: { t: "यही है पूरा टूलकिट", b: "आपने अभी जो इस्तेमाल किया, वह सब आपकी अपनी होल्डिंग जोड़ने पर उन्हीं पर चलता है। बेझिझक देखें, और यह टूर मेनू के नीचे से दोबारा चला सकते हैं।" },
    },
  },
  vi: {
    ui: { next: "Tiếp", askpill: "Gửi câu hỏi để xem chuyên gia phân tích làm việc.", act: "Đến lượt bạn: chạm hoặc nhấp vào vùng được đánh dấu. Phần giới thiệu sẽ tự chuyển tiếp.", hintSim: "Chạm vào nút được đánh dấu. Hàng nghìn kịch bản tương lai được tính ngay trong trình duyệt của bạn.", hintStress: "Chạm vào nút được đánh dấu để áp dụng cú sốc lãi suất, đợt giảm của cổ phiếu công nghệ và suy thoái lên danh mục mẫu.", hintRrg: "Kéo thanh trượt lùi qua các tuần và xem từng nhóm ngành di chuyển trên biểu đồ.", hintDcf: "Đổi tốc độ tăng trưởng hoặc tỷ lệ chiết khấu và xem giá trị nội tại cập nhật.", tryit: "Hãy thử ngay: nhập câu hỏi vào khung được đánh dấu rồi gửi.", back: "Quay lại", skip: "Bỏ qua", finish: "Bắt đầu khám phá", label: "Giới thiệu nhanh", step: "Bước {n} trên {total}", replay: "Xem lại phần giới thiệu", replayHead: "Giới thiệu nhanh", replayText: "Hướng dẫn một phút về tìm kiếm, điều hướng, vị thế và nghiên cứu.", explore: "Tiếp tục khám phá", account: "Tạo tài khoản miễn phí", palette: "Xem giới thiệu nhanh" },
    steps: {
      ask: { t: "Một câu hỏi miễn phí", b: "Chuyên gia AI trả lời từ giá trực tiếp, hồ sơ nộp cơ quan quản lý, tin tức và dữ liệu vĩ mô, và trích dẫn mọi nguồn. Bạn có một câu hỏi mà không cần tài khoản, đủ để thấy nó lập luận thế nào. Tạo tài khoản miễn phí để tiếp tục." },
      answer: { t: "Đọc câu trả lời", b: "Mỗi con số đều trích dẫn bằng chứng đứng sau. Cứ đọc thong thả rồi tiếp tục." },
      welcome: { t: "Dùng thử công cụ nâng cao", b: "Một chuyến tham quan ngắn, thao tác trực tiếp trên danh mục mẫu. Bạn bấm, công cụ phản hồi ngay. Có thể bỏ qua bất cứ lúc nào." },
      sim: { t: "Kiểm tra danh mục bằng Monte Carlo" },
      stress: { t: "Chạy kiểm tra sức chịu đựng" },
      rrg: { t: "Xem dòng tiền đang xoay vòng đi đâu" },
      dcf: { t: "Tự định giá một công ty" },
      finish: { t: "Đó là bộ công cụ", b: "Mọi thứ bạn vừa dùng sẽ chạy trên chính các khoản nắm giữ của bạn khi bạn thêm vào. Cứ khám phá thoải mái, và xem lại phần giới thiệu này từ cuối menu." },
    },
  },
  fr: {
    ui: { next: "Suivant", askpill: "Envoyez votre question pour voir l'analyste à l'œuvre.", act: "À vous : touchez ou cliquez la zone en surbrillance. La visite continue toute seule.", hintSim: "Touchez le bouton en surbrillance. Des milliers d'avenirs possibles sont calculés dans votre navigateur.", hintStress: "Touchez le bouton en surbrillance pour appliquer un choc de taux, une chute de la tech et une récession aux positions d'exemple.", hintRrg: "Faites glisser le curseur vers le passé, semaine après semaine, et regardez chaque secteur bouger sur le graphique.", hintDcf: "Modifiez la croissance ou le taux d'actualisation et regardez la valeur intrinsèque se mettre à jour.", tryit: "Essayez maintenant : saisissez une question dans la zone en surbrillance et envoyez-la.", back: "Retour", skip: "Passer la visite", finish: "Commencer à explorer", label: "Visite rapide", step: "Étape {n} sur {total}", replay: "Rejouer la visite", replayHead: "Visite rapide", replayText: "Un parcours guidé d'une minute : recherche, navigation, positions et analyse.", explore: "Continuer à explorer", account: "Créer un compte gratuit", palette: "Faire la visite rapide" },
    steps: {
      ask: { t: "Une question offerte", b: "L'analyste IA répond à partir des cours en direct, des documents déposés, de l'actualité et des données macro, en citant chaque source. Vous avez une question sans compte, de quoi voir comment il raisonne. Créez un compte gratuit pour continuer." },
      answer: { t: "Lisez la réponse", b: "Chaque chiffre cite les éléments qui le fondent. Prenez votre temps, puis continuez." },
      welcome: { t: "Essayez les outils avancés", b: "Une courte visite pratique sur un portefeuille d'exemple. Vous cliquez, l'outil répond. Vous pouvez la passer à tout moment." },
      sim: { t: "Éprouvez un portefeuille avec Monte Carlo" },
      stress: { t: "Lancez un test de résistance" },
      rrg: { t: "Voyez où l'argent se déplace" },
      dcf: { t: "Évaluez vous-même une entreprise" },
      finish: { t: "Voilà la boîte à outils", b: "Tout ce que vous venez d'utiliser fonctionne sur vos propres positions une fois ajoutées. Explorez librement, et rejouez cette visite depuis le bas du menu." },
    },
  },
}

/* The tour has its own language switch (instant, no reload); it starts in the app's language. */
const LKEY = "ptpub.v1.app.tourlang"
export const tourLang = () => {
  try { const o = localStorage.getItem(LKEY); if (o && COPY[o]) return o } catch (e) {}
  try { const l = window.PT_I18N && window.PT_I18N.lang; return COPY[l] ? l : "en" } catch (e) { return "en" }
}
export const setTourLang = (c) => { if (COPY[c]) { try { localStorage.setItem(LKEY, c) } catch (e) {} window.dispatchEvent(new Event("lekha:tourlang")) } }
const fill = (s, v) => (s && v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : s)
/* ui string, with English as the fallback for anything a language lacks */
export const ui = (k, v) => fill((COPY[tourLang()].ui[k]) || COPY.en.ui[k], v)
export const stepCopy = (id, v) => {
  const c = COPY[tourLang()].steps[id] || COPY.en.steps[id], e = COPY.en.steps[id]
  const pts = (PTS[tourLang()] && PTS[tourLang()][id]) || (PTS.en && PTS.en[id]) || null
  return { t: c.t || e.t, b: fill(c.b || e.b, v), a: c.a ? fill(c.a, v) : e.a ? fill(e.a, v) : null, wf: c.wf || e.wf, pts }
}

/* Step bullets for the three portfolio steps: [term as it appears on screen, plain-language meaning]. Shown on desktop where there is room. */
export const PTS = {
  en: {
    summary: [["Today", "Change since the last close."], ["Unrealized P&L", "Gain or loss on what you still hold, against what you paid."], ["From 1Y peak", "How far the portfolio sits below its best level of the past year."]],
    performance: [["vs S&P 500 & Nasdaq", "Your return plotted against two market benchmarks."], ["Value", "Switches the chart to your portfolio's value over time."], ["1M · 3M · 6M · YTD · 1Y", "The window the chart covers."]],
    holdings: [["Weight", "Each position's share of the whole portfolio."], ["P&L %", "Return on what you paid, from your average cost."], ["Column headings", "Click one to sort the table by it."]],
  },
  th: {
    summary: [["วันนี้", "การเปลี่ยนแปลงนับจากราคาปิดล่าสุด"], ["กำไร/ขาดทุนที่ยังไม่รับรู้", "กำไรหรือขาดทุนของสิ่งที่ยังถืออยู่ เทียบกับต้นทุนที่จ่ายไป"], ["From 1Y peak", "พอร์ตอยู่ต่ำกว่าจุดสูงสุดในรอบปีมากแค่ไหน"]],
    performance: [["vs S&P 500 & Nasdaq", "ผลตอบแทนของคุณเทียบกับดัชนีตลาดสองตัว"], ["มูลค่า", "สลับกราฟไปแสดงมูลค่าพอร์ตตามเวลา"], ["1M · 3M · 6M · YTD · 1Y", "ช่วงเวลาที่กราฟครอบคลุม"]],
    holdings: [["น้ำหนัก", "สัดส่วนของแต่ละสถานะในพอร์ตทั้งหมด"], ["P&L %", "ผลตอบแทนเทียบกับต้นทุนเฉลี่ยที่จ่ายไป"], ["หัวคอลัมน์", "คลิกเพื่อเรียงตารางตามคอลัมน์นั้น"]],
  },
  "zh-Hans": {
    summary: [["今日", "自上次收盘以来的变动。"], ["未实现盈亏", "仍持有部分相对买入成本的盈亏。"], ["From 1Y peak", "投资组合低于过去一年最高点的幅度。"]],
    performance: [["vs S&P 500 & Nasdaq", "你的收益与两大市场基准的对比。"], ["价值", "将图表切换为投资组合价值走势。"], ["1M · 3M · 6M · YTD · 1Y", "图表覆盖的时间区间。"]],
    holdings: [["权重", "每个持仓占整个投资组合的比例。"], ["P&L %", "相对平均成本的收益率。"], ["列标题", "点击即可按该列排序。"]],
  },
  "zh-Hant": {
    summary: [["今日", "自上次收盤以來的變動。"], ["未實現損益", "仍持有部分相對買入成本的損益。"], ["From 1Y peak", "投資組合低於過去一年最高點的幅度。"]],
    performance: [["vs S&P 500 & Nasdaq", "你的報酬與兩大市場基準的比較。"], ["價值", "將圖表切換為投資組合價值走勢。"], ["1M · 3M · 6M · YTD · 1Y", "圖表涵蓋的時間區間。"]],
    holdings: [["權重", "每個持倉占整個投資組合的比例。"], ["P&L %", "相對平均成本的報酬率。"], ["欄位標題", "點擊即可依該欄排序。"]],
  },
  ja: {
    summary: [["本日", "前回の終値からの変動。"], ["含み損益", "保有中の銘柄の、取得額に対する損益。"], ["From 1Y peak", "過去1年の最高値からどれだけ下にあるか。"]],
    performance: [["vs S&P 500 & Nasdaq", "2つの市場指数と比べた収益率。"], ["評価額", "チャートを評価額の推移に切り替えます。"], ["1M · 3M · 6M · YTD · 1Y", "チャートが表示する期間。"]],
    holdings: [["比率", "ポートフォリオ全体に占める各銘柄の割合。"], ["P&L %", "平均取得単価に対する収益率。"], ["列見出し", "クリックするとその列で並べ替えます。"]],
  },
  ko: {
    summary: [["오늘", "직전 종가 이후의 변동."], ["미실현 손익", "보유 중인 종목의 매입 금액 대비 손익."], ["From 1Y peak", "최근 1년 최고점보다 얼마나 낮은지."]],
    performance: [["vs S&P 500 & Nasdaq", "두 시장 지수와 비교한 내 수익률."], ["평가액", "차트를 포트폴리오 평가액 추이로 전환합니다."], ["1M · 3M · 6M · YTD · 1Y", "차트가 보여 주는 기간."]],
    holdings: [["비중", "전체 포트폴리오에서 각 포지션이 차지하는 비율."], ["P&L %", "평균 매입 단가 대비 수익률."], ["열 제목", "클릭하면 해당 열 기준으로 정렬됩니다."]],
  },
  es: {
    summary: [["Hoy", "Variación desde el último cierre."], ["G/P no realizadas", "Ganancia o pérdida de lo que aún tienes, frente a lo que pagaste."], ["From 1Y peak", "Cuánto está la cartera por debajo de su mejor nivel del último año."]],
    performance: [["vs S&P 500 & Nasdaq", "Tu rentabilidad frente a dos referencias del mercado."], ["Valor", "Cambia el gráfico al valor de tu cartera en el tiempo."], ["1M · 3M · 6M · YTD · 1Y", "El periodo que cubre el gráfico."]],
    holdings: [["Peso", "La parte de la cartera que representa cada posición."], ["P&L %", "Rentabilidad sobre lo que pagaste, según tu coste medio."], ["Encabezados de columna", "Haz clic en uno para ordenar la tabla por él."]],
  },
  hi: {
    summary: [["आज", "पिछले क्लोज़ के बाद का बदलाव।"], ["अवास्तविक लाभ/हानि", "जो आप अभी भी रखते हैं, उस पर खरीद लागत के मुकाबले लाभ या हानि।"], ["From 1Y peak", "पोर्टफोलियो पिछले साल के सर्वोच्च स्तर से कितना नीचे है।"]],
    performance: [["vs S&P 500 & Nasdaq", "दो बाज़ार बेंचमार्क के मुकाबले आपका रिटर्न।"], ["मूल्य", "चार्ट को समय के साथ पोर्टफोलियो मूल्य पर ले जाता है।"], ["1M · 3M · 6M · YTD · 1Y", "चार्ट जितनी अवधि दिखाता है।"]],
    holdings: [["भार", "पूरे पोर्टफोलियो में हर पोज़िशन का हिस्सा।"], ["P&L %", "औसत लागत के मुकाबले रिटर्न।"], ["कॉलम शीर्षक", "उस कॉलम से तालिका क्रमबद्ध करने के लिए क्लिक करें।"]],
  },
  vi: {
    summary: [["Hôm nay", "Biến động kể từ lần đóng cửa gần nhất."], ["Lãi/lỗ chưa thực hiện", "Lãi hoặc lỗ của phần bạn còn nắm giữ so với giá bạn đã trả."], ["From 1Y peak", "Danh mục đang thấp hơn mức cao nhất trong năm qua bao nhiêu."]],
    performance: [["vs S&P 500 & Nasdaq", "Lợi suất của bạn so với hai chỉ số tham chiếu của thị trường."], ["Giá trị", "Chuyển biểu đồ sang giá trị danh mục theo thời gian."], ["1M · 3M · 6M · YTD · 1Y", "Khoảng thời gian mà biểu đồ bao phủ."]],
    holdings: [["Tỷ trọng", "Phần mà mỗi vị thế chiếm trong toàn danh mục."], ["P&L %", "Lợi suất so với giá vốn trung bình."], ["Tiêu đề cột", "Nhấp để sắp xếp bảng theo cột đó."]],
  },
  fr: {
    summary: [["Aujourd’hui", "Variation depuis la dernière clôture."], ["Plus/moins-values latentes", "Gain ou perte sur ce que vous détenez encore, par rapport à ce que vous avez payé."], ["From 1Y peak", "De combien le portefeuille est sous son meilleur niveau de l'année."]],
    performance: [["vs S&P 500 & Nasdaq", "Votre rendement face à deux indices de référence."], ["Valeur", "Bascule le graphique sur la valeur de votre portefeuille dans le temps."], ["1M · 3M · 6M · YTD · 1Y", "La période couverte par le graphique."]],
    holdings: [["Poids", "La part de chaque position dans l'ensemble du portefeuille."], ["P&L %", "Rendement par rapport à votre coût moyen."], ["En-têtes de colonne", "Cliquez sur l'un d'eux pour trier le tableau."]],
  },
}
export const LANG_LABEL = { en: "Tour language", th: "ภาษาของทัวร์", "zh-Hans": "导览语言", "zh-Hant": "導覽語言", ja: "ツアーの言語", ko: "둘러보기 언어", es: "Idioma del recorrido", hi: "टूर की भाषा", vi: "Ngôn ngữ giới thiệu", fr: "Langue de la visite" }
export const LANG_NATIVE = { en: "English", th: "ไทย", "zh-Hans": "简体中文", "zh-Hant": "繁體中文", ja: "日本語", ko: "한국어", es: "Español", hi: "हिन्दी", vi: "Tiếng Việt", fr: "Français" }
