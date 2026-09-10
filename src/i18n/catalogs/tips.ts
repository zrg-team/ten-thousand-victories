/**
 * Fifty things worth knowing, one at a time.
 *
 * These are the lines shown on a loading screen and on the badge over the front page's play
 * button. Their own catalog rather than another block in `guide`, because the guide explains a
 * *screen* — it is read on purpose, with the screen in front of you — and these are read by
 * somebody who is waiting for something else and did not ask to be taught anything.
 *
 * The rules that keep them useful:
 *
 *  - **Every line is a fact about this game**, with the number it turns on where there is one:
 *    morale breaks near a third, gold rots above 4,000, militia never outnumbers half the people.
 *    A tip that could be printed in any strategy game is filler, and filler is what makes a
 *    player stop reading the ones that are not.
 *  - **One sentence, two at the outside.** The badge is 214 units wide and the loading screen is
 *    gone in a second and a half. A tip that needs a paragraph belongs in How to Play.
 *  - **It says what to do**, not what exists. "A red dot on Army means THREAT is above your
 *    defence" is a tip; "Army shows your hosts" is a label.
 *
 * Keep them in sync with the systems they describe. A tip stating a number that has since been
 * retuned is worse than no tip: it is the game lying to somebody who trusted it.
 */

export const enTips = {
  'tips.label': 'Tip',

  // ── The clock, and what it costs you ────────────────────────────────────────────────────
  'tip.pause': 'Pause is free. Nothing expires while the clock is stopped — no offer withdrawn, no wave slipped past.',
  'tip.noTimer': 'No decision card has a timer. Read it twice; the realm can wait as long as you like.',
  'tip.leaveSaves': 'Leaving a run saves it. Continue on the front page puts you back exactly where you were.',
  'tip.losingPays': 'Losing still banks Legacy. Your first reigns are meant to end badly — they pay for the later ones.',
  'tip.seasons': 'Everything moves in seasons. Raise, build and march before the wave, not while it lands.',

  // ── Reading the run ─────────────────────────────────────────────────────────────────────
  'tip.band': 'POWER is what your realm is worth, THREAT what the next wave is worth. The word between them is the forecast.',
  'tip.advisor': 'The line under the band is your advisor. Tap it for the reasoning and a shortcut to the screen that fixes it.',
  'tip.waveFloor': 'Every wave is bigger than the last, whatever you do. Standing still is falling behind.',
  'tip.ambition': 'Taking ground raises the ambition multiplier once, then it fades. Grab, then digest.',
  'tip.ledger': 'When the numbers fall and you cannot see why, open the Ledger. It names the expense that is growing.',

  // ── The economy ─────────────────────────────────────────────────────────────────────────
  'tip.graft': 'Gold above 4,000 rots at 6% a season. Coin standing still is coin lost — buy walls, men or a province.',
  'tip.food': 'At zero grain every host loses morale and supply, and your people begin to leave.',
  'tip.stores': 'Grain keeps an army alive; stores keep it able to fight. Short of either, it is worth a fraction of its numbers.',
  'tip.people': 'People work the fields, fill the ranks and pay the tax. Every other number comes from that one.',
  'tip.rot': 'Grain and stores spoil above what the realm can hold. Sell the surplus or spend it before the season turns.',
  'tip.taxDial': 'The tax dial trades gold against growth and order. A heavy hand pays now and charges later.',
  'tip.focus': 'A province focus specialises it and sacrifices the rest. Match it to the shortage you have this season.',
  'tip.buildTime': 'A project cannot defend you before it finishes. Read the completion time, not only the price.',
  'tip.buildDot': 'A gold dot on Build means nothing is under construction and you can afford to start something.',
  'tip.market': 'Markets and harbours carry your trade. Selling later lots pays less, so sell before you are desperate.',

  // ── The court ───────────────────────────────────────────────────────────────────────────
  'tip.edicts': 'Edicts are permanent and stack with everything else. They are the cheapest lasting power in a run.',
  'tip.stability': 'Below 35 stability things start going wrong on their own. Lighten the tax before they do.',
  'tip.courtDot': 'A gold dot on Court means edict points are unspent. Unspent points do nothing at all.',
  'tip.doctrine': 'Your doctrine tells the ministers what to build for the rest of the era. Choose it, do not let it default.',
  'tip.courtSeat': 'A court seat helps the whole realm; a governorship helps one province. Post for the effect, not the name.',

  // ── Champions ───────────────────────────────────────────────────────────────────────────
  'tip.idleHero': 'An idle champion still draws wages every season and returns nothing. Post them or let them go.',
  'tip.payroll': 'More champions help only if you can pay them. Check payroll against the seasonal surplus before summoning.',
  'tip.commander': 'Who leads a host matters as much as its size. Look at the commander before you send it anywhere.',
  'tip.codex': 'Whoever founds your dynasty is written into the Codex, and can return to found a later one.',
  'tip.heroesDot': 'A jade dot on Heroes means somebody is sitting idle on your payroll.',

  // ── War, on the map ─────────────────────────────────────────────────────────────────────
  'tip.armyDot': 'A red dot on Army means THREAT is above your defence right now. That is where to go first.',
  'tip.reinforce': 'Reinforcements take seasons to arrive. Raise them before the wave, or they arrive to a lost province.',
  'tip.supplyHost': 'Supply belongs to each host, not to the realm. A full treasury does not feed an army three provinces away.',
  'tip.siegeClock': 'Walls fall on a clock, not at once. Relief that sets out early is worth twice relief that sets out late.',
  'tip.relief': 'Turn a host toward a besieged province and it arrives as relief, straight into the fight.',
  'tip.capital': 'Lose the seat of the dynasty and you have a few seasons to retake it. After that the run is over.',
  'tip.lostGround': 'Ground you lose stays lost, and beaten militia will not hold the next column. Retake it while the window is open.',
  'tip.wallsPeople': 'Walls need people to hold them. A palisade with no watch behind it is decoration.',
  'tip.militiaCap': 'The watch is drawn from the people and never outnumbers half of them. Grow the province to garrison it.',
  'tip.roads': 'Hosts march the drawn roads. A province off the road is a province relief reaches late.',

  // ── Supply lines ────────────────────────────────────────────────────────────────────────
  'tip.supplyBlock': 'Trade compounds only inside one connected block of your ground. Twelve provinces in one piece beat twelve scattered.',
  'tip.supplyCut': 'A province with no route home over your own ground delivers 45%. The map outlines it in broken red.',
  'tip.supplyHops': 'Provinces more than two steps from the capital deliver a little less. Claim toward the seat, not away from it.',
  'tip.supplyNeighbour': 'A province trades best beside your own ground, worst beside a rival. A neutral village on the border is worth more than empty moor.',
  'tip.supplyMarch': 'Hosts march faster over ground you hold. Crossing a rival costs a season and men.',

  // ── Neighbours ──────────────────────────────────────────────────────────────────────────
  'tip.notEverySiege': 'Not every province needs storming. Buy it, marry into it, or win its oath in Affairs.',
  'tip.standing': 'Envoy options open on standing. A warm court is not a pact until you ask and they agree.',
  'tip.alliedAid': 'With standing enough, an ally will send a relief column into a battle you are losing.',
  'tip.affairsDot': 'A red dot on Affairs means someone out there is waiting on an answer from you.',

  // ── The fight itself ────────────────────────────────────────────────────────────────────
  'tip.morale': 'Armies break at about a third morale, not at no men. Being outnumbered is survivable; losing nerve is not.',
  'tip.shapes': 'Every formation beats two others and loses to two. Read the enemy commander’s shout before you answer it.',
  'tip.pips': 'Changing shape spends one of two pips, and a spent pip returns in seconds. While you wait, Hold bleeds least.',
  'tip.stance': 'Press deals half again and takes 40% more. Hold roughly halves both. Steady sits between them.',
  'tip.overtime': 'If the round track fills with neither line broken, overtime grinds morale until one side runs.',
  'tip.handOver': 'Handing a fight to your generals is not a surrender, and you can take the field back whenever you like.',
} as const;

