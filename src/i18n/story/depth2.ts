import type { StoryCatalog } from './types';

/**
 * The depth pass, completed — the templates the first overlay (`depth.ts`) reached only with
 * `want`/`waiting`. Merged AFTER `depth.ts` in `index.ts`, so anything here wins.
 *
 * Every story now carries the full page vocabulary:
 *  - `stake` — the thing at hazard, named in objects, never in numbers;
 *  - `regard.*` — how the named person stands toward the throne, where there is one. The
 *    institution stories (assembly, counting-house, the sickness, the salt road, the
 *    thirteenth, the flood, the riot) deliberately have none — their subject is a room, a
 *    road, a river, and pretending otherwise would put a face on a thing that has none;
 *  - scene-depth prose for each story's pivot — the card the player answers and the beat
 *    that lands the consequence. Whispers stay short on purpose: a whisper is a rumour, and
 *    rumours that arrive as paragraphs stop being believable.
 *
 * Vietnamese is the source; English is derived.
 */

export const depth2Vi: Record<string, StoryCatalog> = {
  'five-days': {
    stake: 'Kinh thành — và lời hứa mùng bảy ăn Tết ở đó.',
    'regard.sworn': 'Ông ta đã hứa với quân một ngày cụ thể. Người hứa ngày cụ thể thì không ngủ.',
    'regard.rested': 'Ông ta không nhắc chuyện ấy nữa. Nhưng mỗi lần thấy đèn lồng, ông ta nhìn hơi lâu.',
    'crown-yourself-and-go.body': 'Ông ta trải bản đồ xuống chiếu, đặt chén rượu chặn bốn góc. "Đường ra bắc dài hơn số ngày ta có. Đi thì đi đêm nay — lên ngôi trước, ở ngay gò này, rồi đi luôn. Và phải hứa với quân một câu cụ thể: mùng bảy, ăn Tết ở Thăng Long." Ông ta ngẩng lên. "Quân không đi vì lệnh. Quân đi vì cái ngày ấy."',
    'ngoc-hoi.body': 'Hàng đầu tới nơi lúc trời chưa sáng, rơm còn quấn quanh chân voi cho êm bước. Đèn trong trại {rival} vẫn treo — đèn Tết, thắp cho một cuộc chiến mà họ tưởng còn cách xa năm ngày. Tới sáng thì không còn trại nào cả, và lời hứa kia được giữ đúng từng chữ.',
    'the-festival-passes.line': 'Hội tan. Bánh đã hết, đèn đã hạ. Bên kia sông, trại {rival} cũng vừa dọn xong — họ dùng mấy ngày ấy đúng như ta: để nghỉ.',
  },
  'ghost-south': {
    stake: 'Một viên tướng trong tay giặc — và cái giá mà cả hai bên đang đo.',
    'regard.captive': 'Ông ta ở trong trại giặc và không gửi ra một lời xin nào. Người không xin là người đã quyết.',
    'regard.ransomed': 'Ông ta về bằng vàng của ngươi, và ông ta biết đúng số cân. Ông ta làm việc như người trả nợ.',
    'regard.rescued': 'Ông ta không kể chuyện trại giặc. Nhưng ai đi cứu ông ta thì từ đó ăn cơm nhà ông ta bất cứ lúc nào.',
    'regard.gone': 'Ông ta không về. Câu ông ta nói thì về — và ở lại lâu hơn bất cứ ai.',
    'what-is-he-worth.body': 'Họ ra giá bằng một lá thư viết tay đẹp, lời lẽ nhã nhặn. Giá không cao — đó mới là chỗ đáng ngại. Quan coi kho đọc xong nói nhỏ: giá này không phải để bán người, giá này là để cân xem kho ta còn bao nhiêu, và ta tiếc ông ấy tới mức nào.',
    'rather-a-ghost-in-the-south.body': 'Họ dọn tiệc, mời ông ta ngồi ghế trên, và nhắc lại tước vương phương bắc lần thứ ba. Ông ta đặt đũa xuống. "Ta thà làm quỷ nước Nam còn hơn làm vương đất Bắc." Ông ta nói to, giữa trại họ, để ai cũng nghe — và để không ai trong trại ấy còn có thể giả vờ chưa nghe.',
  },
  'without-slaughter': {
    stake: 'Một tòa thành còn nguyên — và cách cuộc chiến này sẽ được kể lại.',
    'regard.writing': 'Ông ta viết mỗi ngày một lá, đều như điểm canh. Ông ta tin chữ tới mức đáng sợ.',
    'regard.right': 'Ông ta không nhắc chuyện mình đúng. Ông ta chỉ giữ nếp cũ: mỗi việc lớn, viết trước một lá thư.',
    'regard.silent': 'Ông ta thôi viết thư. Bút nghiên vẫn trên bàn, nhưng ông ta thôi viết.',
    'an-orderly-withdrawal.body': 'Tướng giữ thành xin ba điều: rút quân về nước có hàng lối, cấp lương đủ tới biên, và một lời thề không quay lại. Đổi lại, thành giao nguyên vẹn — kho, tường, sổ sách. {hero} đặt lá thư xuống: "Đánh thì thắng. Nhưng thắng kiểu ấy phải đốt, và cái gì đốt rồi thì mình phải tự xây lại."',
    'the-proclamation.body': '{hero} viết một bài cáo. Nó dài, và không có một câu nào khoe công. Có một câu được đọc đi đọc lại nhiều nhất: đem đại nghĩa để thắng hung tàn, lấy chí nhân mà thay cường bạo. Người chép bài ấy nói tay mình run — không phải vì sợ, vì biết mình đang chép cái sẽ còn lại lâu hơn cả triều này.',
  },
  delayer: {
    stake: 'Một trận đánh — thứ họ cần và ngươi không cần.',
    'regard.mocked': 'Ông ta nghe đủ mọi biệt danh người ta đặt. Ông ta ghi lại vài cái, nói để sau này ai đúng thì khắc lên bia.',
    'regard.vindicated': 'Ông ta không nhắc chuyện cũ. Nhưng trong quân, gọi "Kẻ Trì Hoãn" giờ là một cách chào.',
    'regard.overruled': 'Ông ta ra trận theo lệnh, đứng đúng chỗ được giao. Ông ta không nói "đã bảo mà" — và cả triều đều nghe thấy cái im lặng ấy.',
    'do-not-give-them-a-battle.body': 'Ông ta chỉ xuống cánh đồng trống: "Chỗ này là chỗ của họ. Ngựa của họ, hàng ngũ của họ, một buổi sáng là xong. Họ cần một trận — lương họ chỉ còn đủ để thắng nhanh. Ta thì không cần trận nào cả. Ta chỉ cần đi theo, giữ trên cao, và đếm số bếp lửa của họ ít dần mỗi tối."',
    'the-delayer-was-right.body': 'Không có trận nào cả. Một sáng, trại họ chỉ còn cọc và tro. Quân đi theo đếm được những gì họ bỏ lại dọc đường về: xe gãy, giáp nặng, và người. Kẻ Trì Hoãn nghe báo xong chỉ hỏi một câu — bếp lửa tối qua còn bao nhiêu — rồi mới cho quân đuổi.',
  },
  sickness: {
    stake: 'Cổng thành {land} — và mọi con đường lương đi qua nó.',
    'shut-the-gates.body': 'Thầy thuốc già vẽ phấn lên cửa từng nhà có người sốt: ba vạch, rồi bảy vạch, rồi thôi không đếm bằng vạch nữa. Dịch chưa ra khỏi tường thành {land}. Đóng cổng thì nó ở lại trong ấy — cùng với người trong ấy, cùng với chợ, cùng với những nhà chưa có vạch phấn nào.',
    'it-is-in-the-army-now.body': 'Nó không ở lại {land}. Nó đi theo đường quân lương — nằm trong xe thóc, đi cùng phu gánh, qua trạm canh mà không ai khám được nó. Doanh đầu tiên báo sốt là doanh đóng xa {land} nhất, và đó là cách ta biết nó đã đi hết đường.',
  },
  'mountain-water': {
    stake: 'Một mùa người và một kho gỗ — đổi lấy chỗ đứng khi nước lên.',
    'the-year-it-does-not-hold.body': 'Nước không dừng ở đâu cả. Nó lên qua vạch cũ, qua vạch mới, qua cái gờ mà ông già làng nói cả đời chưa thấy nước chạm. {land} còn lại mái đình và ba cây gạo. Người thì lên đồi kịp — vì có người tin lời ông già mà đi từ đêm trước.',
  },
  'salt-road': {
    stake: 'Giá muối trong bếp mọi nhà — và điều đang ngồi trên con đường ấy.',
    'a-camp-nine-seasons-old.body': 'Không phải cướp. Toán đi xem về vẽ lại: hàng rào gỗ hai lớp, ruộng rau bên trong, giếng đào sâu — một cái trại dựng từ chín mùa trước, đủ lâu để thành một cái làng có vũ khí. Nó ngồi ngay trên đường muối, và nó không giấu nữa, vì nó đã đủ lớn để không cần giấu.',
    'the-road-is-still-shut.body': 'Không ai lên xem. Muối trong kho các nhà vơi dần theo cùng một tốc độ, nên chẳng có ngày nào đáng gọi là ngày mất con đường ấy. Rồi {land} thôi gửi thuế. Không ai giải thích, vì không ai hỏi — và đó là phần đáng chép nhất của chuyện này.',
  },
  thirteenth: {
    stake: 'Thuế của {land} — và những trấn đang đứng nhìn theo.',
    'give-them-a-governor-of-their-own.body': 'Sổ trạm chép rõ: lệnh từ kinh xuống {land} đi một mùa, về một mùa. Hai mùa cho một câu hỏi. {land} thôi hỏi từ lâu — họ tự xử, xử được việc, và dân bên ấy khen quan bên ấy chứ không khen ngươi. Giờ chọn: cho họ cái tên đúng với việc họ đang làm, đóng thêm quân, hay nhắc họ ai là vua.',
    'the-thirteenth.body': '{land} dựng cờ riêng. Không có trận nào — họ chỉ thôi gửi thuế, thôi gửi sổ, thôi gửi người về chầu. Cờ may bằng vải chợ, chữ thêu vụng. Nhưng các trấn bên cạnh không nhìn đường kim — họ nhìn xem cờ ấy đứng được mấy mùa.',
    'they-send-the-tax-anyway.line': '{land} gửi thuế lên, dù không còn phải gửi. Kèm một lá thư ngắn: "Đường về kinh xa quá nên trước nay chậm, chứ không phải không muốn gửi." Thư không ký tên một người — ký tên cả trấn.',
  },
  'sixty-five-citadels': {
    stake: 'Sáu mươi lăm tòa thành đã theo một người — và điều sẽ tới khi phương bắc trả lời.',
    'regard.named': 'Người ta gọi bà bằng cái tên ngươi ban. Bà nhận nó như nhận một chỗ đứng trong hàng — rồi đứng lên đầu hàng.',
    'regard.watching': 'Bà chưa xin gì. Người chưa xin gì là người đang đếm xem ai sẽ tới lúc khó.',
    'regard.alone': 'Bà không trách. Nhưng trong danh sách những người đã tới, được chép lại rất kỹ, không có tên ngươi.',
    'the-whole-province-has-risen.body': 'Bà ấy cưỡi voi ra trận đầu, tang chồng còn trên áo. Sáu mươi lăm tòa thành theo về trong một mùa — không phải vì bà hứa gì, mà vì bà là người đầu tiên đứng dậy nói câu mà thành nào cũng đang nghĩ. Giờ sứ của bà đứng dưới thềm, hỏi một câu ngắn: theo, giúp, hay đứng nhìn.',
    'he-comes.body': 'Phương bắc không gửi thư trả lời. Họ gửi một ông tướng già đã dẹp yên chỗ khác cả đời, cùng số quân đúng bằng việc ông ta định làm. Ông ta đi chậm, đắp đường tới đâu chắc tới đó — kiểu đi của người không định quay về tay không.',
  },
  'ride-the-wind': {
    stake: 'Câu bà ấy nói — cưỡi gió đạp sóng — và bao nhiêu người sẽ tin câu ấy.',
    'the-lady-in-gold.body': 'Bà mặc giáp vàng ra trận, cưỡi voi, đúng như lời đồn — và lời đồn là một nửa sức mạnh của bà. Quân theo bà đông hơn sổ ghi. Triều thần chia đôi: một nửa nói đó là mũi giáo sắc nhất của ngươi, nửa kia nói không ai giữ được một mũi giáo tự bay.',
    'at-the-head-of-the-coalition.body': 'Liên quân các trấn dựng cờ, và cờ đi đầu là cờ của bà — không ai bàn, tự nó thành thế. Bà không xưng gì cả, và chính vì thế mà không ai dám xưng trước bà. Từ chỗ ngươi ngồi nhìn ra, đội quân ấy hoặc là bức tường chắn phương bắc, hoặc là triều đình thứ hai.',
  },
  substitution: {
    stake: 'Một chiếc áo bào — và người nào sẽ mặc nó ra cửa nam.',
    'regard.remembered': 'Tên ông ấy đọc trước tên ngươi trong mọi lễ. Ngươi giữ đúng lệ ấy, và cả triều biết vì sao.',
    'regard.unasked': 'Không ai được hỏi câu ấy. Những người lẽ ra bị hỏi đều biết — và họ nhìn ngươi khác đi một chút, theo cả hai nghĩa.',
    'they-know-which-banner-is-yours.body': 'Vòng vây khép ba mặt, và họ biết cờ nào là cờ của ngươi. Đêm ấy trong trướng, câu hỏi được đặt xuống bàn như một vật: cần một người mặc áo bào của ngươi, cầm cờ của ngươi, đi ra cửa nam — về hướng ngược lại. Không ai được chỉ định. Chỉ định là giết; việc này phải là xin đi.',
    'his-name-is-read-first.line': 'Trong lễ, tên ông ấy đọc trước tên ngươi. Lệ ấy do ngươi đặt, và năm nào cũng có người mới hỏi vì sao — để năm nào cũng có người cũ kể lại.',
  },
  'borrowed-sword': {
    stake: 'Thanh gươm trong lưới — và cái nghĩa của chữ "mượn".',
    'regard.armed': 'Ông ta đeo thanh gươm ấy như đeo một món nợ. Đánh trận nào cũng như trả một phần.',
    'regard.kept': 'Ông ta không nói gì việc giữ gươm. Nhưng ông ta thôi ra bờ hồ, và ai để ý thì thấy.',
    'regard.lightened': 'Trả gươm xong, ông ta nói mình nhẹ. Người nói mình nhẹ là người từng biết nó nặng thế nào.',
    'a-blade-in-the-net.body': 'Lưới kéo lên nặng bất thường. Trong lưới không có cá — có một thanh gươm, nước hồ không làm gỉ, chuôi vừa tay như đo sẵn. Người kéo lưới không dám cầm. {hero} cầm, và nói lưỡi nó ấm. Đêm ấy ai cũng hiểu cùng một điều mà không ai nói: thứ này không phải của mình. Thứ này là cho mượn.',
    'the-turtle-surfaces.body': 'Hồ lặng như mặt sổ chưa ghi. Rồi con rùa nổi lên, già hơn mọi thứ quanh nó, và nhìn thẳng vào thuyền ngự — kiểu nhìn của chủ nợ tử tế: không đòi, chỉ nhắc. Cả thuyền im. Thanh gươm bên hông ngươi bỗng nặng hơn bình thường.',
    'what-was-lent-is-taken.body': 'Không ai trả thì chủ tự lấy. Gươm rời khỏi vỏ giữa ban ngày, sáng một vệt qua mặt hồ, và nước khép lại không một gợn. Không ai gọi đó là mất trộm. Ai cũng hiểu đó là đòi nợ — và hiểu luôn rằng từ nay đánh trận bằng sức của chính mình.',
  },
  'cham-engineer': {
    stake: 'Những bản vẽ trong đầu một người tù — và phía nào sẽ dựng được chúng trước.',
    'regard.drawing': 'Ông ấy vẽ bằng que lên đất, xóa đi mỗi tối. Người vẽ rồi xóa là người còn chưa quyết cho ai xem.',
    'regard.gone': 'Ông ấy về quê bằng đường ngươi cấp. Trước khi đi, ông ấy để lại một bản vẽ đủ rõ để dựng — coi như tiền đường.',
    'the-first-engine.body': 'Cái máy đầu tiên dựng xong trong sân, cao hơn tường, và ném được một bao cát qua ba nóc nhà. Thợ của ta đứng quanh chép từng chốt gỗ. Ông ấy đứng riêng một góc, nhìn cái máy như nhìn một người quen cũ — rồi hỏi, bằng thứ tiếng học vội: muốn nó ném xa hơn, hay ném đúng hơn?',
    'an-unfamiliar-design.body': 'Thành phía nam báo về một kiểu máy lạ ngoài tường — tay đòn dài hơn thường, chốt buộc kiểu khác. Thợ già xem hình vẽ xong im một lúc, rồi nói: kiểu này giống bài của ông thợ Chàm, nhưng là bài cũ — bản ông ấy dựng cho ta đã sửa chỗ yếu ấy rồi. Câu hỏi còn lại là ai dạy họ bài cũ.',
  },
  assembly: {
    stake: 'Ai viết luật của nước này — căn phòng ấy, hay ngươi.',
    'buy-the-room.body': 'Họ họp ở nhà sau một trại buôn, ghế xếp vòng, không ai ngồi đầu. Danh sách đang viết là luật — thuế đất, lệ chợ, việc mộ phu. Người của ngươi đem về ba giá: mua cả phòng ấy bằng lộc, để họ bỏ phiếu và xem, hoặc khiêng ghế ra đường. Mỗi giá một loại tiền, và loại đắt nhất không nằm trong kho.',
    'the-assembly-voted.body': 'Họ bỏ phiếu. Kiểm ba lần vì chính họ cũng không tin số đếm. Điều họ thông qua chép được trong bốn dòng, và cả bốn dòng đều hợp lý tới mức khó chịu. Từ nay trong nước có hai nơi biết viết luật — và chỉ một nơi từng phải giữ biên giới.',
  },
  'rice-riot': {
    stake: 'Giá gạo ở kinh — và cái tên sẽ được hô to khi nó vỡ.',
    'open-the-stores.body': 'Giá gạo ở chợ kinh lên gấp ba trong một tuần. Đám đông trước kho chưa ném gì cả — họ chỉ đếm xe thóc ra vào, to, cho lính canh nghe. Quan giữ kho hỏi một câu đúng nghề: mở kho thì đủ phát mười ngày, và ngày thứ mười một thì phát gì?',
    'the-carts-run-again.line': 'Xe thóc chạy lại, giá xuống dần. Ở chợ vẫn còn hô tên vài người — nhưng giờ hô nhỏ, và không ai hô trước mặt lính.',
  },
  'no-heir': {
    stake: 'Một cái ngai trống bên kia biên — và ba đạo quân đang vòng quanh nó.',
    'regard.yours': 'Ông ta biết ngai của mình dựng bằng gì. Sứ của ông ta tới đều, quà đúng lễ, và không bao giờ tới tay không.',
    'regard.wary': 'Ông ta thắng mà không cần ngươi, và ông ta nhớ rất rõ điều ấy. Thư từ bên ấy giờ ngắn hơn trước.',
    'let-them-fight-it-out.body': 'Ba ông hoàng, ba đạo quân, một cái ngai — và chưa ai dám ngồi hẳn. Bên ấy càng đánh nhau lâu, biên của ta càng yên. Nhưng quan trấn biên gửi về một câu đáng đọc hai lần: khi nhà bên cạnh cháy, đừng chỉ đứng xem lửa — gió đổi chiều nhanh lắm.',
    'the-realm-comes-apart.body': 'Không ai thắng. Nước bên ấy tách thành ba mảnh, mỗi mảnh một vua nhỏ, và ba cái biên mới của ta thay cho một cái cũ. Biên cũ có sổ, có lệ, có người quen mặt. Ba biên mới thì chưa có gì ngoài cỏ.',
    'they-make-peace-to-deal-with-you.body': 'Họ giảng hòa. Không phải vì hết giận nhau — vì cả ba cùng nhìn sang bên này và thấy một nước nguyên vẹn đang xem họ chia nhỏ. Hòa ước của họ có đúng một điều khoản chung, và điều khoản ấy có tên của ngươi.',
  },
  'eat-together': {
    stake: 'Một lời thề giữa hai người — và cái lệ nó đặt ra cho cả triều.',
    'regard.inseparable': 'Hai người ấy ăn cùng mâm đủ lâu để lính gác đổi ca theo bữa của họ. Hỏi một người, người kia trả lời được.',
    'regard.alone': 'Người còn lại vẫn dọn hai bát. Không ai dám nhắc, và người ấy cũng không cần ai nhắc.',
    'sworn.body': 'Hai người xin thề ở miếu, có chứng, có lễ — sống cùng cờ, chết cùng ngày. Quan giữ lễ hỏi nhỏ: cho họ thề thì từ nay điều họ nói với nhau đi trước điều họ nói với triều; tách họ ra thì được hai người giỏi, mất một thứ mà cả đời quan chưa thấy lần thứ hai.',
    'one-of-them-is-gone.line': 'Một người đi rồi. Người còn lại vẫn dọn hai bát mỗi bữa, ăn xong úp một bát khô. Việc quân người ấy làm không sót một li nào — chỉ có bữa cơm là làm cho hai người.',
  },
  unpaid: {
    stake: 'Ba mùa lương chưa trả — và ngày ngươi phải gọi tới những người ấy.',
    'regard.patient': 'Họ không kêu. Sổ của họ vẫn đều nét, cột chưa trả được ghi bằng mực đỏ, thẳng hàng.',
    'regard.squared': 'Trả xong, không ai cảm ơn. Họ chỉ khép sổ đỏ lại — và giữ nó, không đốt.',
    'clear-the-arrears.body': 'Viên thơ lại già nhất trải sổ ra: ba mùa lương chưa trả, ghi bằng mực đỏ, từng người từng dòng. Ông ấy không xin. Ông ấy chỉ để ngón tay lên cột cuối — cột ngày — và nói: mực đỏ để lâu quá thì tự nó thành một loại giấy tờ khác.',
    'they-will-not-march.body': 'Lệnh điều quân phát xuống, và không ai nhúc nhích. Không ai to tiếng, không ai vứt giáo — họ chỉ đứng nguyên tại chỗ, đều tăm tắp như đang duyệt. Viên đội già nói hộ cả hàng, giọng đúng phép: thưa, người chưa lĩnh lương thì đứng thế này được bao lâu cũng được.',
  },
  granaries: {
    stake: 'Bảy năm cải cách — và lòng dân vào cái ngày cần tới nó nhất.',
    'regard.reforming': 'Ông ta làm việc như người biết mình thiếu thời gian. Mỗi phép mới ban ra, ông ta đã viết sẵn phép sau.',
    'regard.trusted': 'Cả triều ghét ông ta, và ông ta biết. Ông ta chỉ giữ một tờ giấy trong tay áo: lời ngươi nói giữa sân hôm ấy.',
    'regard.dismissed': 'Ông ta về quê, không mang theo sổ sách gì. Nghe nói vẫn dạy học — và học trò ông ta đều giỏi tính.',
    'seven-years.body': 'Bảy năm phép mới: tiền giấy đổi tiền đồng, kho thóc bán ra chia lại, sổ ruộng đo lại từ đầu. Từng phép đều đúng — sổ chứng minh được. Nhưng giặc tới vào năm thứ bảy, và lúc gọi dân ra giữ nước mới biết: phép thì đúng mà lòng người thì chưa kịp theo. Thành đắp bằng đá giữ được; thành đắp bằng lòng dân thì chưa xây xong.',
    'the-granaries-were-sold.body': 'Kho thóc các trấn bán ra theo phép mới, tiền thu về đủ số, sổ đẹp chưa từng thấy. Chỉ có điều dân nhìn cái kho trống mà không nhìn cái sổ đầy. Thóc trong kho là một lời hứa cũ — bán nó đi, dù đúng giá, cũng là bán một lời hứa.',
  },
  'counting-house': {
    stake: 'Kho bạc của nước — và bàn tay nào đang đếm nó.',
    'the-temple-offers.body': 'Nhà chùa xin giữ hộ kho bạc — có tường cao, có người tin, có sổ riêng. Lãi trả đều, và đúng là họ trả đều thật. Quan coi kho nói một câu để đời: kho đặt ở đâu thì nước ở đó. Chùa giữ bạc lâu rồi, người vay sẽ lạy Phật trước khi lạy vua.',
    'gone-in-the-night.body': 'Người đếm kho đi trong đêm, đem theo đúng phần không bao giờ đòi lại được: số má trong đầu ông ta. Kho còn nguyên niêm phong — nhưng từ nay ai muốn biết nước này giàu nghèo tới đâu, phải hỏi một người đang ở đất khác.',
  },
  'dien-hong': {
    stake: 'Một câu hỏi đặt ra trước những người già nhất nước — và câu trả lời sẽ trói cả triều.',
    'the-elders-are-summoned.body': 'Mời bô lão cả nước về điện, đãi yến, rồi hỏi trước mặt nhau một câu duy nhất: đánh hay hòa. Quan can: hỏi là trao. Câu trả lời của họ sẽ trói tay bệ hạ — vì hỏi xong rồi làm ngược, thì thà đừng hỏi. Nhưng cũng chính vì thế mà câu trả lời ấy, nếu là "đánh", sẽ nặng bằng mọi hịch văn cộng lại.',
    'the-realm-was-not-asked.line': 'Không ai được hỏi. Việc định xong trong điện kín, và ngoài chợ người ta biết đúng một điều: mình không được hỏi.',
  },
  orange: {
    stake: 'Một đứa trẻ bị chặn ngoài cửa điện — và sáu trăm người tin nó hơn tin cái cửa.',
    'regard.seated': 'Được ngồi trong điện rồi, nó nói ít nhất phòng. Nó để dành lời — nó biết mình được vào bằng cái gì.',
    'regard.dismissed': 'Nó vái đúng lễ rồi đi. Vết cam trên cổ tay áo nó, nó không giặt.',
    'regard.risen': 'Cờ nó thêu sáu chữ, chữ vụng. Sáu trăm người dưới cờ ấy không ai chê đường kim.',
    'he-raises-his-banner.body': 'Nó về, gom sáu trăm người nhà và trai làng, may một lá cờ thêu sáu chữ: phá giặc mạnh, báo ơn vua. Chữ thêu vụng — nó thêu lấy một phần. Người theo nó không ai hỏi tuổi nó nữa. Cái tuổi bị chặn ngoài cửa điện, nó đã dùng hết vào một quả cam.',
    'the-banner-falls.body': 'Cờ sáu chữ ngã ở trận cửa sông. Nó không lùi — người quanh nó kể lại giống nhau tới mức không thể là kể cho đẹp. Sáu trăm người về không đủ số. Lá cờ đem về được, và từ nay chữ "báo ơn vua" nặng hơn mọi tờ chiếu ngươi từng ban.',
  },
  'river-stakes': {
    'regard.measuring': 'Ông ấy đo con nước bằng que tự vót, ghi bằng ký hiệu tự đặt. Hỏi thì đáp; không hỏi thì thôi.',
    'regard.ready': 'Cọc đóng xong hết. Giờ ông ấy chỉ nhìn con nước — và ai đứng cạnh cũng bất giác nhìn theo.',
    'regard.insulted': 'Ông ấy về làng, không nói gì. Bản vẽ con nước ông ấy để lại nguyên trên bàn — như để chứng minh không phải mình sai.',
  },
};

