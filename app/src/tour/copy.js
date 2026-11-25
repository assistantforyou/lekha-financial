/* Quick Tour copy in every language the app ships (English + the nine in public/i18n).
   The tour is rendered by React, outside the classic engine's dictionary pipeline, so it carries its own strings.
   Navigation labels (My Portfolio, Research, Sector rotation ...) stay in English inside translated sentences because
   the shell shows them in English; the copy has to match what the user can actually see.
   Placeholders: {key} = search shortcut, {symbol} = the example company, {n} / {total} = progress. */

export const COPY = {
  en: {
    ui: { next: "Next", askpill: "Send your question to see the analyst work.", act: "Your turn: tap or click the highlighted area. The tour continues by itself.", tryit: "Try it now: type a question in the highlighted box and send it.", back: "Back", skip: "Skip Tour", finish: "Start Exploring", label: "Quick Tour", step: "Step {n} of {total}", replay: "Replay tour", replayHead: "Quick tour", replayText: "A one-minute guided walk through search, navigation, holdings and research.", explore: "Keep exploring", account: "Create a free account", palette: "Take the Quick Tour" },
    steps: {
      welcome: { t: "Welcome to LEKHA Financials", b: "Your workspace for researching companies, tracking your holdings and seeing how your portfolio is doing. This tour takes about a minute." },
      search: { t: "Start with search", b: "Find any company, ETF, index or crypto by name or ticker, plus filings, news and pages. Press {key} from anywhere.", a: "Tap here to find any company, ETF, index or crypto, plus filings, news and pages." },
      nav: { t: "Find your way around", b: "The menu has My Portfolio, Research, Simulation, Macro & markets, Deep analysis and Sector rotation. Open a group to see its pages.", a: "Tap the menu button to open the sections: My Portfolio, Research, Simulation, Macro & markets, Deep analysis and Sector rotation." },
      summary: { t: "How is my portfolio doing?", b: "Total value, today's move, unrealized profit or loss and the distance from your 1-year peak, in one row." },
      performance: { t: "Measure against the market", b: "This chart plots your portfolio against the S&P 500 and Nasdaq. Switch to the value view and pick a range from 1M to 1Y." },
      holdings: { t: "Every position you own", b: "Each holding's value, weight, day move and profit or loss. Click a column heading to sort, or a row for the broker split and price chart.", a: "Add your first position by hand or import a broker statement. Everything else is calculated from it." },
      company: { t: "Research any company", b: "Search brings you here. One workspace per company: price, key ratios, profile and news. {symbol} is shown as an example." },
      tabs: { t: "Switch views, keep your place", b: "Tabs move through Financials, Valuation, Growth, News, Filings, Earnings, Peers and the AI analyst for the same company." },
      ask: { t: "Ask one question free", b: "The AI analyst answers from live quotes, filings, news and macro data, and cites every source. You get one question without an account — enough to see how it thinks. Create a free account to keep going." },
      pick: { t: "Pick a company", b: "Type a name or ticker, for example Apple or AAPL, then choose it from the list." },
      askai: { t: "Ask about this company", b: "Ask AI opens the research agent already pointed at {symbol}." },
      gohold: { t: "Open your holdings", b: "Choose Holdings & ledger under My Portfolio to see every position you own." },
      answer: { t: "Read the answer", b: "Every figure is cited to the evidence behind it. Take your time, then continue." },
      discover: { t: "Discover, not just look up", b: "Not sure what to research? Sector rotation shows where money is flowing. Macro & markets and the AI research agent go further." },
      finish: { t: "Your workflow", b: "Search, research, review your holdings, monitor performance. Explore freely. You can replay this tour from Preferences or the menu footer.", wf: ["Search", "Research", "Holdings", "Performance"] },
    },
  },
  th: {
    ui: { next: "ถัดไป", askpill: "ส่งคำถามของคุณเพื่อดูการทำงานของนักวิเคราะห์", act: "ถึงตาคุณ: แตะหรือคลิกบริเวณที่ไฮไลต์ ทัวร์จะไปต่อโดยอัตโนมัติ", tryit: "ลองเลย: พิมพ์คำถามในกล่องที่ไฮไลต์แล้วกดส่ง", back: "ย้อนกลับ", skip: "ข้ามทัวร์", finish: "เริ่มสำรวจ", label: "ทัวร์แนะนำ", step: "ขั้นที่ {n} จาก {total}", replay: "เปิดทัวร์อีกครั้ง", replayHead: "ทัวร์แนะนำ", replayText: "แนะนำการใช้งานหนึ่งนาที ครอบคลุมการค้นหา การนำทาง สินทรัพย์ที่ถือ และการค้นคว้า", explore: "สำรวจต่อ", account: "สร้างบัญชีฟรี", palette: "ดูทัวร์แนะนำ" },
    steps: {
      welcome: { t: "ยินดีต้อนรับสู่ LEKHA Financials", b: "พื้นที่ทำงานสำหรับค้นคว้าบริษัท ติดตามสินทรัพย์ที่ถือ และดูว่าพอร์ตโฟลิโอของคุณเป็นอย่างไร ทัวร์นี้ใช้เวลาประมาณหนึ่งนาที" },
      search: { t: "เริ่มต้นด้วยการค้นหา", b: "ค้นหาบริษัท ETF ดัชนี หรือคริปโตด้วยชื่อหรือสัญลักษณ์ รวมถึงเอกสารที่ยื่น ข่าว และหน้าต่าง ๆ กด {key} ได้จากทุกหน้า", a: "แตะที่นี่เพื่อค้นหาบริษัท ETF ดัชนี หรือคริปโต รวมถึงเอกสารที่ยื่น ข่าว และหน้าต่าง ๆ" },
      nav: { t: "ดูว่าอะไรอยู่ตรงไหน", b: "เมนูแบ่งเป็น My Portfolio, Research, Simulation, Macro & markets, Deep analysis และ Sector rotation เปิดกลุ่มเพื่อดูหน้าที่อยู่ข้างใน", a: "แตะปุ่มเมนูเพื่อเปิดหมวดต่าง ๆ ได้แก่ My Portfolio, Research, Simulation, Macro & markets, Deep analysis และ Sector rotation" },
      summary: { t: "พอร์ตของฉันเป็นอย่างไรบ้าง", b: "มูลค่ารวม ความเคลื่อนไหววันนี้ กำไรหรือขาดทุนที่ยังไม่รับรู้ และระยะห่างจากจุดสูงสุดในรอบ 1 ปี ในแถวเดียว" },
      performance: { t: "เทียบกับตลาด", b: "กราฟนี้เทียบพอร์ตของคุณกับ S&P 500 และ Nasdaq สลับไปดูมูลค่า และเลือกช่วงเวลาตั้งแต่ 1M ถึง 1Y" },
      holdings: { t: "ทุกสถานะที่คุณถืออยู่", b: "ดูมูลค่า สัดส่วน ความเคลื่อนไหวรายวัน และกำไรหรือขาดทุนของแต่ละรายการ คลิกหัวคอลัมน์เพื่อเรียงลำดับ หรือคลิกแถวเพื่อดูการแบ่งตามโบรกเกอร์และกราฟราคา", a: "เพิ่มสถานะแรกของคุณด้วยตนเอง หรือนำเข้าใบแจ้งยอดจากโบรกเกอร์ ส่วนอื่นทั้งหมดคำนวณจากข้อมูลนี้" },
      company: { t: "ค้นคว้าบริษัทใดก็ได้", b: "การค้นหาจะนำคุณมาที่นี่ หนึ่งพื้นที่ทำงานต่อหนึ่งบริษัท: ราคา อัตราส่วนสำคัญ โปรไฟล์ และข่าว ตัวอย่างนี้คือ {symbol}" },
      tabs: { t: "สลับมุมมองโดยไม่เสียตำแหน่ง", b: "แท็บพาคุณไปดู Financials, Valuation, Growth, News, Filings, Earnings, Peers และ AI analyst ของบริษัทเดียวกัน" },
      ask: { t: "ถามฟรีหนึ่งคำถาม", b: "AI analyst ตอบจากราคาสด เอกสารที่ยื่นต่อ ก.ล.ต. ข่าว และข้อมูลมหภาค พร้อมอ้างอิงแหล่งที่มาทุกครั้ง คุณถามได้หนึ่งคำถามโดยไม่ต้องมีบัญชี เพื่อดูว่ามันคิดอย่างไร สมัครบัญชีฟรีเพื่อถามต่อ" },
      pick: { t: "เลือกบริษัท", b: "พิมพ์ชื่อหรือสัญลักษณ์ เช่น Apple หรือ AAPL แล้วเลือกจากรายการ" },
      askai: { t: "ถามเกี่ยวกับบริษัทนี้", b: "ปุ่ม Ask AI เปิดตัวช่วยวิจัยที่ตั้งไว้ที่ {symbol} แล้ว" },
      gohold: { t: "เปิดรายการที่ถือครอง", b: "เลือก Holdings & ledger ใต้ My Portfolio เพื่อดูทุกสถานะที่คุณถือ" },
      answer: { t: "อ่านคำตอบ", b: "ทุกตัวเลขอ้างอิงหลักฐานที่มา อ่านได้ตามสบาย แล้วค่อยไปต่อ" },
      discover: { t: "ค้นหาไอเดีย ไม่ใช่แค่ค้นชื่อ", b: "ยังไม่รู้จะค้นคว้าอะไร? Sector rotation แสดงว่าเงินกำลังไหลไปที่ใด ส่วน Macro & markets และ AI research agent ช่วยให้สำรวจต่อได้ลึกขึ้น" },
      finish: { t: "ขั้นตอนการใช้งานของคุณ", b: "ค้นหา ค้นคว้า ตรวจสอบสินทรัพย์ที่ถือ ติดตามผลการดำเนินงาน สำรวจได้อย่างอิสระ และเปิดทัวร์นี้ซ้ำได้จาก Preferences หรือท้ายเมนู", wf: ["ค้นหา", "ค้นคว้า", "สินทรัพย์ที่ถือ", "ผลการดำเนินงาน"] },
    },
  },
  "zh-Hans": {
    ui: { next: "下一步", askpill: "发送你的问题，看看分析师如何工作。", act: "轮到你了：点按高亮区域，导览会自动继续。", tryit: "现在试试：在高亮的输入框中输入问题并发送。", back: "上一步", skip: "跳过导览", finish: "开始探索", label: "快速导览", step: "第 {n} 步，共 {total} 步", replay: "重新播放导览", replayHead: "快速导览", replayText: "一分钟带你了解搜索、导航、持仓和研究。", explore: "继续探索", account: "创建免费账户", palette: "开始快速导览" },
    steps: {
      welcome: { t: "欢迎使用 LEKHA Financials", b: "研究公司、跟踪持仓、了解投资组合表现的一站式工作台。本导览约需一分钟。" },
      search: { t: "从搜索开始", b: "按名称或代码查找任何公司、ETF、指数或加密资产，也可搜索文件、新闻和页面。随时按 {key}。", a: "点按此处查找任何公司、ETF、指数或加密资产，也可搜索文件、新闻和页面。" },
      nav: { t: "找到你要的功能", b: "菜单分为 My Portfolio、Research、Simulation、Macro & markets、Deep analysis 和 Sector rotation。展开分组即可看到其中的页面。", a: "点按菜单按钮打开各个分区：My Portfolio、Research、Simulation、Macro & markets、Deep analysis 和 Sector rotation。" },
      summary: { t: "我的投资组合表现如何？", b: "总价值、今日涨跌、未实现盈亏，以及距离一年高点的幅度，一行尽览。" },
      performance: { t: "对照大盘看表现", b: "此图将你的投资组合与标普 500 和纳斯达克对比。可切换为价值视图，并选择 1M 到 1Y 的区间。" },
      holdings: { t: "你持有的每一笔仓位", b: "每个持仓的价值、权重、当日涨跌和盈亏。点击列标题可排序，点击某一行可查看券商拆分和价格图表。", a: "手动添加第一笔持仓，或导入券商对账单。其余内容都由此计算。" },
      company: { t: "研究任何一家公司", b: "搜索会带你来到这里。每家公司一个工作区：价格、关键比率、简介和新闻。此处以 {symbol} 为例。" },
      tabs: { t: "切换视图，不丢位置", b: "标签页可在同一家公司的 Financials、Valuation、Growth、News、Filings、Earnings、Peers 和 AI analyst 之间切换。" },
      ask: { t: "免费提问一次", b: "AI 分析师根据实时行情、财报文件、新闻和宏观数据作答，并为每个数字标注来源。无需账户即可提问一次，先看看它如何思考。创建免费账户即可继续。" },
      pick: { t: "选择一家公司", b: "输入名称或代码，例如 Apple 或 AAPL，然后从列表中选择。" },
      askai: { t: "询问这家公司", b: "点击 Ask AI 会打开已指向 {symbol} 的研究助手。" },
      gohold: { t: "打开你的持仓", b: "在 My Portfolio 下选择 Holdings & ledger，查看你持有的每一个头寸。" },
      answer: { t: "阅读回答", b: "每个数字都标注了对应的依据。慢慢看，准备好后再继续。" },
      discover: { t: "不只是查询，还能发现", b: "不知道研究什么？Sector rotation 显示资金流向何处。Macro & markets 和 AI research agent 可帮你深入探索。" },
      finish: { t: "你的使用流程", b: "搜索、研究、查看持仓、跟踪表现。你可以自由探索，并随时从 Preferences 或菜单底部重新播放本导览。", wf: ["搜索", "研究", "持仓", "表现"] },
    },
  },
  "zh-Hant": {
    ui: { next: "下一步", askpill: "送出你的問題，看看分析師如何運作。", act: "換你操作：點選標示區域，導覽會自動繼續。", tryit: "現在試試：在標示的輸入框中輸入問題並送出。", back: "上一步", skip: "略過導覽", finish: "開始探索", label: "快速導覽", step: "第 {n} 步，共 {total} 步", replay: "重新播放導覽", replayHead: "快速導覽", replayText: "一分鐘帶你了解搜尋、導覽、持倉和研究。", explore: "繼續探索", account: "建立免費帳戶", palette: "開始快速導覽" },
    steps: {
      welcome: { t: "歡迎使用 LEKHA Financials", b: "研究公司、追蹤持倉、了解投資組合表現的一站式工作台。本導覽約需一分鐘。" },
      search: { t: "從搜尋開始", b: "依名稱或代號尋找任何公司、ETF、指數或加密資產，也可搜尋文件、新聞和頁面。隨時按 {key}。", a: "點按此處尋找任何公司、ETF、指數或加密資產，也可搜尋文件、新聞和頁面。" },
      nav: { t: "找到你要的功能", b: "選單分為 My Portfolio、Research、Simulation、Macro & markets、Deep analysis 和 Sector rotation。展開群組即可看到其中的頁面。", a: "點按選單按鈕開啟各個分區：My Portfolio、Research、Simulation、Macro & markets、Deep analysis 和 Sector rotation。" },
      summary: { t: "我的投資組合表現如何？", b: "總價值、今日漲跌、未實現損益，以及距離一年高點的幅度，一列盡覽。" },
      performance: { t: "對照大盤看表現", b: "此圖將你的投資組合與標普 500 和那斯達克比較。可切換為價值檢視，並選擇 1M 到 1Y 的區間。" },
      holdings: { t: "你持有的每一筆部位", b: "每個持倉的價值、權重、當日漲跌和損益。點擊欄位標題可排序，點擊某一列可查看券商拆分和價格圖表。", a: "手動新增第一筆持倉，或匯入券商對帳單。其餘內容都由此計算。" },
      company: { t: "研究任何一家公司", b: "搜尋會帶你來到這裡。每家公司一個工作區：價格、關鍵比率、簡介和新聞。此處以 {symbol} 為例。" },
      tabs: { t: "切換檢視，不丟位置", b: "分頁可在同一家公司的 Financials、Valuation、Growth、News、Filings、Earnings、Peers 和 AI analyst 之間切換。" },
      ask: { t: "免費提問一次", b: "AI 分析師根據即時行情、財報文件、新聞與宏觀資料作答，並為每個數字標註來源。無需帳戶即可提問一次，先看看它如何思考。建立免費帳戶即可繼續。" },
      pick: { t: "選擇一家公司", b: "輸入名稱或代號，例如 Apple 或 AAPL，然後從清單中選擇。" },
      askai: { t: "詢問這家公司", b: "點選 Ask AI 會開啟已指向 {symbol} 的研究助理。" },
      gohold: { t: "開啟你的持倉", b: "在 My Portfolio 下選擇 Holdings & ledger，查看你持有的每一個部位。" },
      answer: { t: "閱讀回答", b: "每個數字都標註了對應的依據。慢慢看，準備好再繼續。" },
      discover: { t: "不只是查詢，還能發掘", b: "不知道研究什麼？Sector rotation 顯示資金流向何處。Macro & markets 和 AI research agent 可協助你深入探索。" },
      finish: { t: "你的使用流程", b: "搜尋、研究、檢視持倉、追蹤表現。你可以自由探索，並隨時從 Preferences 或選單底部重新播放本導覽。", wf: ["搜尋", "研究", "持倉", "表現"] },
    },
  },
  ja: {
    ui: { next: "次へ", askpill: "質問を送信して、アナリストの動きを確認しましょう。", act: "操作してみましょう。ハイライトされた部分をタップまたはクリックすると、ツアーが自動で進みます。", tryit: "ここで試せます。ハイライトされた入力欄に質問を入力して送信してください。", back: "戻る", skip: "ツアーをスキップ", finish: "使い始める", label: "クイックツアー", step: "ステップ {n} / {total}", replay: "ツアーを再生", replayHead: "クイックツアー", replayText: "検索、ナビゲーション、保有銘柄、調査を1分で案内します。", explore: "そのまま使ってみる", account: "無料アカウントを作成", palette: "クイックツアーを見る" },
    steps: {
      welcome: { t: "LEKHA Financials へようこそ", b: "企業の調査、保有銘柄の管理、ポートフォリオの状況把握のための作業スペースです。このツアーは約1分で終わります。" },
      search: { t: "まずは検索から", b: "企業、ETF、指数、暗号資産を名前やティッカーで探せます。開示書類、ニュース、ページも検索できます。どこからでも {key} で開きます。", a: "ここをタップして企業、ETF、指数、暗号資産を検索できます。開示書類、ニュース、ページも対象です。" },
      nav: { t: "目的の場所へ", b: "メニューは My Portfolio、Research、Simulation、Macro & markets、Deep analysis、Sector rotation に分かれています。グループを開くとページが表示されます。", a: "メニューボタンをタップすると各セクションが開きます: My Portfolio、Research、Simulation、Macro & markets、Deep analysis、Sector rotation。" },
      summary: { t: "ポートフォリオの調子は？", b: "評価額合計、本日の値動き、含み損益、1年高値からの下落幅を1行で確認できます。" },
      performance: { t: "市場と比べる", b: "ポートフォリオを S&P 500 と Nasdaq と比較するチャートです。評価額表示に切り替えたり、1M から 1Y までの期間を選べます。" },
      holdings: { t: "保有するすべてのポジション", b: "各銘柄の評価額、比率、日次の値動き、損益を確認できます。列見出しをクリックで並べ替え、行をクリックで証券会社別の内訳と価格チャートが開きます。", a: "最初のポジションを手入力するか、証券会社の取引報告書を取り込みます。ほかの数値はすべてそこから計算されます。" },
      company: { t: "どの企業も調べられます", b: "検索するとここに移動します。企業ごとにひとつの作業スペースで、株価、主要指標、概要、ニュースを確認できます。例として {symbol} を表示しています。" },
      tabs: { t: "位置を保ったまま表示を切り替え", b: "タブで同じ企業の Financials、Valuation、Growth、News、Filings、Earnings、Peers、AI analyst を切り替えられます。" },
      ask: { t: "質問は1回無料", b: "AI アナリストはリアルタイムの株価、提出書類、ニュース、マクロデータをもとに回答し、すべての数字に出典を示します。アカウントなしで1回質問できるので、考え方を見てみてください。無料アカウントを作成すれば続けられます。" },
      pick: { t: "企業を選ぶ", b: "社名またはティッカー（例: Apple、AAPL）を入力し、一覧から選びます。" },
      askai: { t: "この企業について質問する", b: "Ask AI を押すと、{symbol} を対象にしたリサーチエージェントが開きます。" },
      gohold: { t: "保有銘柄を開く", b: "My Portfolio の Holdings & ledger を選ぶと、保有しているすべてのポジションを確認できます。" },
      answer: { t: "回答を読む", b: "すべての数字に根拠が示されています。ゆっくり読んでから先に進んでください。" },
      discover: { t: "探すだけでなく、見つける", b: "何を調べるか迷ったら、Sector rotation で資金の流れを確認できます。Macro & markets と AI research agent でさらに掘り下げられます。" },
      finish: { t: "基本の流れ", b: "検索、調査、保有銘柄の確認、パフォーマンスの把握。自由に使ってみてください。このツアーは Preferences またはメニュー下部からいつでも再生できます。", wf: ["検索", "調査", "保有銘柄", "パフォーマンス"] },
    },
  },
  ko: {
    ui: { next: "다음", askpill: "질문을 보내 분석가가 일하는 모습을 확인하세요.", act: "직접 해 보세요. 강조된 영역을 누르거나 클릭하면 투어가 자동으로 이어집니다.", tryit: "지금 해 보세요. 강조된 입력창에 질문을 입력하고 전송하세요.", back: "이전", skip: "둘러보기 건너뛰기", finish: "시작하기", label: "빠른 둘러보기", step: "{total}단계 중 {n}단계", replay: "둘러보기 다시 보기", replayHead: "빠른 둘러보기", replayText: "검색, 탐색, 보유 종목, 조사를 1분 만에 안내합니다.", explore: "계속 둘러보기", account: "무료 계정 만들기", palette: "빠른 둘러보기 시작" },
    steps: {
      welcome: { t: "LEKHA Financials에 오신 것을 환영합니다", b: "기업을 조사하고, 보유 종목을 추적하고, 포트폴리오 상태를 한눈에 확인하는 작업 공간입니다. 둘러보기는 약 1분이면 끝납니다." },
      search: { t: "검색으로 시작하세요", b: "이름이나 티커로 기업, ETF, 지수, 암호화폐를 찾고 공시, 뉴스, 페이지도 검색합니다. 어디서든 {key}를 누르세요.", a: "여기를 눌러 기업, ETF, 지수, 암호화폐와 공시, 뉴스, 페이지를 검색하세요." },
      nav: { t: "원하는 곳으로 이동", b: "메뉴는 My Portfolio, Research, Simulation, Macro & markets, Deep analysis, Sector rotation으로 나뉩니다. 그룹을 열면 하위 페이지가 보입니다.", a: "메뉴 버튼을 눌러 섹션을 여세요: My Portfolio, Research, Simulation, Macro & markets, Deep analysis, Sector rotation." },
      summary: { t: "내 포트폴리오는 어떤가요?", b: "총 평가액, 오늘의 변동, 미실현 손익, 1년 고점 대비 하락폭을 한 줄에 보여 줍니다." },
      performance: { t: "시장과 비교하기", b: "이 차트는 포트폴리오를 S&P 500, Nasdaq과 비교합니다. 평가액 보기로 전환하고 1M부터 1Y까지 기간을 고를 수 있습니다." },
      holdings: { t: "보유 중인 모든 포지션", b: "종목별 평가액, 비중, 일간 변동, 손익을 확인하세요. 열 제목을 클릭하면 정렬되고, 행을 클릭하면 증권사별 내역과 가격 차트가 열립니다.", a: "첫 포지션을 직접 추가하거나 증권사 거래 내역서를 가져오세요. 나머지는 모두 여기서 계산됩니다." },
      company: { t: "어떤 기업이든 조사하세요", b: "검색하면 이곳으로 옵니다. 기업마다 하나의 작업 공간에서 가격, 핵심 지표, 개요, 뉴스를 볼 수 있습니다. 예시로 {symbol}을(를) 보여 드립니다." },
      tabs: { t: "위치를 유지한 채 보기 전환", b: "탭으로 같은 기업의 Financials, Valuation, Growth, News, Filings, Earnings, Peers, AI analyst를 오갈 수 있습니다." },
      ask: { t: "질문 한 번 무료", b: "AI 애널리스트는 실시간 시세, 공시 자료, 뉴스, 거시 데이터를 근거로 답하고 모든 수치에 출처를 표시합니다. 계정 없이 한 번 질문해 사고 방식을 확인해 보세요. 무료 계정을 만들면 계속할 수 있습니다." },
      pick: { t: "기업 선택", b: "회사명이나 티커(예: Apple, AAPL)를 입력하고 목록에서 선택하세요." },
      askai: { t: "이 기업에 대해 질문하기", b: "Ask AI를 누르면 {symbol}에 맞춰진 리서치 에이전트가 열립니다." },
      gohold: { t: "보유 종목 열기", b: "My Portfolio 아래의 Holdings & ledger를 선택하면 보유한 모든 포지션을 볼 수 있습니다." },
      answer: { t: "답변 읽기", b: "모든 수치에 근거가 표시됩니다. 천천히 읽고 계속하세요." },
      discover: { t: "찾아보는 데서 발견하는 데까지", b: "무엇을 조사할지 모르겠다면 Sector rotation에서 자금 흐름을 확인하세요. Macro & markets와 AI research agent로 더 깊이 살펴볼 수 있습니다." },
      finish: { t: "추천 사용 흐름", b: "검색, 조사, 보유 종목 검토, 성과 모니터링. 자유롭게 둘러보세요. 이 둘러보기는 Preferences나 메뉴 하단에서 언제든 다시 볼 수 있습니다.", wf: ["검색", "조사", "보유 종목", "성과"] },
    },
  },
  es: {
    ui: { next: "Siguiente", askpill: "Envía tu pregunta para ver trabajar al analista.", act: "Tu turno: toca o haz clic en la zona resaltada. El recorrido continúa solo.", tryit: "Pruébalo ahora: escribe una pregunta en el cuadro resaltado y envíala.", back: "Atrás", skip: "Omitir recorrido", finish: "Empezar a explorar", label: "Recorrido rápido", step: "Paso {n} de {total}", replay: "Repetir recorrido", replayHead: "Recorrido rápido", replayText: "Un paseo guiado de un minuto por la búsqueda, la navegación, las posiciones y la investigación.", explore: "Seguir explorando", account: "Crear una cuenta gratuita", palette: "Hacer el recorrido rápido" },
    steps: {
      welcome: { t: "Te damos la bienvenida a LEKHA Financials", b: "Tu espacio para investigar empresas, seguir tus posiciones y ver cómo va tu cartera. Este recorrido dura aproximadamente un minuto." },
      search: { t: "Empieza por la búsqueda", b: "Encuentra cualquier empresa, ETF, índice o criptomoneda por nombre o ticker, además de presentaciones, noticias y páginas. Pulsa {key} desde cualquier lugar.", a: "Toca aquí para buscar cualquier empresa, ETF, índice o criptomoneda, además de presentaciones, noticias y páginas." },
      nav: { t: "Orientarte en la app", b: "El menú se divide en My Portfolio, Research, Simulation, Macro & markets, Deep analysis y Sector rotation. Abre un grupo para ver sus páginas.", a: "Toca el botón de menú para abrir las secciones: My Portfolio, Research, Simulation, Macro & markets, Deep analysis y Sector rotation." },
      summary: { t: "¿Cómo va mi cartera?", b: "Valor total, movimiento de hoy, ganancia o pérdida no realizada y distancia al máximo de 1 año, en una sola fila." },
      performance: { t: "Compárate con el mercado", b: "Este gráfico compara tu cartera con el S&P 500 y el Nasdaq. Cambia a la vista de valor y elige un periodo de 1M a 1Y." },
      holdings: { t: "Cada posición que tienes", b: "Valor, peso, variación diaria y ganancia o pérdida de cada posición. Haz clic en un encabezado para ordenar, o en una fila para ver el desglose por bróker y el gráfico de precio.", a: "Añade tu primera posición a mano o importa un extracto del bróker. Todo lo demás se calcula a partir de ahí." },
      company: { t: "Investiga cualquier empresa", b: "La búsqueda te trae aquí. Un espacio por empresa: precio, ratios clave, perfil y noticias. Se muestra {symbol} como ejemplo." },
      tabs: { t: "Cambia de vista sin perder el sitio", b: "Las pestañas recorren Financials, Valuation, Growth, News, Filings, Earnings, Peers y el AI analyst de la misma empresa." },
      ask: { t: "Una pregunta gratis", b: "El analista de IA responde con cotizaciones en vivo, informes presentados, noticias y datos macro, y cita cada fuente. Tienes una pregunta sin cuenta, suficiente para ver cómo razona. Crea una cuenta gratis para seguir." },
      pick: { t: "Elige una empresa", b: "Escribe un nombre o un ticker, por ejemplo Apple o AAPL, y elígela de la lista." },
      askai: { t: "Pregunta sobre esta empresa", b: "Ask AI abre el agente de investigación ya enfocado en {symbol}." },
      gohold: { t: "Abre tus posiciones", b: "Elige Holdings & ledger en My Portfolio para ver cada posición que tienes." },
      answer: { t: "Lee la respuesta", b: "Cada cifra cita la evidencia que la respalda. Tómate tu tiempo y continúa." },
      discover: { t: "Descubre, no solo consultes", b: "¿No sabes qué investigar? Sector rotation muestra hacia dónde fluye el dinero. Macro & markets y el AI research agent te llevan más lejos." },
      finish: { t: "Tu flujo de trabajo", b: "Busca, investiga, revisa tus posiciones y vigila el rendimiento. Explora con libertad. Puedes repetir este recorrido desde Preferences o el pie del menú.", wf: ["Buscar", "Investigar", "Posiciones", "Rendimiento"] },
    },
  },
  hi: {
    ui: { next: "आगे", askpill: "अपना सवाल भेजें और विश्लेषक को काम करते देखें।", act: "आपकी बारी: हाइलाइट किए गए हिस्से पर टैप या क्लिक करें। टूर अपने आप आगे बढ़ेगा।", tryit: "अभी आज़माएँ: हाइलाइट किए गए बॉक्स में सवाल लिखें और भेजें।", back: "पीछे", skip: "टूर छोड़ें", finish: "खोजना शुरू करें", label: "क्विक टूर", step: "चरण {n} / {total}", replay: "टूर दोबारा चलाएँ", replayHead: "क्विक टूर", replayText: "खोज, नेविगेशन, होल्डिंग्स और शोध का एक मिनट का मार्गदर्शन।", explore: "आगे देखते रहें", account: "मुफ़्त खाता बनाएँ", palette: "क्विक टूर देखें" },
    steps: {
      welcome: { t: "LEKHA Financials में आपका स्वागत है", b: "कंपनियों पर शोध करने, अपने होल्डिंग्स ट्रैक करने और पोर्टफोलियो की स्थिति समझने के लिए आपका कार्यक्षेत्र। यह टूर लगभग एक मिनट का है।" },
      search: { t: "खोज से शुरुआत करें", b: "नाम या टिकर से कोई भी कंपनी, ETF, इंडेक्स या क्रिप्टो खोजें, साथ ही फाइलिंग, समाचार और पेज भी। कहीं से भी {key} दबाएँ।", a: "कोई भी कंपनी, ETF, इंडेक्स या क्रिप्टो, साथ ही फाइलिंग, समाचार और पेज खोजने के लिए यहाँ टैप करें।" },
      nav: { t: "सब कुछ कहाँ है", b: "मेनू में My Portfolio, Research, Simulation, Macro & markets, Deep analysis और Sector rotation अनुभाग हैं। किसी समूह को खोलकर उसके पेज देखें।", a: "अनुभाग खोलने के लिए मेनू बटन टैप करें: My Portfolio, Research, Simulation, Macro & markets, Deep analysis और Sector rotation।" },
      summary: { t: "मेरा पोर्टफोलियो कैसा चल रहा है?", b: "कुल मूल्य, आज की चाल, अवास्तविक लाभ या हानि और 1 साल के शिखर से दूरी, एक ही पंक्ति में।" },
      performance: { t: "बाज़ार से तुलना करें", b: "यह चार्ट आपके पोर्टफोलियो की तुलना S&P 500 और Nasdaq से करता है। मूल्य व्यू पर जाएँ और 1M से 1Y तक की अवधि चुनें।" },
      holdings: { t: "आपकी हर पोज़िशन", b: "हर होल्डिंग का मूल्य, भार, दैनिक चाल और लाभ या हानि देखें। क्रमबद्ध करने के लिए कॉलम शीर्षक पर क्लिक करें, या ब्रोकर-वार विभाजन और मूल्य चार्ट के लिए किसी पंक्ति पर।", a: "अपनी पहली पोज़िशन हाथ से जोड़ें या ब्रोकर स्टेटमेंट इम्पोर्ट करें। बाकी सब कुछ इसी से गणना होता है।" },
      company: { t: "किसी भी कंपनी पर शोध करें", b: "खोज आपको यहाँ लाती है। हर कंपनी के लिए एक कार्यक्षेत्र: कीमत, मुख्य अनुपात, प्रोफ़ाइल और समाचार। उदाहरण के लिए {symbol} दिखाया गया है।" },
      tabs: { t: "जगह छोड़े बिना व्यू बदलें", b: "टैब से उसी कंपनी के Financials, Valuation, Growth, News, Filings, Earnings, Peers और AI analyst के बीच जाएँ।" },
      ask: { t: "एक सवाल मुफ़्त", b: "AI विश्लेषक लाइव भाव, दाखिल दस्तावेज़, समाचार और मैक्रो डेटा से जवाब देता है और हर आंकड़े का स्रोत बताता है। बिना खाते के आपको एक सवाल मिलता है, जिससे आप देख सकते हैं कि यह कैसे सोचता है। आगे पूछने के लिए मुफ़्त खाता बनाएँ।" },
      pick: { t: "कंपनी चुनें", b: "नाम या टिकर लिखें, जैसे Apple या AAPL, और सूची से चुनें।" },
      askai: { t: "इस कंपनी के बारे में पूछें", b: "Ask AI दबाने पर रिसर्च एजेंट {symbol} के लिए पहले से तैयार खुलता है।" },
      gohold: { t: "अपनी होल्डिंग खोलें", b: "My Portfolio के अंतर्गत Holdings & ledger चुनें और अपनी हर पोज़िशन देखें।" },
      answer: { t: "जवाब पढ़ें", b: "हर आँकड़े के साथ उसका प्रमाण दिया गया है। आराम से पढ़ें, फिर आगे बढ़ें।" },
      discover: { t: "सिर्फ़ खोजें नहीं, नए विचार पाएँ", b: "समझ नहीं आ रहा किस पर शोध करें? Sector rotation दिखाता है कि पैसा कहाँ बह रहा है। Macro & markets और AI research agent आपको और आगे ले जाते हैं।" },
      finish: { t: "आपका कार्य-प्रवाह", b: "खोजें, शोध करें, होल्डिंग्स देखें, प्रदर्शन पर नज़र रखें। खुलकर देखें। यह टूर आप Preferences या मेनू के नीचे से कभी भी दोबारा चला सकते हैं।", wf: ["खोजें", "शोध", "होल्डिंग्स", "प्रदर्शन"] },
    },
  },
  vi: {
    ui: { next: "Tiếp", askpill: "Gửi câu hỏi để xem chuyên gia phân tích làm việc.", act: "Đến lượt bạn: chạm hoặc nhấp vào vùng được đánh dấu. Phần giới thiệu sẽ tự chuyển tiếp.", tryit: "Hãy thử ngay: nhập câu hỏi vào khung được đánh dấu rồi gửi.", back: "Quay lại", skip: "Bỏ qua", finish: "Bắt đầu khám phá", label: "Giới thiệu nhanh", step: "Bước {n} trên {total}", replay: "Xem lại phần giới thiệu", replayHead: "Giới thiệu nhanh", replayText: "Hướng dẫn một phút về tìm kiếm, điều hướng, vị thế và nghiên cứu.", explore: "Tiếp tục khám phá", account: "Tạo tài khoản miễn phí", palette: "Xem giới thiệu nhanh" },
    steps: {
      welcome: { t: "Chào mừng đến với LEKHA Financials", b: "Không gian làm việc để nghiên cứu doanh nghiệp, theo dõi các vị thế đang nắm giữ và xem danh mục của bạn đang ra sao. Phần giới thiệu này mất khoảng một phút." },
      search: { t: "Bắt đầu từ tìm kiếm", b: "Tìm bất kỳ công ty, ETF, chỉ số hay tiền mã hóa nào theo tên hoặc mã, cùng hồ sơ công bố, tin tức và các trang. Nhấn {key} ở bất cứ đâu.", a: "Chạm vào đây để tìm bất kỳ công ty, ETF, chỉ số hay tiền mã hóa nào, cùng hồ sơ công bố, tin tức và các trang." },
      nav: { t: "Tìm đường trong ứng dụng", b: "Menu gồm My Portfolio, Research, Simulation, Macro & markets, Deep analysis và Sector rotation. Mở một nhóm để xem các trang bên trong.", a: "Chạm vào nút menu để mở các mục: My Portfolio, Research, Simulation, Macro & markets, Deep analysis và Sector rotation." },
      summary: { t: "Danh mục của tôi đang ra sao?", b: "Tổng giá trị, biến động hôm nay, lãi/lỗ chưa thực hiện và mức cách đỉnh 1 năm, gọn trong một hàng." },
      performance: { t: "So với thị trường", b: "Biểu đồ này đặt danh mục của bạn cạnh S&P 500 và Nasdaq. Chuyển sang chế độ giá trị và chọn khoảng thời gian từ 1M đến 1Y." },
      holdings: { t: "Mọi vị thế bạn đang nắm giữ", b: "Giá trị, tỷ trọng, biến động trong ngày và lãi/lỗ của từng vị thế. Nhấp vào tiêu đề cột để sắp xếp, hoặc vào một dòng để xem phân bổ theo nhà môi giới và biểu đồ giá.", a: "Tự thêm vị thế đầu tiên hoặc nhập sao kê từ nhà môi giới. Mọi thứ còn lại đều được tính từ đó." },
      company: { t: "Nghiên cứu bất kỳ công ty nào", b: "Tìm kiếm sẽ đưa bạn đến đây. Mỗi công ty có một không gian riêng: giá, các tỷ số chính, hồ sơ và tin tức. {symbol} được dùng làm ví dụ." },
      tabs: { t: "Đổi chế độ xem mà không mất vị trí", b: "Các thẻ chuyển qua Financials, Valuation, Growth, News, Filings, Earnings, Peers và AI analyst của cùng một công ty." },
      ask: { t: "Một câu hỏi miễn phí", b: "Chuyên gia AI trả lời từ giá trực tiếp, hồ sơ nộp cơ quan quản lý, tin tức và dữ liệu vĩ mô, và trích dẫn mọi nguồn. Bạn có một câu hỏi mà không cần tài khoản, đủ để thấy nó lập luận thế nào. Tạo tài khoản miễn phí để tiếp tục." },
      pick: { t: "Chọn một công ty", b: "Nhập tên hoặc mã, ví dụ Apple hoặc AAPL, rồi chọn trong danh sách." },
      askai: { t: "Hỏi về công ty này", b: "Ask AI mở trợ lý nghiên cứu đã hướng sẵn tới {symbol}." },
      gohold: { t: "Mở danh mục nắm giữ", b: "Chọn Holdings & ledger trong My Portfolio để xem mọi vị thế bạn đang giữ." },
      answer: { t: "Đọc câu trả lời", b: "Mỗi con số đều trích dẫn bằng chứng đứng sau. Cứ đọc thong thả rồi tiếp tục." },
      discover: { t: "Khám phá, không chỉ tra cứu", b: "Chưa biết nên nghiên cứu gì? Sector rotation cho thấy dòng tiền đang đi đâu. Macro & markets và AI research agent giúp bạn đi sâu hơn." },
      finish: { t: "Quy trình gợi ý", b: "Tìm kiếm, nghiên cứu, xem lại vị thế, theo dõi hiệu suất. Cứ thoải mái khám phá. Bạn có thể xem lại phần giới thiệu này từ Preferences hoặc cuối menu.", wf: ["Tìm kiếm", "Nghiên cứu", "Vị thế", "Hiệu suất"] },
    },
  },
  fr: {
    ui: { next: "Suivant", askpill: "Envoyez votre question pour voir l'analyste à l'œuvre.", act: "À vous : touchez ou cliquez la zone en surbrillance. La visite continue toute seule.", tryit: "Essayez maintenant : saisissez une question dans la zone en surbrillance et envoyez-la.", back: "Retour", skip: "Passer la visite", finish: "Commencer à explorer", label: "Visite rapide", step: "Étape {n} sur {total}", replay: "Rejouer la visite", replayHead: "Visite rapide", replayText: "Un parcours guidé d'une minute : recherche, navigation, positions et analyse.", explore: "Continuer à explorer", account: "Créer un compte gratuit", palette: "Faire la visite rapide" },
    steps: {
      welcome: { t: "Bienvenue sur LEKHA Financials", b: "Votre espace pour analyser des entreprises, suivre vos positions et voir comment se porte votre portefeuille. Cette visite dure environ une minute." },
      search: { t: "Commencez par la recherche", b: "Trouvez une entreprise, un ETF, un indice ou une cryptomonnaie par nom ou symbole, ainsi que des dépôts réglementaires, des actualités et des pages. Appuyez sur {key} depuis n'importe où.", a: "Touchez ici pour trouver une entreprise, un ETF, un indice ou une cryptomonnaie, ainsi que des dépôts, des actualités et des pages." },
      nav: { t: "Vous repérer", b: "Le menu comprend My Portfolio, Research, Simulation, Macro & markets, Deep analysis et Sector rotation. Ouvrez un groupe pour voir ses pages.", a: "Touchez le bouton de menu pour ouvrir les sections : My Portfolio, Research, Simulation, Macro & markets, Deep analysis et Sector rotation." },
      summary: { t: "Comment se porte mon portefeuille ?", b: "Valeur totale, variation du jour, plus ou moins-value latente et écart par rapport au plus haut sur 1 an, sur une seule ligne." },
      performance: { t: "Comparez-vous au marché", b: "Ce graphique compare votre portefeuille au S&P 500 et au Nasdaq. Passez à la vue valeur et choisissez une période de 1M à 1Y." },
      holdings: { t: "Toutes vos positions", b: "Valeur, poids, variation du jour et gain ou perte de chaque position. Cliquez sur un en-tête de colonne pour trier, ou sur une ligne pour voir la répartition par courtier et le graphique de prix.", a: "Ajoutez votre première position à la main ou importez un relevé de courtier. Tout le reste en est calculé." },
      company: { t: "Analysez n'importe quelle entreprise", b: "La recherche vous mène ici. Un espace par entreprise : cours, ratios clés, profil et actualités. {symbol} sert d'exemple." },
      tabs: { t: "Changez de vue sans perdre votre place", b: "Les onglets parcourent Financials, Valuation, Growth, News, Filings, Earnings, Peers et l'AI analyst pour la même entreprise." },
      ask: { t: "Une question offerte", b: "L'analyste IA répond à partir des cours en direct, des documents déposés, de l'actualité et des données macro, en citant chaque source. Vous avez une question sans compte, de quoi voir comment il raisonne. Créez un compte gratuit pour continuer." },
      pick: { t: "Choisissez une entreprise", b: "Saisissez un nom ou un ticker, par exemple Apple ou AAPL, puis choisissez-la dans la liste." },
      askai: { t: "Posez une question sur cette entreprise", b: "Ask AI ouvre l'agent de recherche déjà centré sur {symbol}." },
      gohold: { t: "Ouvrez vos positions", b: "Choisissez Holdings & ledger sous My Portfolio pour voir chaque position que vous détenez." },
      answer: { t: "Lisez la réponse", b: "Chaque chiffre cite les éléments qui le fondent. Prenez votre temps, puis continuez." },
      discover: { t: "Découvrez, ne vous contentez pas de chercher", b: "Pas d'idée de ce qu'il faut étudier ? Sector rotation montre où va l'argent. Macro & markets et l'AI research agent vont plus loin." },
      finish: { t: "Votre méthode de travail", b: "Rechercher, analyser, passer en revue vos positions, suivre la performance. Explorez librement. Vous pouvez rejouer cette visite depuis Preferences ou le bas du menu.", wf: ["Rechercher", "Analyser", "Positions", "Performance"] },
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
const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : s)
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