export const viTips = {
  'tips.label': 'Mẹo',

  'tip.pause': 'Tạm dừng không mất gì. Đồng hồ dừng thì không lời mời nào rút lại, không đợt giặc nào lọt qua.',
  'tip.noTimer': 'Không lá quyết định nào có đồng hồ đếm. Cứ đọc kỹ; giang sơn chờ được.',
  'tip.leaveSaves': 'Rời ván là ván được lưu. Bấm Chơi tiếp ở trang đầu là về đúng chỗ cũ.',
  'tip.losingPays': 'Thua vẫn tích được Di Sản. Vài triều đầu vốn để thua — chúng trả giá cho các triều sau.',
  'tip.seasons': 'Mọi thứ chạy theo mùa. Mộ quân, xây dựng và hành quân trước khi giặc tới, đừng đợi lúc giặc đã tới.',

  'tip.band': 'SỨC MẠNH là giá trị giang sơn, HIỂM HỌA là giá trị đợt giặc kế. Chữ ở giữa chính là lời dự báo.',
  'tip.advisor': 'Dòng dưới dải số là quân sư. Chạm vào để xem lý lẽ và đi thẳng tới màn hình xử lý việc ấy.',
  'tip.waveFloor': 'Đợt sau luôn lớn hơn đợt trước, bạn làm gì cũng vậy. Đứng yên là tụt lại.',
  'tip.ambition': 'Chiếm đất làm số nhân tham vọng tăng một lần rồi rụng dần. Cứ lấy, rồi tiêu hóa.',
  'tip.ledger': 'Khi các con số tụt mà không rõ vì sao, hãy mở Sổ sách. Nó chỉ đúng khoản chi đang phình ra.',

  'tip.graft': 'Vàng quá 4.000 hao 6% mỗi mùa. Vàng nằm im là vàng mất — hãy đổi lấy thành, lấy quân, lấy đất.',
  'tip.food': 'Hết lương thì mọi đạo quân tụt sĩ khí và quân nhu, còn dân bắt đầu bỏ đi.',
  'tip.stores': 'Lương nuôi quân sống; quân nhu giúp quân đánh được. Thiếu một trong hai, quân số chỉ còn là con số.',
  'tip.people': 'Dân cày ruộng, dân vào lính, dân đóng thuế. Mọi con số khác đều từ đó mà ra.',
  'tip.rot': 'Lương và quân nhu quá sức chứa sẽ hao hụt. Bán bớt hoặc tiêu đi trước khi sang mùa.',
  'tip.taxDial': 'Nấc thuế đổi vàng lấy dân số và trật tự. Tay nặng thu ngay hôm nay và tính sổ về sau.',
  'tip.focus': 'Trọng tâm trấn giúp một mặt và hy sinh các mặt khác. Chọn theo cái đang thiếu ngay mùa này.',
  'tip.buildTime': 'Công trình chưa xong thì chưa cứu được ai. Đọc thời gian hoàn thành, đừng chỉ đọc giá.',
  'tip.buildDot': 'Chấm vàng ở Xây dựng nghĩa là không có gì đang xây mà bạn thì đủ tiền khởi công.',
  'tip.market': 'Chợ và cảng gánh việc buôn bán. Lô bán sau được giá thấp hơn, nên bán trước lúc túng.',

  'tip.edicts': 'Chiếu chỉ là vĩnh viễn và cộng dồn với mọi thứ. Đó là quyền lực bền rẻ nhất trong một ván.',
  'tip.stability': 'Dưới 35 ổn định là mọi thứ tự hỏng dần. Hãy nới thuế trước khi tới đó.',
  'tip.courtDot': 'Chấm vàng ở Triều đình nghĩa là còn điểm chiếu chỉ chưa dùng. Điểm để không thì chẳng làm được gì.',
  'tip.doctrine': 'Quốc sách bảo các quan xây gì suốt thời đại này. Hãy tự chọn, đừng để nó mặc định.',
  'tip.courtSeat': 'Ghế trong triều giúp cả giang sơn; chức trấn thủ chỉ giúp một trấn. Bổ nhiệm theo hiệu quả, không theo danh tiếng.',

  'tip.idleHero': 'Danh tướng ngồi không vẫn ăn lương mỗi mùa mà chẳng đem về gì. Giao việc, hoặc cho họ đi.',
  'tip.payroll': 'Thêm tướng chỉ lợi khi trả nổi lương. Xem bổng lộc so với dư thừa mỗi mùa trước khi triệu thêm.',
  'tip.commander': 'Ai cầm quân quan trọng ngang với quân đông bao nhiêu. Nhìn chủ tướng trước khi phái đi.',
  'tip.codex': 'Người khai quốc của bạn được ghi vào Danh Lục, và có thể trở lại khai quốc cho một triều sau.',
  'tip.heroesDot': 'Chấm ngọc ở Anh hùng nghĩa là có người đang ngồi không mà vẫn hưởng lương.',

  'tip.armyDot': 'Chấm đỏ ở Quân đội nghĩa là HIỂM HỌA đang vượt phòng thủ. Đó là chỗ phải tới trước.',
  'tip.reinforce': 'Quân bổ sung mất vài mùa mới tới. Mộ trước khi giặc tới, kẻo tới nơi thì trấn đã mất.',
  'tip.supplyHost': 'Quân nhu thuộc về từng đạo quân, không thuộc về kho. Ngân khố đầy không nuôi nổi quân cách ba trấn.',
  'tip.siegeClock': 'Thành vỡ theo đồng hồ chứ không vỡ ngay. Cứu viện đi sớm đáng giá gấp đôi cứu viện đi muộn.',
  'tip.relief': 'Quay một đạo quân về trấn đang bị vây thì họ tới với tư cách viện binh, vào thẳng trận.',
  'tip.capital': 'Mất kinh đô thì chỉ còn vài mùa để lấy lại. Quá hạn ấy là hết ván.',
  'tip.lostGround': 'Đất mất là mất, và dân binh vừa thua không giữ nổi cánh quân kế. Lấy lại khi còn kịp thời hạn.',
  'tip.wallsPeople': 'Thành cần người giữ. Lũy tre không có tuần đinh phía sau chỉ là hàng rào để ngắm.',
  'tip.militiaCap': 'Tuần đinh lấy từ dân và không bao giờ quá nửa số dân. Muốn giữ trấn thì phải nuôi trấn lớn lên.',
  'tip.roads': 'Quân hành theo đường vẽ trên bản đồ. Trấn nằm xa đường là trấn viện binh tới muộn.',

  // ── Đường tiếp vận ──────────────────────────────────────────────────────────────────────
  'tip.supplyBlock': 'Buôn bán chỉ nhân lên trong một khối đất liền nhau. Mười hai phủ liền một dải hơn hẳn mười hai phủ rải rác.',
  'tip.supplyCut': 'Phủ không còn lối về kinh đi trọn trên đất ta chỉ nộp được 45%. Bản đồ viền nó bằng nét đỏ đứt quãng.',
  'tip.supplyHops': 'Phủ cách kinh đô quá hai chặng thì nộp hụt đi một ít. Hãy lấy đất hướng về kinh, đừng lấy xa ra.',
  'tip.supplyNeighbour': 'Phủ buôn bán tốt nhất khi kề đất ta, tệ nhất khi kề đất địch. Một làng trung lập ngoài biên còn hơn bãi hoang.',
  'tip.supplyMarch': 'Quân đi trên đất ta thì nhanh hơn. Băng qua đất địch mất một mùa và mất người.',

  'tip.notEverySiege': 'Không phải trấn nào cũng phải đánh. Mua, kết thân, hoặc thu phục ở trang Ngoại giao.',
  'tip.standing': 'Việc sứ mở theo uy tín. Triều đình thân thiện chưa phải hiệp ước cho tới khi bạn hỏi và họ gật.',
  'tip.alliedAid': 'Đủ uy tín thì đồng minh sẽ phái một cánh viện binh vào trận bạn đang thua.',
  'tip.affairsDot': 'Chấm đỏ ở Ngoại giao nghĩa là ngoài kia có người đang chờ bạn trả lời.',

  'tip.morale': 'Quân vỡ khi sĩ khí còn chừng một phần ba, chứ không phải khi hết người. Ít quân còn sống được; mất nhuệ khí thì không.',
  'tip.shapes': 'Mỗi thế trận khắc hai thế và thua hai thế. Đọc tiếng hô của tướng địch rồi hãy đáp.',
  'tip.pips': 'Đổi thế tốn một trong hai chấm, và chấm đã tiêu vài giây sau tự về. Trong lúc chờ, Cố thủ hao ít nhất.',
  'tip.stance': 'Thúc quân gây thêm nửa phần và chịu thêm 40%. Cố thủ giảm cả hai còn chừng một nửa. Cân bằng nằm giữa.',
  'tip.overtime': 'Hết dãy hiệp mà chưa bên nào vỡ thì trận kéo dài, bào sĩ khí tới khi một bên bỏ chạy.',
  'tip.handOver': 'Giao trận cho các tướng không phải là đầu hàng, và bạn lấy lại quyền chỉ huy lúc nào cũng được.',
} satisfies Record<keyof typeof enTips, string>;