export const depth2En: Record<string, StoryCatalog> = {
  'five-days': {
    stake: 'The capital — and a promise to keep the seventh day of Tết in it.',
    'regard.sworn': 'He promised the men a specific day. A man who promises a specific day does not sleep.',
    'regard.rested': 'He does not bring it up any more. But when he sees lanterns, he looks a moment too long.',
    'crown-yourself-and-go.body': 'He spreads the map on the mat and pins its corners with wine cups. "The northern road is longer than the days we have. If we go, we go tonight — take the crown first, on this very mound, and march from the ceremony. And promise the men something exact: the seventh day of the new year, kept in Thăng Long." He looks up. "Men do not march for orders. They march for that date."',
    'ngoc-hoi.body': 'The front rank arrived before first light, straw still bound to the elephants’ feet to soften the step. The lanterns in {rival}’s camp were still hung — festival lanterns, lit for a war they believed was five days away. By morning there was no camp at all, and the promise was kept to the letter.',
    'the-festival-passes.line': 'The festival ends. The cakes are eaten, the lanterns come down. Across the river, {rival}’s camp has just finished packing — they used those days exactly as we did: to rest.',
  },
  'ghost-south': {
    stake: 'A general in the enemy’s hands — and the price both sides are busy measuring.',
    'regard.captive': 'He sits in their camp and has sent out no request. A man who asks for nothing has already decided.',
    'regard.ransomed': 'He came home bought with your gold, and he knows the exact weight of it. He works like a man repaying a debt.',
    'regard.rescued': 'He tells no stories about the camp. But the men who came for him eat at his table whenever they like, forever.',
    'regard.gone': 'He did not come back. The sentence he spoke came back instead — and it has outstayed everyone.',
    'what-is-he-worth.body': 'The price arrives in a beautifully written letter, very courteous. It is not high — which is the worrying part. The treasurer reads it twice and says quietly: this is not a price for selling a man. This is a sounding line — dropped to measure the depth of your treasury, and the depth of your regard for him.',
    'rather-a-ghost-in-the-south.body': 'They laid a feast, sat him in the place of honour, and offered the northern princedom a third time. He set down his chopsticks. "I would rather be a ghost in the South than a king in the North." He said it loudly, in the middle of their camp, so that everyone heard — and so that no one in that camp could ever again pretend not to have heard.',
  },
  'without-slaughter': {
    stake: 'A fortress taken whole — and the way this war will be told afterwards.',
    'regard.writing': 'He writes one letter a day, regular as the watch drum. He believes in words to a degree that is almost frightening.',
    'regard.right': 'He never mentions having been right. He only keeps his old habit: before any great thing, a letter first.',
    'regard.silent': 'He has stopped writing letters. The brush and ink are still on his desk, but he has stopped.',
    'an-orderly-withdrawal.body': 'Their commander asks three things: to march his men home in ranks, grain enough to reach the border, and to swear never to return. In exchange the fortress passes over intact — stores, walls, registers. {hero} lays the letter down: "Storm it and we win. But that winning has to burn, and what we burn, we must rebuild ourselves."',
    'the-proclamation.body': '{hero} has written a proclamation. It is long, and there is not one line of boasting in it. One sentence is read aloud more than all the others: with great righteousness defeat cruelty; with humanity replace violence. The copyist said his hand shook — not from fear, but from knowing he was copying the thing that would outlast the dynasty.',
  },
  delayer: {
    stake: 'A battle — the thing they need and you do not.',
    'regard.mocked': 'He has heard every name they call him. He wrote a few of them down, saying whoever turns out right can have them carved on the stele.',
    'regard.vindicated': 'He never mentions it. But in the army, "the Delayer" has become a form of greeting.',
    'regard.overruled': 'He took the field as ordered and stood exactly where he was put. He never said "I told you" — and the whole court heard that silence.',
    'do-not-give-them-a-battle.body': 'He points down at the open field: "That ground is theirs. Their horses, their ranks — one morning and it is done. They need a battle: their grain is only enough to win quickly. We need no battle at all. We follow, we keep the high ground, and we count their cook-fires getting fewer every evening."',
    'the-delayer-was-right.body': 'There was no battle. One morning their camp was stakes and ash. The men following counted what they shed on the road home: broken carts, heavy armour, and men. When the report came, the Delayer asked one question — how many cook-fires last night — and only then sent the pursuit.',
  },
  sickness: {
    stake: 'The gates of {land} — and every supply road that passes through them.',
    'shut-the-gates.body': 'The old physician chalks the doors of fevered houses: three marks, then seven, then he stops counting in marks. The sickness has not left the walls of {land}. Shut the gates and it stays inside — with everyone inside, with the market, with the houses that have no chalk yet.',
    'it-is-in-the-army-now.body': 'It did not stay at {land}. It travelled the supply road — riding in the grain carts, walking with the porters, passing the checkpoints no sentry can search it at. The first camp to report fever was the one farthest from {land}, which is how we know it has finished the journey.',
  },
  'mountain-water': {
    stake: 'A season of hands and a yard of timber — against a place to stand when the water rises.',
    'the-year-it-does-not-hold.body': 'The water does not stop anywhere. It passes the old mark, the new mark, the ledge the village elder swore it had never touched in his lifetime. What is left of {land} is a temple roof and three kapok trees. The people reached the hills in time — because some of them believed the old man and left the night before.',
  },
  'salt-road': {
    stake: 'The price of salt in every kitchen — and whatever is sitting on that road.',
    'a-camp-nine-seasons-old.body': 'Not bandits. The party comes back and draws it: double timber palisade, vegetable plots inside, wells dug deep — a camp built nine seasons ago, old enough to have become an armed village. It sits directly on the salt road, and it has stopped hiding, because it is now large enough not to need to.',
    'the-road-is-still-shut.body': 'Nobody went to look. The salt in every storehouse ran down at the same gentle rate, so no single day ever deserved to be called the day the road was lost. Then {land} stopped sending its tax. Nobody explained, because nobody asked — and that is the part of this story most worth writing down.',
  },
  thirteenth: {
    stake: 'The tax of {land} — and the provinces standing beside it, watching.',
    'give-them-a-governor-of-their-own.body': 'The post-station ledger is plain: an order takes one season to reach {land}, one season to come back. Two seasons per question. {land} stopped asking long ago — they decide, they decide well, and their people praise their own magistrate, not you. Now choose: give the thing they are already doing its proper name, send a garrison down, or remind them who rules.',
    'the-thirteenth.body': '{land} has raised its own banner. There is no battle — they have simply stopped sending tax, stopped sending registers, stopped sending men to court. The banner is market cloth, the lettering clumsy. But the neighbouring provinces are not looking at the stitching — they are watching to see how many seasons it stays up.',
    'they-send-the-tax-anyway.line': '{land} sends the tax up anyway, when it no longer has to. With it comes a short letter: "The road to the capital is long, which is why we were ever late — not because we did not wish to send." It is signed by no single person. It is signed by the province.',
  },
  'sixty-five-citadels': {
    stake: 'Sixty-five citadels sworn to one woman — and what arrives when the north answers.',
    'regard.named': 'They call her by the name you granted. She accepted it the way one accepts a place in a line — and then stood at the head of it.',
    'regard.watching': 'She has asked for nothing yet. A person who asks for nothing is counting who will come when it is hard.',
    'regard.alone': 'She lays no blame. But in the list of those who came — and it was written down carefully — your name is not there.',
    'the-whole-province-has-risen.body': 'She rode an elephant into the first battle with her husband’s mourning still on her sleeve. Sixty-five citadels came over in a single season — not for anything she promised, but because she stood up first and said the sentence every one of them was already thinking. Now her envoy stands below the steps with one short question: join, help, or watch.',
    'he-comes.body': 'The north sends no letter in reply. It sends an old general who has spent his whole life pacifying somewhere, with exactly as many men as the work he intends. He moves slowly, building the road firm behind him as he comes — the pace of a man who does not plan to go home empty-handed.',
  },
  'ride-the-wind': {
    stake: 'The sentence she spoke — ride the wind, tread the waves — and how many people will believe it.',
    'the-lady-in-gold.body': 'She takes the field in gold armour, on an elephant, exactly as the rumour says — and the rumour is half her strength. More men follow her than any register records. The court splits down the middle: half say she is the sharpest spear you own, half say nobody owns a spear that flies by itself.',
    'at-the-head-of-the-coalition.body': 'The provinces raise a coalition, and the banner that leads it is hers — nobody debated it, it simply arranged itself. She claims no title, and precisely because of that, nobody dares claim one ahead of her. From where you sit, that army is either the wall against the north — or the second court.',
  },
  substitution: {
    stake: 'One royal coat — and which man will wear it out the south gate.',
    'regard.remembered': 'His name is read before yours at every rite. You keep that rule yourself, and the whole court knows why.',
    'regard.unasked': 'Nobody was ever asked. The men who would have been asked all know it — and they look at you a little differently, in both senses.',
    'they-know-which-banner-is-yours.body': 'The ring is closed on three sides, and they know which banner is yours. That night in the tent the question is set on the table like an object: someone must wear your coat, carry your banner, and ride out the south gate — the wrong way. No one may be appointed. Appointing is killing; this thing has to be volunteered.',
    'his-name-is-read-first.line': 'At the rites, his name is read before yours. You set that rule, and every year somebody new asks why — so that every year somebody old tells it again.',
  },
  'borrowed-sword': {
    stake: 'The blade in the net — and the meaning of the word "lent".',
    'regard.armed': 'He wears that sword the way a man wears a debt. Every battle pays an instalment.',
    'regard.kept': 'He says nothing about the keeping of it. But he has stopped walking by the lake, and anyone paying attention has noticed.',
    'regard.lightened': 'When it was returned he said he felt light. A man who says he feels light is a man who knew exactly how heavy it was.',
    'a-blade-in-the-net.body': 'The net comes up wrong — heavy. Inside is no fish but a sword the lake has refused to rust, the grip fitting the hand like something measured. The fisherman would not touch it. {hero} took it, and said the blade was warm. That night everyone understood the same thing without anyone saying it: this is not ours. This is lent.',
    'the-turtle-surfaces.body': 'The lake lies flat as an unwritten page. Then the turtle surfaces, older than everything around it, and looks directly at the royal barge — the look of a courteous creditor: not demanding, reminding. The whole boat goes quiet. The sword at your hip is suddenly heavier than usual.',
    'what-was-lent-is-taken.body': 'What is not returned, the owner collects. The sword left its scabbard in broad daylight, drew one bright line across the lake, and the water closed without a ripple. Nobody called it theft. Everyone understood it was a debt being called in — and understood, in the same moment, that every battle from now on is fought on our own strength.',
  },
  'cham-engineer': {
    stake: 'The engines in a prisoner’s head — and which side will raise them first.',
    'regard.drawing': 'He draws with a stick in the dirt and rubs it out each evening. A man who draws and erases has not yet decided who may see.',
    'regard.gone': 'He went home by the road you granted. Before leaving he left one drawing complete enough to build — call it the toll.',
    'the-first-engine.body': 'The first engine stands finished in the yard, taller than the wall, and throws a sandbag clear over three rooftops. Our craftsmen circle it, copying every wooden pin. He stands apart, looking at the machine the way one looks at an old acquaintance — then asks, in his hurried new Vietnamese: do you want it to throw farther, or truer?',
    'an-unfamiliar-design.body': 'The southern fortress reports a strange engine outside its wall — the arm longer than usual, the lashings tied another way. The old master craftsman studies the sketch a long moment and says: this is the Chàm engineer’s school, but the old lesson — the one he built us corrects that weakness. The remaining question is who taught them the old lesson.',
  },
  assembly: {
    stake: 'Who writes this country’s laws — that room, or you.',
    'buy-the-room.body': 'They meet in the back room of a trading house, chairs in a circle, nobody at the head. The list they are drafting is law — land tax, market rules, the raising of levies. Your man brings back three prices: buy the whole room with favours, let them vote and watch, or carry the chairs into the street. Each has its own currency, and the dearest one is not kept in the treasury.',
    'the-assembly-voted.body': 'They voted. They counted three times because they did not believe the number themselves. What they passed fits in four lines, and all four are reasonable to an annoying degree. From today this country has two places that know how to write law — and only one of them has ever had to hold a border.',
  },
  'rice-riot': {
    stake: 'The price of rice in the capital — and the name that will be shouted when it breaks.',
    'open-the-stores.body': 'Rice in the capital market has tripled in a week. The crowd at the granary has thrown nothing yet — they are only counting the carts in and out, loudly, for the sentries to hear. The keeper of the stores asks the professional question: open them and we can feed the city ten days. What do we feed it on the eleventh?',
    'the-carts-run-again.line': 'The carts run again and the price eases down. In the market they still shout a few names — but quietly now, and never in front of the watch.',
  },
  'no-heir': {
    stake: 'An empty throne across the border — and three armies circling it.',
    'regard.yours': 'He knows what his throne is built on. His envoys arrive regularly, the gifts are always correct, and they never arrive empty-handed.',
    'regard.wary': 'He won without needing you, and he remembers that with great precision. The letters from that side are shorter than they used to be.',
    'let-them-fight-it-out.body': 'Three princes, three armies, one throne — and none of them has dared to sit all the way down. The longer they fight each other, the quieter our border. But the border commandant sends up a line worth reading twice: when the neighbour’s house is burning, do not simply stand and watch the fire — the wind changes faster than you think.',
    'the-realm-comes-apart.body': 'Nobody won. The realm across the border has come apart into three pieces, each with its small king — and three new borders of ours where one old one used to be. The old border had registers, customs, familiar faces. The three new ones have nothing on them yet but grass.',
    'they-make-peace-to-deal-with-you.body': 'They have made peace. Not because the anger is spent — because all three looked this way at once and saw one whole realm watching them divide. Their treaty has exactly one clause in common, and that clause has your name in it.',
  },
  'eat-together': {
    stake: 'An oath between two people — and the precedent it sets for the whole court.',
    'regard.inseparable': 'Those two have shared a table long enough that the guards change watch by their meals. Ask one a question, and the other can answer it.',
    'regard.alone': 'The one who is left still sets out two bowls. Nobody dares mention it, and the one who is left does not need it mentioned.',
    'sworn.body': 'The two of them ask to swear at the shrine, with witnesses and full rite — same banner in life, same day in death. The master of rites asks quietly: allow it, and from that day what they say to each other comes before what they say to the court. Separate them, and you keep two able officers — and lose a thing this old man has seen exactly once.',
    'one-of-them-is-gone.line': 'One of them is gone. The other still sets two bowls at every meal and turns one down dry at the end. The military work loses nothing — not one measure. Only the meals are still laid for two.',
  },
  unpaid: {
    stake: 'Three seasons of unpaid wages — and the day you will need to call on those men.',
    'regard.patient': 'They do not complain. Their ledgers stay neat; the unpaid column is kept in red ink, ruled straight.',
    'regard.squared': 'When it was paid, nobody said thank you. They simply closed the red ledger — and kept it, unburned.',
    'clear-the-arrears.body': 'The oldest clerk spreads the ledger open: three seasons of wages owed, entered in red, man by man, line by line. He asks for nothing. He only rests one finger on the last column — the dates — and says: red ink left standing long enough becomes a different kind of document.',
    'they-will-not-march.body': 'The marching order goes out, and nobody moves. No shouting, no thrown spears — they simply remain where they stand, in perfect dress, as if on review. The old sergeant answers for the whole rank, tone strictly correct: begging your pardon — unpaid men can stand like this indefinitely.',
  },
  granaries: {
    stake: 'Seven years of reform — and the people’s heart on the one day it is needed.',
    'regard.reforming': 'He works like a man who knows he is short of time. Each new measure he issues, the next is already drafted.',
    'regard.trusted': 'The whole court hates him, and he knows it. He keeps one paper in his sleeve: the thing you said in the courtyard that day.',
    'regard.dismissed': 'He went home to his village and took no papers with him. They say he teaches now — and his students are all uncommonly good with numbers.',
    'seven-years.body': 'Seven years of new law: paper money for copper, the granaries sold and redistributed, the land registers measured afresh. Every measure was correct — the ledgers can prove it. But the invasion came in the seventh year, and only when the people were called out to hold the country did the truth arrive: the law was right and the people had not yet come with it. The stone walls held. The wall built of people was still unfinished.',
    'the-granaries-were-sold.body': 'The provincial granaries were sold under the new law, the money came in to the last coin, the books have never looked finer. Only — the people look at the empty granary, not at the full ledger. Grain in a granary is an old promise. Selling it, even at a fair price, is selling a promise.',
  },
  'counting-house': {
    stake: 'The treasury of the realm — and whichever hands are counting it.',
    'the-temple-offers.body': 'The temple offers to hold the treasury — high walls, trusted monks, its own ledgers. The interest is paid punctually, and in fairness, it truly is. The keeper of the counting-house says the sentence of his career: the realm lives wherever its treasury lives. Let the temple hold the silver long enough, and borrowers will bow to the Buddha before they bow to the king.',
    'gone-in-the-night.body': 'The counter of the treasury left in the night, taking the one thing that can never be recovered: the numbers in his head. The seals on the vault are unbroken — but from today, anyone wanting to know how rich or poor this realm truly is must ask a man who lives in another country.',
  },
  'dien-hong': {
    stake: 'One question put to the oldest people in the land — and an answer that will bind the whole court.',
    'the-elders-are-summoned.body': 'Summon the elders of the whole country to the palace, feast them, and ask them one question in front of each other: fight, or come to terms. The counsellors object: to ask is to hand over. Their answer will bind your hands — ask and then do the opposite, and you had better never have asked. But for exactly that reason, if the answer is "fight", it will weigh more than every war proclamation ever written.',
    'the-realm-was-not-asked.line': 'Nobody was asked. The matter was settled behind closed doors, and in the markets people know exactly one thing about it: that they were not asked.',
  },
  orange: {
    stake: 'A boy stopped at the palace door — and six hundred people who trust him more than the door.',
    'regard.seated': 'Seated in the council at last, he speaks least of anyone in the room. He is saving his words — he knows what his seat was bought with.',
    'regard.dismissed': 'He bowed correctly and left. The orange stain on his cuff he has not washed out.',
    'regard.risen': 'His banner carries six embroidered characters, clumsily stitched. Not one of the six hundred under it has remarked on the stitching.',
    'he-raises-his-banner.body': 'He went home, gathered six hundred of his household and the village young men, and had a banner sewn with six characters: destroy the strong enemy, repay the king’s grace. The stitching is clumsy — he did part of it himself. Nobody who follows him asks his age any more. The age that was stopped at the palace door, he spent — all of it — on one orange.',
    'the-banner-falls.body': 'The six-character banner went down at the river-mouth battle. He did not step back — the men around him tell it the same way, so exactly the same that it cannot be politeness. Of the six hundred, not all came home. The banner did. And from today, "repay the king’s grace" weighs more than any edict you have ever issued.',
  },
  'river-stakes': {
    'regard.measuring': 'He measures the tide with sticks he whittles himself and marks it in a notation he invented. Ask, and he answers. Do not ask, and he says nothing.',
    'regard.ready': 'The stakes are all driven. Now he only watches the water — and whoever stands beside him finds themselves watching it too.',
    'regard.insulted': 'He went back to his village and said nothing. The tide charts he left lying on the table — as if to prove it was not he who was wrong.',
  },
};
