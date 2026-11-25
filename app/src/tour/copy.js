/* Quick Tour copy in every language the app ships (English + the nine in public/i18n).
   The tour is rendered by React, outside the classic engine's dictionary pipeline, so it carries its own strings.
   Navigation labels (My Portfolio, Research, Sector rotation ...) stay in English inside translated sentences because
   the shell shows them in English; the copy has to match what the user can actually see.
   Placeholders: {key} = search shortcut, {symbol} = the example company, {n} / {total} = progress. */

export const COPY = {
  en: {
    ui: {"next": "Next", "askpill": "Send your question to see the analyst work.", "act": "The highlighted area is live: try it, or press Next.", "hintSim": "Tap Run simulation. The tool computes 10,000 possible futures for the sample portfolio in your browser.", "hintStress": "Tap Run simulation to apply a rate shock, a tech drawdown and a recession to the sample holdings.", "hintDcf": "A DCF estimates what a business is worth from the cash it should earn. Tap Bear, Base or Bull and watch the value per share change.", "tryit": "Try it now: type a question in the highlighted box and send it.", "back": "Back", "skip": "Skip Tour", "finish": "Start Exploring", "label": "Quick Tour", "step": "Step {n} of {total}", "replay": "Replay tour", "replayHead": "Quick tour", "replayText": "A one-minute guided walk through search, navigation, holdings and research.", "explore": "Keep exploring", "account": "Create a free account", "palette": "Take the Quick Tour", "hintTried": "That is the model recalculating. Press Next when you are ready.", "ctaNote": "Free plan. Add your own holdings and keep them in your account.", "haveAccount": "I already have an account", "hintSimDone": "Done. The fan chart shows the range of outcomes; the figures show the odds of a loss and the value at risk.", "hintStressDone": "Each row is a market fall applied to the sample holdings, with the estimated effect on the portfolio.", "premium": "See Premium"},
    steps: {
      welcome: {"t": "A one-minute look around", "b": "A short walk through search, the menu, your portfolio and two advanced tools, using a simulated sample portfolio. No sign-up needed. Every figure in the app shows its source and date. Skip at any point."},
      search: {"t": "Start with search", "b": "Find any company, ETF, index or crypto by name or ticker, plus filings, news and pages. Press {key} from anywhere.", "a": "The magnifier is search. Find any company, ETF, index or crypto, plus filings, news and pages."},
      nav: {"t": "Find your way around", "b": "The menu has My Portfolio, Research, Simulation, Macro & markets, Deep analysis and Sector rotation. Open a group to see its pages.", "a": "The menu button opens the sections: My Portfolio, Research, Simulation, Macro & markets, Deep analysis and Sector rotation."},
      summary: {"t": "How is my portfolio doing?", "b": "Total value, today's move, unrealized profit or loss and the distance from your 1-year peak, in one row."},
      sim: {"t": "Stress a portfolio with Monte Carlo"},
      stress: {"t": "Run a stress test"},
      dcf: {"t": "What is a company worth?"},
      ask: {"t": "Ask one question free", "b": "The AI analyst answers from live quotes, filings, news and macro data, and cites every source. You get one question without an account — enough to see how it thinks. Create a free account to keep going."},
      answer: {"t": "Read the answer", "b": "Every figure is cited to the evidence behind it. Take your time, then continue."},
      finish: {"t": "That is the tour", "b": "You have seen search, the menu, a Monte Carlo run, a stress test and the valuation model. Add your own holdings and the same tools run on them. Replay this tour any time from the menu footer."},
    },
  },
  th: {
    ui: {"next": "ถัดไป", "askpill": "ส่งคำถามของคุณเพื่อดูการทำงานของนักวิเคราะห์", "act": "บริเวณที่ไฮไลต์ใช้งานได้จริง ลองใช้ หรือกดถัดไป", "hintSim": "แตะ Run simulation ระบบจะคำนวณอนาคตที่เป็นไปได้ 10,000 แบบสำหรับพอร์ตตัวอย่างในเบราว์เซอร์ของคุณ", "hintStress": "แตะ Run simulation เพื่อจำลองดอกเบี้ยพุ่ง หุ้นเทคร่วง และเศรษฐกิจถดถอยกับพอร์ตตัวอย่าง", "hintDcf": "DCF ประเมินมูลค่าของธุรกิจจากเงินสดที่คาดว่าจะหาได้ แตะ Bear, Base หรือ Bull แล้วดูมูลค่าต่อหุ้นเปลี่ยนไป", "tryit": "ลองเลย: พิมพ์คำถามในกล่องที่ไฮไลต์แล้วกดส่ง", "back": "ย้อนกลับ", "skip": "ข้ามทัวร์", "finish": "เริ่มสำรวจ", "label": "ทัวร์แนะนำ", "step": "ขั้นที่ {n} จาก {total}", "replay": "เปิดทัวร์อีกครั้ง", "replayHead": "ทัวร์แนะนำ", "replayText": "แนะนำการใช้งานหนึ่งนาที ครอบคลุมการค้นหา การนำทาง สินทรัพย์ที่ถือ และการค้นคว้า", "explore": "สำรวจต่อ", "account": "สร้างบัญชีฟรี", "palette": "ดูทัวร์แนะนำ", "hintTried": "นี่คือโมเดลที่คำนวณใหม่ กดถัดไปเมื่อพร้อม", "ctaNote": "แผนฟรี เพิ่มหุ้นที่คุณถือและเก็บไว้ในบัญชีของคุณ", "haveAccount": "ฉันมีบัญชีอยู่แล้ว", "hintSimDone": "เสร็จแล้ว กราฟพัดแสดงช่วงของผลลัพธ์ และตัวเลขแสดงโอกาสขาดทุนและมูลค่าความเสี่ยง", "hintStressDone": "แต่ละแถวคือการที่ตลาดตกลงกับพอร์ตตัวอย่าง พร้อมผลกระทบโดยประมาณต่อพอร์ต", "premium": "ดูแผน Premium"},
    steps: {
      welcome: {"t": "ดูรอบ ๆ ภายในหนึ่งนาที", "b": "ทัวร์สั้น ๆ ผ่านการค้นหา เมนู พอร์ตของคุณ และเครื่องมือขั้นสูงสองอย่าง บนพอร์ตตัวอย่างจำลอง ไม่ต้องสมัครสมาชิก ทุกตัวเลขในแอปแสดงแหล่งที่มาและวันที่ ข้ามได้ทุกเมื่อ"},
      search: {"t": "เริ่มต้นด้วยการค้นหา", "b": "ค้นหาบริษัท ETF ดัชนี หรือคริปโตด้วยชื่อหรือสัญลักษณ์ รวมถึงเอกสารที่ยื่น ข่าว และหน้าต่าง ๆ กด {key} ได้จากทุกหน้า", "a": "ไอคอนแว่นขยายคือการค้นหา ค้นหาบริษัท ETF ดัชนี หรือคริปโตได้ทุกตัว รวมถึงเอกสารที่ยื่น ข่าว และหน้าต่าง ๆ"},
      nav: {"t": "ดูว่าอะไรอยู่ตรงไหน", "b": "เมนูแบ่งเป็น My Portfolio, Research, Simulation, Macro & markets, Deep analysis และ Sector rotation เปิดกลุ่มเพื่อดูหน้าที่อยู่ข้างใน", "a": "ปุ่มเมนูเปิดหมวดต่าง ๆ ได้แก่ My Portfolio, Research, Simulation, Macro & markets, Deep analysis และ Sector rotation"},
      summary: {"t": "พอร์ตของฉันเป็นอย่างไรบ้าง", "b": "มูลค่ารวม ความเคลื่อนไหววันนี้ กำไรหรือขาดทุนที่ยังไม่รับรู้ และระยะห่างจากจุดสูงสุดในรอบ 1 ปี ในแถวเดียว"},
      sim: {"t": "ทดสอบพอร์ตด้วย Monte Carlo"},
      stress: {"t": "รันการทดสอบภาวะวิกฤต"},
      dcf: {"t": "บริษัทมีมูลค่าเท่าไร"},
      ask: {"t": "ถามฟรีหนึ่งคำถาม", "b": "AI analyst ตอบจากราคาสด เอกสารที่ยื่นต่อ ก.ล.ต. ข่าว และข้อมูลมหภาค พร้อมอ้างอิงแหล่งที่มาทุกครั้ง คุณถามได้หนึ่งคำถามโดยไม่ต้องมีบัญชี เพื่อดูว่ามันคิดอย่างไร สมัครบัญชีฟรีเพื่อถามต่อ"},
      answer: {"t": "อ่านคำตอบ", "b": "ทุกตัวเลขอ้างอิงหลักฐานที่มา อ่านได้ตามสบาย แล้วค่อยไปต่อ"},
      finish: {"t": "จบทัวร์แล้ว", "b": "คุณได้เห็นการค้นหา เมนู การจำลอง Monte Carlo การทดสอบภาวะวิกฤต และโมเดลประเมินมูลค่าแล้ว เพิ่มหุ้นที่คุณถือ แล้วเครื่องมือเดียวกันจะทำงานกับพอร์ตของคุณ เปิดทัวร์ซ้ำได้จากท้ายเมนูทุกเมื่อ"},
    },
  },
  "zh-Hans": {
    ui: {"next": "下一步", "askpill": "发送你的问题，看看分析师如何工作。", "act": "高亮区域可直接操作：试一试，或点按下一步。", "hintSim": "点按 Run simulation。工具会在你的浏览器中为示例组合计算 10,000 种可能的未来。", "hintStress": "点按 Run simulation，对示例持仓施加加息冲击、科技股下跌和经济衰退。", "hintDcf": "DCF 根据企业预计赚取的现金来估算其价值。点按 Bear、Base 或 Bull，观察每股价值的变化。", "tryit": "现在试试：在高亮的输入框中输入问题并发送。", "back": "上一步", "skip": "跳过导览", "finish": "开始探索", "label": "快速导览", "step": "第 {n} 步，共 {total} 步", "replay": "重新播放导览", "replayHead": "快速导览", "replayText": "一分钟带你了解搜索、导航、持仓和研究。", "explore": "继续探索", "account": "创建免费账户", "palette": "开始快速导览", "hintTried": "这就是模型在重新计算。准备好后点按下一步。", "ctaNote": "免费方案。添加你自己的持仓，并保存在你的账户中。", "haveAccount": "我已有账户", "hintSimDone": "完成。扇形图显示结果的范围，数字显示亏损概率和在险价值。", "hintStressDone": "每一行是对示例持仓施加的一次市场下跌，并给出对组合的估计影响。", "premium": "了解 Premium"},
    steps: {
      welcome: {"t": "一分钟快速了解", "b": "用模拟的示例投资组合，快速浏览搜索、菜单、你的投资组合和两个高级工具。无需注册。应用中的每个数字都标明来源和日期。随时可以跳过。"},
      search: {"t": "从搜索开始", "b": "按名称或代码查找任何公司、ETF、指数或加密资产，也可搜索文件、新闻和页面。随时按 {key}。", "a": "放大镜图标就是搜索。可查找任何公司、ETF、指数或加密资产，以及文件、新闻和页面。"},
      nav: {"t": "找到你要的功能", "b": "菜单分为 My Portfolio、Research、Simulation、Macro & markets、Deep analysis 和 Sector rotation。展开分组即可看到其中的页面。", "a": "菜单按钮会展开各个板块：My Portfolio、Research、Simulation、Macro & markets、Deep analysis 和 Sector rotation。"},
      summary: {"t": "我的投资组合表现如何？", "b": "总价值、今日涨跌、未实现盈亏，以及距离一年高点的幅度，一行尽览。"},
      sim: {"t": "用蒙特卡洛压力测试组合"},
      stress: {"t": "运行压力测试"},
      dcf: {"t": "一家公司值多少钱？"},
      ask: {"t": "免费提问一次", "b": "AI 分析师根据实时行情、财报文件、新闻和宏观数据作答，并为每个数字标注来源。无需账户即可提问一次，先看看它如何思考。创建免费账户即可继续。"},
      answer: {"t": "阅读回答", "b": "每个数字都标注了对应的依据。慢慢看，准备好后再继续。"},
      finish: {"t": "导览到此结束", "b": "你已看过搜索、菜单、蒙特卡洛模拟、压力测试和估值模型。添加自己的持仓后，同样的工具会基于你的持仓运行。随时可从菜单底部重新播放导览。"},
    },
  },
  "zh-Hant": {
    ui: {"next": "下一步", "askpill": "送出你的問題，看看分析師如何運作。", "act": "標示的區域可直接操作：試一試，或按下一步。", "hintSim": "點按 Run simulation。工具會在你的瀏覽器中為範例組合運算 10,000 種可能的未來。", "hintStress": "點按 Run simulation，對範例持倉施加升息衝擊、科技股下跌與經濟衰退。", "hintDcf": "DCF 依企業預計賺取的現金來估算其價值。點按 Bear、Base 或 Bull，觀察每股價值的變化。", "tryit": "現在試試：在標示的輸入框中輸入問題並送出。", "back": "上一步", "skip": "略過導覽", "finish": "開始探索", "label": "快速導覽", "step": "第 {n} 步，共 {total} 步", "replay": "重新播放導覽", "replayHead": "快速導覽", "replayText": "一分鐘帶你了解搜尋、導覽、持倉和研究。", "explore": "繼續探索", "account": "建立免費帳戶", "palette": "開始快速導覽", "hintTried": "這就是模型在重新計算。準備好後請按下一步。", "ctaNote": "免費方案。加入你自己的持倉，並保存在你的帳戶中。", "haveAccount": "我已有帳戶", "hintSimDone": "完成。扇形圖顯示結果的範圍，數字顯示虧損機率與風險值。", "hintStressDone": "每一列是對範例持倉施加的一次市場下跌，並列出對組合的估計影響。", "premium": "了解 Premium"},
    steps: {
      welcome: {"t": "一分鐘快速了解", "b": "用模擬的範例投資組合，快速瀏覽搜尋、選單、你的投資組合和兩個進階工具。無須註冊。應用程式中的每個數字都標明來源與日期。隨時可以跳過。"},
      search: {"t": "從搜尋開始", "b": "依名稱或代號尋找任何公司、ETF、指數或加密資產，也可搜尋文件、新聞和頁面。隨時按 {key}。", "a": "放大鏡圖示就是搜尋。可查找任何公司、ETF、指數或加密資產，以及文件、新聞和頁面。"},
      nav: {"t": "找到你要的功能", "b": "選單分為 My Portfolio、Research、Simulation、Macro & markets、Deep analysis 和 Sector rotation。展開群組即可看到其中的頁面。", "a": "選單按鈕會展開各個區塊：My Portfolio、Research、Simulation、Macro & markets、Deep analysis 和 Sector rotation。"},
      summary: {"t": "我的投資組合表現如何？", "b": "總價值、今日漲跌、未實現損益，以及距離一年高點的幅度，一列盡覽。"},
      sim: {"t": "用蒙地卡羅壓力測試組合"},
      stress: {"t": "執行壓力測試"},
      dcf: {"t": "一家公司值多少錢？"},
      ask: {"t": "免費提問一次", "b": "AI 分析師根據即時行情、財報文件、新聞與宏觀資料作答，並為每個數字標註來源。無需帳戶即可提問一次，先看看它如何思考。建立免費帳戶即可繼續。"},
      answer: {"t": "閱讀回答", "b": "每個數字都標註了對應的依據。慢慢看，準備好再繼續。"},
      finish: {"t": "導覽到此結束", "b": "你已看過搜尋、選單、蒙地卡羅模擬、壓力測試和估值模型。加入自己的持倉後，同樣的工具會以你的持倉運算。隨時可從選單底部重新播放導覽。"},
    },
  },
  ja: {
    ui: {"next": "次へ", "askpill": "質問を送信して、アナリストの動きを確認しましょう。", "act": "ハイライトした部分は実際に操作できます。試すか、「次へ」を押してください。", "hintSim": "「Run simulation」をタップします。サンプルポートフォリオについて、ブラウザ上で1万通りの将来を計算します。", "hintStress": "「Run simulation」をタップして、金利上昇、テック株の下落、景気後退をサンプルの保有銘柄に適用します。", "hintDcf": "DCFは、企業が生み出すと見込まれる現金から価値を見積もる手法です。Bear、Base、Bullをタップして、1株あたり価値の変化を確かめてください。", "tryit": "ここで試せます。ハイライトされた入力欄に質問を入力して送信してください。", "back": "戻る", "skip": "ツアーをスキップ", "finish": "使い始める", "label": "クイックツアー", "step": "ステップ {n} / {total}", "replay": "ツアーを再生", "replayHead": "クイックツアー", "replayText": "検索、ナビゲーション、保有銘柄、調査を1分で案内します。", "explore": "そのまま使ってみる", "account": "無料アカウントを作成", "palette": "クイックツアーを見る", "hintTried": "これがモデルの再計算です。準備ができたら「次へ」を押してください。", "ctaNote": "無料プラン。ご自身の保有銘柄を追加して、アカウントに保存できます。", "haveAccount": "アカウントをお持ちの方", "hintSimDone": "完了です。ファンチャートは結果の幅を、数値は損失の確率とバリュー・アット・リスクを示します。", "hintStressDone": "各行は、サンプルの保有銘柄に適用した相場下落と、ポートフォリオへの推定影響を示します。", "premium": "Premiumを見る"},
    steps: {
      welcome: {"t": "1分でひと通り見る", "b": "シミュレーションのサンプルポートフォリオを使って、検索、メニュー、ポートフォリオ、2つの高度なツールを短く案内します。登録は不要です。アプリ内の数値にはすべて出典と日付が表示されます。いつでもスキップできます。"},
      search: {"t": "まずは検索から", "b": "企業、ETF、指数、暗号資産を名前やティッカーで探せます。開示書類、ニュース、ページも検索できます。どこからでも {key} で開きます。", "a": "虫眼鏡が検索です。企業、ETF、指数、暗号資産のほか、開示書類、ニュース、ページも探せます。"},
      nav: {"t": "目的の場所へ", "b": "メニューは My Portfolio、Research、Simulation、Macro & markets、Deep analysis、Sector rotation に分かれています。グループを開くとページが表示されます。", "a": "メニューボタンでセクションを開きます：My Portfolio、Research、Simulation、Macro & markets、Deep analysis、Sector rotation。"},
      summary: {"t": "ポートフォリオの調子は？", "b": "評価額合計、本日の値動き、含み損益、1年高値からの下落幅を1行で確認できます。"},
      sim: {"t": "モンテカルロでポートフォリオを検証"},
      stress: {"t": "ストレステストを実行"},
      dcf: {"t": "企業の価値はいくらか"},
      ask: {"t": "質問は1回無料", "b": "AI アナリストはリアルタイムの株価、提出書類、ニュース、マクロデータをもとに回答し、すべての数字に出典を示します。アカウントなしで1回質問できるので、考え方を見てみてください。無料アカウントを作成すれば続けられます。"},
      answer: {"t": "回答を読む", "b": "すべての数字に根拠が示されています。ゆっくり読んでから先に進んでください。"},
      finish: {"t": "ツアーは以上です", "b": "検索、メニュー、モンテカルロ、ストレステスト、バリュエーションモデルをご覧いただきました。ご自身の保有銘柄を追加すると、同じツールがそのデータで動きます。ツアーはメニュー下部からいつでも再生できます。"},
    },
  },
  ko: {
    ui: {"next": "다음", "askpill": "질문을 보내 분석가가 일하는 모습을 확인하세요.", "act": "강조된 영역은 실제로 사용할 수 있습니다. 직접 해 보거나 다음을 누르세요.", "hintSim": "Run simulation을 누르세요. 샘플 포트폴리오에 대해 가능한 미래 1만 가지를 브라우저에서 계산합니다.", "hintStress": "Run simulation을 눌러 금리 충격, 기술주 급락, 경기 침체를 샘플 보유 종목에 적용하세요.", "hintDcf": "DCF는 기업이 벌어들일 것으로 보이는 현금으로 가치를 추정합니다. Bear, Base, Bull을 눌러 주당 가치가 어떻게 바뀌는지 보세요.", "tryit": "지금 해 보세요. 강조된 입력창에 질문을 입력하고 전송하세요.", "back": "이전", "skip": "둘러보기 건너뛰기", "finish": "시작하기", "label": "빠른 둘러보기", "step": "{total}단계 중 {n}단계", "replay": "둘러보기 다시 보기", "replayHead": "빠른 둘러보기", "replayText": "검색, 탐색, 보유 종목, 조사를 1분 만에 안내합니다.", "explore": "계속 둘러보기", "account": "무료 계정 만들기", "palette": "빠른 둘러보기 시작", "hintTried": "모델이 다시 계산한 결과입니다. 준비되면 다음을 누르세요.", "ctaNote": "무료 플랜. 내 보유 종목을 추가해 계정에 저장하세요.", "haveAccount": "이미 계정이 있습니다", "hintSimDone": "완료되었습니다. 팬 차트는 결과의 범위를, 수치는 손실 확률과 VaR를 보여 줍니다.", "hintStressDone": "각 행은 샘플 보유 종목에 적용한 시장 하락과 포트폴리오에 미치는 추정 영향입니다.", "premium": "Premium 보기"},
    steps: {
      welcome: {"t": "1분 둘러보기", "b": "모의 샘플 포트폴리오로 검색, 메뉴, 포트폴리오, 두 가지 고급 도구를 짧게 살펴봅니다. 가입은 필요 없습니다. 앱의 모든 수치에는 출처와 날짜가 표시됩니다. 언제든 건너뛸 수 있습니다."},
      search: {"t": "검색으로 시작하세요", "b": "이름이나 티커로 기업, ETF, 지수, 암호화폐를 찾고 공시, 뉴스, 페이지도 검색합니다. 어디서든 {key}를 누르세요.", "a": "돋보기가 검색입니다. 기업, ETF, 지수, 암호화폐는 물론 공시, 뉴스, 페이지도 찾을 수 있습니다."},
      nav: {"t": "원하는 곳으로 이동", "b": "메뉴는 My Portfolio, Research, Simulation, Macro & markets, Deep analysis, Sector rotation으로 나뉩니다. 그룹을 열면 하위 페이지가 보입니다.", "a": "메뉴 버튼으로 섹션을 엽니다: My Portfolio, Research, Simulation, Macro & markets, Deep analysis, Sector rotation."},
      summary: {"t": "내 포트폴리오는 어떤가요?", "b": "총 평가액, 오늘의 변동, 미실현 손익, 1년 고점 대비 하락폭을 한 줄에 보여 줍니다."},
      sim: {"t": "몬테카를로로 포트폴리오 점검"},
      stress: {"t": "스트레스 테스트 실행"},
      dcf: {"t": "기업의 가치는 얼마일까"},
      ask: {"t": "질문 한 번 무료", "b": "AI 애널리스트는 실시간 시세, 공시 자료, 뉴스, 거시 데이터를 근거로 답하고 모든 수치에 출처를 표시합니다. 계정 없이 한 번 질문해 사고 방식을 확인해 보세요. 무료 계정을 만들면 계속할 수 있습니다."},
      answer: {"t": "답변 읽기", "b": "모든 수치에 근거가 표시됩니다. 천천히 읽고 계속하세요."},
      finish: {"t": "둘러보기가 끝났습니다", "b": "검색, 메뉴, 몬테카를로, 스트레스 테스트, 가치평가 모델을 살펴봤습니다. 보유 종목을 추가하면 같은 도구가 내 종목으로 작동합니다. 메뉴 하단에서 언제든 다시 볼 수 있습니다."},
    },
  },
  es: {
    ui: {"next": "Siguiente", "askpill": "Envía tu pregunta para ver trabajar al analista.", "act": "La zona resaltada funciona de verdad: pruébala o pulsa Siguiente.", "hintSim": "Pulsa Run simulation. La herramienta calcula 10.000 futuros posibles de la cartera de ejemplo en tu navegador.", "hintStress": "Pulsa Run simulation para aplicar un shock de tipos, una caída tecnológica y una recesión a las posiciones de ejemplo.", "hintDcf": "Un DCF estima lo que vale un negocio a partir del efectivo que debería generar. Pulsa Bear, Base o Bull y mira cómo cambia el valor por acción.", "tryit": "Pruébalo ahora: escribe una pregunta en el cuadro resaltado y envíala.", "back": "Atrás", "skip": "Omitir recorrido", "finish": "Empezar a explorar", "label": "Recorrido rápido", "step": "Paso {n} de {total}", "replay": "Repetir recorrido", "replayHead": "Recorrido rápido", "replayText": "Un paseo guiado de un minuto por la búsqueda, la navegación, las posiciones y la investigación.", "explore": "Seguir explorando", "account": "Crear una cuenta gratuita", "palette": "Hacer el recorrido rápido", "hintTried": "Así recalcula el modelo. Pulsa Siguiente cuando quieras.", "ctaNote": "Plan gratuito. Añade tus propias posiciones y guárdalas en tu cuenta.", "haveAccount": "Ya tengo una cuenta", "hintSimDone": "Listo. El gráfico de abanico muestra el rango de resultados y las cifras, la probabilidad de pérdida y el valor en riesgo.", "hintStressDone": "Cada fila es una caída del mercado aplicada a las posiciones de ejemplo, con el efecto estimado en la cartera.", "premium": "Ver Premium"},
    steps: {
      welcome: {"t": "Un vistazo de un minuto", "b": "Un recorrido breve por la búsqueda, el menú, tu cartera y dos herramientas avanzadas, con una cartera de ejemplo simulada. No hace falta registrarse. Cada cifra de la app muestra su fuente y su fecha. Puedes saltarlo en cualquier momento."},
      search: {"t": "Empieza por la búsqueda", "b": "Encuentra cualquier empresa, ETF, índice o criptomoneda por nombre o ticker, además de presentaciones, noticias y páginas. Pulsa {key} desde cualquier lugar.", "a": "La lupa es la búsqueda. Encuentra cualquier empresa, ETF, índice o cripto, además de documentos, noticias y páginas."},
      nav: {"t": "Orientarte en la app", "b": "El menú se divide en My Portfolio, Research, Simulation, Macro & markets, Deep analysis y Sector rotation. Abre un grupo para ver sus páginas.", "a": "El botón de menú abre las secciones: My Portfolio, Research, Simulation, Macro & markets, Deep analysis y Sector rotation."},
      summary: {"t": "¿Cómo va mi cartera?", "b": "Valor total, movimiento de hoy, ganancia o pérdida no realizada y distancia al máximo de 1 año, en una sola fila."},
      sim: {"t": "Somete una cartera a Monte Carlo"},
      stress: {"t": "Ejecuta una prueba de estrés"},
      dcf: {"t": "¿Cuánto vale una empresa?"},
      ask: {"t": "Una pregunta gratis", "b": "El analista de IA responde con cotizaciones en vivo, informes presentados, noticias y datos macro, y cita cada fuente. Tienes una pregunta sin cuenta, suficiente para ver cómo razona. Crea una cuenta gratis para seguir."},
      answer: {"t": "Lee la respuesta", "b": "Cada cifra cita la evidencia que la respalda. Tómate tu tiempo y continúa."},
      finish: {"t": "Eso es todo", "b": "Has visto la búsqueda, el menú, una simulación Monte Carlo, una prueba de estrés y el modelo de valoración. Añade tus posiciones y las mismas herramientas funcionarán con ellas. Puedes repetir este recorrido cuando quieras desde el pie del menú."},
    },
  },
  hi: {
    ui: {"next": "आगे", "askpill": "अपना सवाल भेजें और विश्लेषक को काम करते देखें।", "act": "हाइलाइट किया हिस्सा सचमुच चलता है: आज़माएँ या आगे दबाएँ।", "hintSim": "Run simulation दबाएँ। टूल आपके ब्राउज़र में नमूना पोर्टफोलियो के 10,000 संभावित भविष्य निकालता है।", "hintStress": "Run simulation दबाकर नमूना होल्डिंग पर ब्याज दर का झटका, टेक शेयरों में गिरावट और मंदी लागू करें।", "hintDcf": "DCF किसी कारोबार की कीमत उसके कमाए जाने वाले नकद से आँकता है। Bear, Base या Bull दबाएँ और प्रति शेयर मूल्य को बदलते देखें।", "tryit": "अभी आज़माएँ: हाइलाइट किए गए बॉक्स में सवाल लिखें और भेजें।", "back": "पीछे", "skip": "टूर छोड़ें", "finish": "खोजना शुरू करें", "label": "क्विक टूर", "step": "चरण {n} / {total}", "replay": "टूर दोबारा चलाएँ", "replayHead": "क्विक टूर", "replayText": "खोज, नेविगेशन, होल्डिंग्स और शोध का एक मिनट का मार्गदर्शन।", "explore": "आगे देखते रहें", "account": "मुफ़्त खाता बनाएँ", "palette": "क्विक टूर देखें", "hintTried": "यही मॉडल का दोबारा गणना करना है। तैयार हों तो आगे दबाएँ।", "ctaNote": "मुफ़्त प्लान। अपनी होल्डिंग जोड़ें और उन्हें अपने खाते में सहेजें।", "haveAccount": "मेरे पास पहले से खाता है", "hintSimDone": "हो गया। फ़ैन चार्ट नतीजों का दायरा दिखाता है और आँकड़े नुकसान की संभावना और वैल्यू एट रिस्क बताते हैं।", "hintStressDone": "हर पंक्ति नमूना होल्डिंग पर लागू बाज़ार की एक गिरावट है, साथ में पोर्टफोलियो पर अनुमानित असर।", "premium": "Premium देखें"},
    steps: {
      welcome: {"t": "एक मिनट में एक नज़र", "b": "सिमुलेटेड नमूना पोर्टफोलियो पर खोज, मेन्यू, आपके पोर्टफोलियो और दो उन्नत टूल का संक्षिप्त परिचय। साइन-अप की ज़रूरत नहीं। ऐप का हर आँकड़ा अपना स्रोत और तारीख दिखाता है। कभी भी छोड़ा जा सकता है।"},
      search: {"t": "खोज से शुरुआत करें", "b": "नाम या टिकर से कोई भी कंपनी, ETF, इंडेक्स या क्रिप्टो खोजें, साथ ही फाइलिंग, समाचार और पेज भी। कहीं से भी {key} दबाएँ।", "a": "आवर्धक शीशा खोज है। किसी भी कंपनी, ETF, इंडेक्स या क्रिप्टो के साथ फाइलिंग, खबरें और पेज खोजें।"},
      nav: {"t": "सब कुछ कहाँ है", "b": "मेनू में My Portfolio, Research, Simulation, Macro & markets, Deep analysis और Sector rotation अनुभाग हैं। किसी समूह को खोलकर उसके पेज देखें।", "a": "मेन्यू बटन सेक्शन खोलता है: My Portfolio, Research, Simulation, Macro & markets, Deep analysis और Sector rotation।"},
      summary: {"t": "मेरा पोर्टफोलियो कैसा चल रहा है?", "b": "कुल मूल्य, आज की चाल, अवास्तविक लाभ या हानि और 1 साल के शिखर से दूरी, एक ही पंक्ति में।"},
      sim: {"t": "मोंटे कार्लो से पोर्टफ़ोलियो परखें"},
      stress: {"t": "स्ट्रेस टेस्ट चलाएँ"},
      dcf: {"t": "किसी कंपनी की कीमत क्या है"},
      ask: {"t": "एक सवाल मुफ़्त", "b": "AI विश्लेषक लाइव भाव, दाखिल दस्तावेज़, समाचार और मैक्रो डेटा से जवाब देता है और हर आंकड़े का स्रोत बताता है। बिना खाते के आपको एक सवाल मिलता है, जिससे आप देख सकते हैं कि यह कैसे सोचता है। आगे पूछने के लिए मुफ़्त खाता बनाएँ।"},
      answer: {"t": "जवाब पढ़ें", "b": "हर आँकड़े के साथ उसका प्रमाण दिया गया है। आराम से पढ़ें, फिर आगे बढ़ें।"},
      finish: {"t": "टूर पूरा हुआ", "b": "आपने खोज, मेन्यू, मोंटे कार्लो, स्ट्रेस टेस्ट और वैल्यूएशन मॉडल देख लिए। अपनी होल्डिंग जोड़ेंगे तो यही टूल आपकी होल्डिंग पर चलेंगे। यह टूर मेन्यू के नीचे से कभी भी दोबारा चला सकते हैं।"},
    },
  },
  vi: {
    ui: {"next": "Tiếp", "askpill": "Gửi câu hỏi để xem chuyên gia phân tích làm việc.", "act": "Vùng được tô sáng dùng được thật: hãy thử hoặc nhấn Tiếp.", "hintSim": "Nhấn Run simulation. Công cụ tính 10.000 kịch bản tương lai của danh mục mẫu ngay trong trình duyệt của bạn.", "hintStress": "Nhấn Run simulation để áp dụng cú sốc lãi suất, đợt giảm của cổ phiếu công nghệ và suy thoái lên các vị thế mẫu.", "hintDcf": "DCF ước tính giá trị của một doanh nghiệp từ dòng tiền mà nó có thể tạo ra. Nhấn Bear, Base hoặc Bull và xem giá trị mỗi cổ phiếu thay đổi.", "tryit": "Hãy thử ngay: nhập câu hỏi vào khung được đánh dấu rồi gửi.", "back": "Quay lại", "skip": "Bỏ qua", "finish": "Bắt đầu khám phá", "label": "Giới thiệu nhanh", "step": "Bước {n} trên {total}", "replay": "Xem lại phần giới thiệu", "replayHead": "Giới thiệu nhanh", "replayText": "Hướng dẫn một phút về tìm kiếm, điều hướng, vị thế và nghiên cứu.", "explore": "Tiếp tục khám phá", "account": "Tạo tài khoản miễn phí", "palette": "Xem giới thiệu nhanh", "hintTried": "Đó là mô hình đang tính lại. Nhấn Tiếp khi bạn sẵn sàng.", "ctaNote": "Gói miễn phí. Thêm vị thế của riêng bạn và lưu trong tài khoản.", "haveAccount": "Tôi đã có tài khoản", "hintSimDone": "Xong. Biểu đồ quạt cho thấy phạm vi kết quả; các số liệu cho thấy xác suất thua lỗ và giá trị rủi ro.", "hintStressDone": "Mỗi dòng là một đợt giảm của thị trường áp dụng lên các vị thế mẫu, kèm ảnh hưởng ước tính lên danh mục.", "premium": "Xem Premium"},
    steps: {
      welcome: {"t": "Xem nhanh trong một phút", "b": "Lướt qua tìm kiếm, menu, danh mục của bạn và hai công cụ nâng cao, trên một danh mục mẫu mô phỏng. Không cần đăng ký. Mọi con số trong ứng dụng đều ghi nguồn và ngày. Bạn có thể bỏ qua bất cứ lúc nào."},
      search: {"t": "Bắt đầu từ tìm kiếm", "b": "Tìm bất kỳ công ty, ETF, chỉ số hay tiền mã hóa nào theo tên hoặc mã, cùng hồ sơ công bố, tin tức và các trang. Nhấn {key} ở bất cứ đâu.", "a": "Biểu tượng kính lúp là tìm kiếm. Tìm bất kỳ công ty, ETF, chỉ số hay tiền mã hóa nào, cùng hồ sơ, tin tức và trang."},
      nav: {"t": "Tìm đường trong ứng dụng", "b": "Menu gồm My Portfolio, Research, Simulation, Macro & markets, Deep analysis và Sector rotation. Mở một nhóm để xem các trang bên trong.", "a": "Nút menu mở các mục: My Portfolio, Research, Simulation, Macro & markets, Deep analysis và Sector rotation."},
      summary: {"t": "Danh mục của tôi đang ra sao?", "b": "Tổng giá trị, biến động hôm nay, lãi/lỗ chưa thực hiện và mức cách đỉnh 1 năm, gọn trong một hàng."},
      sim: {"t": "Kiểm tra danh mục bằng Monte Carlo"},
      stress: {"t": "Chạy kiểm tra sức chịu đựng"},
      dcf: {"t": "Một công ty đáng giá bao nhiêu?"},
      ask: {"t": "Một câu hỏi miễn phí", "b": "Chuyên gia AI trả lời từ giá trực tiếp, hồ sơ nộp cơ quan quản lý, tin tức và dữ liệu vĩ mô, và trích dẫn mọi nguồn. Bạn có một câu hỏi mà không cần tài khoản, đủ để thấy nó lập luận thế nào. Tạo tài khoản miễn phí để tiếp tục."},
      answer: {"t": "Đọc câu trả lời", "b": "Mỗi con số đều trích dẫn bằng chứng đứng sau. Cứ đọc thong thả rồi tiếp tục."},
      finish: {"t": "Hết phần giới thiệu", "b": "Bạn đã xem tìm kiếm, menu, mô phỏng Monte Carlo, kiểm tra sức chịu đựng và mô hình định giá. Thêm các vị thế của bạn và những công cụ này sẽ chạy trên đó. Bạn có thể xem lại phần giới thiệu từ cuối menu bất cứ lúc nào."},
    },
  },
  fr: {
    ui: {"next": "Suivant", "askpill": "Envoyez votre question pour voir l'analyste à l'œuvre.", "act": "La zone en surbrillance fonctionne vraiment : essayez-la ou appuyez sur Suivant.", "hintSim": "Appuyez sur Run simulation. L'outil calcule 10 000 futurs possibles du portefeuille d'exemple dans votre navigateur.", "hintStress": "Appuyez sur Run simulation pour appliquer un choc de taux, une chute de la tech et une récession aux positions d'exemple.", "hintDcf": "Un DCF estime ce que vaut une entreprise à partir de la trésorerie qu'elle devrait générer. Appuyez sur Bear, Base ou Bull et voyez la valeur par action changer.", "tryit": "Essayez maintenant : saisissez une question dans la zone en surbrillance et envoyez-la.", "back": "Retour", "skip": "Passer la visite", "finish": "Commencer à explorer", "label": "Visite rapide", "step": "Étape {n} sur {total}", "replay": "Rejouer la visite", "replayHead": "Visite rapide", "replayText": "Un parcours guidé d'une minute : recherche, navigation, positions et analyse.", "explore": "Continuer à explorer", "account": "Créer un compte gratuit", "palette": "Faire la visite rapide", "hintTried": "C'est le modèle qui recalcule. Appuyez sur Suivant quand vous voulez.", "ctaNote": "Offre gratuite. Ajoutez vos propres positions et gardez-les dans votre compte.", "haveAccount": "J'ai déjà un compte", "hintSimDone": "Terminé. Le graphique en éventail montre la plage des résultats et les chiffres, la probabilité de perte et la valeur à risque.", "hintStressDone": "Chaque ligne est une baisse de marché appliquée aux positions d'exemple, avec l'effet estimé sur le portefeuille.", "premium": "Voir Premium"},
    steps: {
      welcome: {"t": "Un tour d'une minute", "b": "Un parcours rapide de la recherche, du menu, de votre portefeuille et de deux outils avancés, sur un portefeuille d'exemple simulé. Aucune inscription requise. Chaque chiffre de l'application indique sa source et sa date. Vous pouvez passer à tout moment."},
      search: {"t": "Commencez par la recherche", "b": "Trouvez une entreprise, un ETF, un indice ou une cryptomonnaie par nom ou symbole, ainsi que des dépôts réglementaires, des actualités et des pages. Appuyez sur {key} depuis n'importe où.", "a": "La loupe, c'est la recherche. Trouvez n'importe quelle entreprise, ETF, indice ou crypto, ainsi que des documents, des actualités et des pages."},
      nav: {"t": "Vous repérer", "b": "Le menu comprend My Portfolio, Research, Simulation, Macro & markets, Deep analysis et Sector rotation. Ouvrez un groupe pour voir ses pages.", "a": "Le bouton de menu ouvre les sections : My Portfolio, Research, Simulation, Macro & markets, Deep analysis et Sector rotation."},
      summary: {"t": "Comment se porte mon portefeuille ?", "b": "Valeur totale, variation du jour, plus ou moins-value latente et écart par rapport au plus haut sur 1 an, sur une seule ligne."},
      sim: {"t": "Éprouvez un portefeuille avec Monte Carlo"},
      stress: {"t": "Lancez un test de résistance"},
      dcf: {"t": "Combien vaut une entreprise ?"},
      ask: {"t": "Une question offerte", "b": "L'analyste IA répond à partir des cours en direct, des documents déposés, de l'actualité et des données macro, en citant chaque source. Vous avez une question sans compte, de quoi voir comment il raisonne. Créez un compte gratuit pour continuer."},
      answer: {"t": "Lisez la réponse", "b": "Chaque chiffre cite les éléments qui le fondent. Prenez votre temps, puis continuez."},
      finish: {"t": "C'est tout pour la visite", "b": "Vous avez vu la recherche, le menu, une simulation Monte Carlo, un test de résistance et le modèle de valorisation. Ajoutez vos positions et les mêmes outils tournent sur elles. Vous pouvez rejouer cette visite depuis le bas du menu."},
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
