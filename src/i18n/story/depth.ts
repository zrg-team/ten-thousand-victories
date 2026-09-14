import type { StoryCatalog } from './types';

/**
 * The depth pass: the story page's vocabulary, and the flagship prose raised to standard.
 *
 * Two kinds of key live here, merged OVER the base catalogs (`Object.assign` in index.ts), so a
 * rewrite lands without touching four files and fragment ids never move:
 *
 *  - `want` / `waiting` / `stake` / `regard.*` — the page's headers. `want` is the character's
 *    own ambition in one clause ("wants: a command"), which is most of what turns a title into a
 *    person. `waiting` is what a silent story is watching for, so silence reads as patience
 *    rather than as a bug — the direct fix for "I really don't know what to do... what waiting".
 *  - Prose overrides for the flagships — the buffalo, the three walls, the fisherman at the
 *    gate — written to the four rules: every act a scene, detail instead of adjectives,
 *    characters speak, no act closes clean.
 */

export const depthVi: Record<string, StoryCatalog> = {
  'reed-banner': {
    want: 'được cầm quân',
    waiting: 'Xem {land} có nộp thuế mùa này không.',
    stake: '{land} và hai trấn quanh nó. Lòng dân ở đó đang xuống.',
    'regard.hopeful': 'Nó vẫn mong. Nó chưa nói ra, nhưng nó vẫn mong.',
    'regard.waiting': 'Nó đợi. Người đợi thì đếm, và nó đếm rất kỹ.',
    'regard.cold': 'Nó thôi hỏi. Người thôi hỏi là người đã tự trả lời.',
    'regard.trusted': 'Nó theo ngươi. Không phải vì chức — vì ngươi đã tin nó trước.',
    'regard.humiliated': 'Nó nghe thấy. Cả sân nghe thấy, và nó đứng thẳng lưng mà nghe.',

    'the-buffalo-feast.title': 'Con trâu của người chú',
    'the-buffalo-feast.body': 'Người ta dẫn nó vào sân, hai tay còn lấm bùn ruộng. Mười bốn tuổi, chân đất. Nó chăn trâu ở Uy Viễn, chiều nào cũng bẻ bông lau làm cờ bày trận với lũ trẻ — không bao giờ nhận phe mạnh, nhận phe yếu, rồi thắng. Thắng mãi, đến hôm chúng tôn nó làm tướng. Tướng thì phải khao quân. Nhà không có gì, nên nó mổ con trâu duy nhất của chú nó. Chú nó vác dao đuổi tới tận bờ sông. Bây giờ nó đứng đây, và không ai bảo nó quỳ, và nó cũng không quỳ.',
    'the-buffalo-feast.advice': 'Thưa bệ hạ, nó ăn cắp. Chuyện chỉ có thế.',
    'the-buffalo-feast.take-him-in': 'Nhận nó vào nhà',
    'the-buffalo-feast.take-him-in.d': 'Đền con trâu cho chú nó, bằng tiền của ngươi.',
    'the-buffalo-feast.send-with-rice': 'Cho gạo rồi đuổi về',
    'the-buffalo-feast.send-with-rice.d': 'Đúng phép, và ai cũng hiểu được.',
    'the-buffalo-feast.make-him-repay': 'Bắt nó đền trâu',
    'the-buffalo-feast.make-him-repay.d': 'Luật là luật. Nó sẽ nhớ.',
    'the-buffalo-feast.chronicle': 'Thằng bé mổ trâu khao một đạo quân không có thật, và ngươi đã xử.',
    'the-buffalo-feast.scene': 'Chú nó vác dao đuổi tới tận bờ sông rồi mới thôi, không phải vì nguôi, mà vì hết hơi. Con trâu ấy là cả cơ nghiệp một nhà. Thằng bé không chối, không xin, chỉ đứng nghe kể tội — hai tay còn lấm bùn ruộng, và mắt thì nhìn thẳng vào giữa sân chứ không nhìn xuống đất.',

    'forty-men-mended-the-dyke.line': 'Đê {land} nứt. Quan trên còn bàn lấy gỗ ở đâu thì nó đã gọi bốn mươi người vá xong trước mưa. Không ai trả công. Không ai hỏi vì sao họ đi.',
    'forty-men-mended-the-dyke.chronicle': 'Bốn mươi người vá đê {land}, không ăn lương của ai.',
    'forty-men-mended-the-dyke.scene': 'Con đê ở {land} vỡ từ mùa trước, quan trên hứa hai lần rồi thôi. Bốn mươi người đắp lại trong sáu ngày, không ai gọi, không ai trả công. Người trong làng mang cơm ra ruộng cho họ ăn. Không ai nhắc tới tên {hero} cả — chỉ là bốn mươi người ấy đều là người của nó.',

    'reed-children.line': 'Bông lau ở Uy Viễn lại trắng đồi. Lũ trẻ vẫn bày trận, và vẫn có đứa cầm cờ.',
    'reed-children.chronicle': 'Người ta bắt đầu nhắc tới một thằng bé chăn trâu.',
    'reed-children.scene': 'Ông thợ rèn ở Uy Viễn mất cái đe nhỏ hồi tháng trước, lục cả lò hai lượt không ra, tới hôm lên đồi mới thấy nó chèn dưới chân cây cờ bông lau cho khỏi đổ. Ông để nguyên đấy. Thằng bé cầm cờ hôm ấy vẫn nhận phe ít người hơn, như mọi hôm. Chiều xuống, đứa nào nó bảo về thì về, đứa nào nó bảo ở lại giữ đồi thì ngồi lại, tới lúc trâu tự đi tìm chủ.',
    'three-banners.body': 'Ba trấn mở cổng trong một đêm, không ai đánh nhau. Quân đồn trú ở {land} không chống cự vì quân đồn trú ở {land} chính là những người ấy — bốn mươi người vá đê năm nào, và con cháu họ. Sáng hôm sau trên mặt thành có một lá cờ làm bằng bông lau buộc vào cán tre. Tường thành ấy ngươi xây. Kho thóc ấy ngươi chất đầy.',
    'dai-co-viet.body': 'Những trấn {hero} giữ thôi cần quân đồn trú. Không phải vì chúng an toàn — vì không còn ai ở đó muốn thay đổi gì nữa.',
  },

  'goose-feathers': {
    want: 'về thăm nhà',
    waiting: 'Lá thư tháng này của hắn — và xem áo lông ngỗng còn dày không.',
    stake: 'Cái lẫy của nỏ thần, và con đường từ cửa tây ra biên giới.',
    'regard.correct': 'Hắn đúng phép trong mọi việc. Đúng phép tới mức không ai nhớ nổi một lỗi.',
    'regard.athome': 'Hắn đã quen chỗ này. Quen tới mức thuộc đường hơn cả lính gác.',
    'regard.watched': 'Hắn biết có người nhìn. Hắn không đổi một thói quen nào cả.',

    'a-marriage-offered.body': '{rival} xin kết thân, và gửi một người con trai sang triều. Hắn không nói gì suốt buổi lễ, và khi được hỏi thì trả lời ngắn, đúng phép, bằng thứ tiếng của ta mà hắn nói sõi hơn mức một người mới học nên nói sõi. Đêm ấy hắn xin đi xem thành — vòng ngoài, vòng giữa, vòng trong, ba vòng xoáy như vỏ ốc, đi hết cả ba, chậm, như người ngắm cảnh. Lính gác kể hắn dừng lâu nhất ở chân tường phía tây, chỗ cái cửa nhỏ không ai dùng nữa. Sáng hôm sau hắn khen thành đẹp.',
    'the-gown-grows-thin.line': 'Cái áo lông ngỗng của công chúa vẫn treo trong buồng. Nếu ai đó đi đếm, thì nó đã mỏng đi.',
    'the-gown-grows-thin.chronicle': 'Áo lông ngỗng mỏng đi, và không ai đếm.',
    'the-gown-grows-thin.scene': 'Con hầu quét buồng công chúa nhặt được ba cái lông ngỗng ở bậu cửa, tưởng gió tạt vào, đem bỏ đi. Sáng sau lại ba cái. Nó không thưa với ai, vì thưa thì hoá ra nó để ý. Công chúa vẫn ngồi bên cửa sổ như mọi hôm, tay đặt trong lòng, không làm gì cả. Cái áo treo sau lưng nàng, chỗ vai thì vẫn dày, còn chỗ gấu đã thấy được ánh sáng lọt qua.',
    'feathers-on-the-road.body': 'Dọc đường từ cửa tây ra biên giới có lông ngỗng trắng rải trên đất. Không phải rơi vãi: cách nhau đều đặn chừng một lý, mỗi chỗ một nhúm, nhúm nào cũng nằm bên phải đường theo chiều đi ra. Người báo là một thằng lính trẻ, và nó không hiểu nó vừa báo cái gì — nó chỉ thấy lạ, vì trời không có gió, mà lông thì không tự đi thẳng hàng được.',
    'the-claw-is-changed.body': 'Cái lẫy nằm trong hộp, hộp trong kho, kho có khóa, và khóa vẫn nguyên. Cái nằm trong hộp bây giờ cũng là một mảnh sừng vàng — cùng cỡ, cùng màu, mài cùng kiểu. Nó vừa khít. Nó chỉ không phải cái cũ.',
  },

  granaries: {
    want: 'được ký nốt ba trang cuối',
    waiting: 'Giá gạo trong kinh, và mùa gặt sắp tới.',
    'a-proposal.body': 'Ông ta trình sớ vào buổi chiều không có ai khác trong phòng. Mười hai trang, và ông ta đã tính hết: đo lại ruộng, hạn điền, tiền giấy thay tiền đồng. Ngươi đọc tới trang thứ tư thì thôi. Ông ta biết, và không phật ý: "Ba trang cuối là chỗ khó, thưa bệ hạ. Nhưng bệ hạ không cần đọc. Bệ hạ chỉ cần ký."',
    'the-chancellor-answers.body': 'Kho trống, và trong sổ có chữ ký của ông ta từ mùa đông năm ngoái. Ông ta không chối một câu nào: "Nếu không bán thì năm ngoái đã không có tiền. Năm ngoái không có tiền thì năm nay không còn nước để mà đói." Và ông ta nói đúng. Đó là chỗ tệ nhất.',
  },

  'river-stakes': {
    want: 'nhà vua nên biết về con nước',
    waiting: 'Xem có hạm đội nào vào cửa sông {land}.',
    stake: 'Cửa sông {land}, và cái bãi cọc không ai nhìn thấy lúc triều lên.',
    'the-fishermans-complaint.body': 'Ông ta được dẫn vào vì không ai biết đuổi ông ta đi thế nào — ông ta đã đứng ngoài cửa ba ngày. Ông ta nói về con nước: dài, lộn xộn, có đoạn quay lại kể từ đầu. Đại ý là ở cửa sông chỗ ông ta thả lưới, nước rút xa hơn và nhanh hơn bất cứ ai còn sống từng thấy. Xuân năm ngoái một chiếc thuyền lạ mắc cạn ở bãi ấy, phải chặt cột buồm mới kéo ra được. Ông ta không xin gì cả. Ông ta chỉ nghĩ nhà vua nên biết.',
    'the-ebb.body': 'Thuyền họ vào lúc gần đỉnh triều, hàng một, vì cửa sông hẹp và họ biết nó hẹp. Người trên bờ đếm được, và đếm xong thì thấy con số lớn hơn con số mình muốn nghe. Nước sẽ bắt đầu xuống trong khoảng một canh giờ — không ai nói chắc được, vì con nước không phải thứ nói chắc được.',
  },

  'counting-house': {
    want: 'một chỗ giữ vàng chắc hơn kho của ngươi',
    waiting: 'Con số tháng sau trong quyển sổ không ai được phép xem.',
  },

  'dien-hong': {
    want: 'được hỏi, một lần',
    waiting: 'Xem lòng dân các trấn còn đủ để trả lời không.',
    'the-elders-arrive.line': 'Các cụ tới trước khi trời sáng, đi bộ, có cụ đi ba ngày. Không ai bảo họ mặc gì, nên họ mặc áo tốt nhất của họ, và áo tốt nhất của họ là áo vá.',
    'the-elders-arrive.chronicle': 'Các bô lão về kinh, áo vá, chân đất.',
    'the-elders-arrive.scene': 'Viên quan giữ cửa đếm được bảy mươi hai cụ rồi thôi không đếm nữa. Có cụ chống cây gậy tre mòn vẹt một bên, mòn đúng phía tay quen chống. Nhà bếp dọn nước, tới tuần thứ ba thì hết ấm, phải sang phường bên mượn. Không cụ nào hỏi triều đình định bàn chuyện gì. Các cụ đi ba ngày đường để nói một tiếng, và tiếng ấy thì đã chọn xong từ lúc còn ở nhà.',
    'they-answer.body': 'Cả sảnh đầy các cụ già từ mọi trấn. Câu hỏi đã được đặt ra — đánh, hay hoà — và bây giờ là phần của họ. Cùng một sân, cùng những con người ấy, và chỉ còn chờ một câu. Câu ấy ngươi đã viết từ mười phút trước mà không biết mình đang viết.',
  },

  orange: {
    want: 'được vào phòng họp',
    waiting: 'Xem cửa phòng họp có mở lần nữa không.',
    'juice-on-his-wrist.body': 'Nó đứng ngoài hội nghị đã một canh giờ. Mười sáu tuổi — đủ tuổi cầm gươm, thiếu một tuổi để được vào. Ai đó đưa cho nó quả cam lúc nãy, chắc để nó có việc mà làm. Đến khi người ta gọi nó thì nước cam đã chảy xuống tới cổ tay, và nó không biết. Nó chỉ hỏi một câu: nó không được vào vì nó nhỏ tuổi, hay vì nhà nó nhỏ?',
  },

  'sixty-five-citadels': {
    want: 'một câu trả lời, không phải một lời chia buồn',
    waiting: 'Tin từ phương bắc — và một cái tên không có ngày tháng.',
    'the-whole-province-has-risen.body': 'Người đàn bà tới xin gặp không xưng tước, chỉ xưng tên. Chồng bà bị viên thái thú bên kia giết tháng trước — công khai, giữa chợ, để làm gương. Bà không tới để khóc. Bà hỏi ngươi có định giúp hay không, bằng giọng của người đã biết trước câu trả lời và vẫn hỏi cho đủ lễ. Em gái bà đứng ngoài sân, không vào. Người ta bảo cô ấy mới là người biết đánh trận.',
  },

  'ride-the-wind': {
    want: 'cưỡi gió lớn, đạp sóng dữ',
    waiting: 'Trận sau của bà — và cái tên quân sĩ đặt cho bà.',
    'regard.burning': 'Bà không giận. Bà chỉ nhìn cái kho thóc như nhìn một cái áo chật.',
    'regard.risen': 'Quân theo bà bằng cái tên họ tự đặt. Họ dùng nó cả khi ngươi có mặt.',
    'she-will-not-take-the-post.body': 'Ngươi phong bà coi kho thóc Thanh Hóa — chức tốt, an toàn, nhiều người muốn. Bà đứng dậy giữa buổi chầu, không ai cho phép: "Tôi muốn cưỡi cơn gió mạnh, đạp luồng sóng dữ, chém cá kình ở Biển Đông. Tôi không muốn một cái kho thóc." Rồi bà ngồi xuống, rất bình thường, như vừa nói về thời tiết.',
  },

  substitution: {
    want: 'không ai phải xung phong',
    waiting: 'Đêm xuống, và con nước sông lên.',
    'they-know-which-banner-is-yours.body': 'Trại bị vây ba mặt, mặt còn lại là sông và sông đang lên. Bốn ngày rồi. Chúng biết cờ nào là của ngươi vì cờ ấy vẫn cắm giữa trại — không ai hạ, vì hạ thì quân biết. Và đây là chi tiết người ta hay kể sai: không ai xung phong cả. Người ta đứng đấy, nhìn nhau, và đợi ngươi nói. Việc này không phải việc ai đó tự nhận. Nó là việc phải có người gọi tên.',
  },

  'borrowed-sword': {
    want: 'được trả về chỗ của nó',
    waiting: 'Mặt hồ, và con rùa chưa lặn xuống.',
  },

  slandered: {
    want: 'được hỏi "còn mấy chiếc"',
    waiting: 'Xem ai đã viết lá thư ấy.',
    stake: 'Viên tướng giỏi nhất của ngươi — và mặt biển phía nam.',
    'regard.silent': 'Ông ta không nhắn gì từ trong ngục. Người không kêu oan là người tin ngươi sẽ tự thấy.',
    'regard.spared': 'Ông ta không nhắc ba tháng ấy. Ông ta chỉ hỏi còn mấy chiếc.',
  },

  trusted: {
    want: 'làm nốt việc, như mọi khi',
    waiting: 'Công văn tuần này — và xem nó có qua tay ai khác không.',
    stake: 'Hai đạo quân, ba trấn, một ghế — tất cả trong một bàn tay.',
    'regard.diligent': 'Ông ta làm việc như mọi ngày. Đó là điều đáng yên tâm nhất, hoặc đáng sợ nhất.',
    'regard.passedover': 'Ông ta nhận phần việc nhẹ hơn, không nói gì. Người ta bảo dạo này ông ta ngủ được.',
  },

  'cham-engineer': {
    want: 'gỗ, sắt, và một cái sân',
    waiting: 'Hình vẽ chiều nay dưới nền buồng giam.',
    'drawing-in-the-dirt.body': 'Cai ngục ngại trình vì sợ bị cười. Có một tù binh từ cuộc chiến trước, một tháng nay chiều nào cũng vẽ xuống nền đất buồng giam, vẽ xong xóa đi bằng chân, hôm sau vẽ lại, khác hôm trước. Cai ngục không biết chữ, nhưng ông ta nói một câu rất chính xác: "Thưa, nó vẽ như người nhớ ra chứ không phải như người nghĩ ra."',
  },

  assembly: {
    want: 'sửa lại cái khung, không phải lật cái ngai',
    waiting: 'Danh sách được lập xong — trên đó là luật, không phải tên.',
  },

  'rice-riot': {
    want: 'gạo về giá cũ',
    waiting: 'Xem còn ai đứng đếm xe ở cổng thành không.',
    'nika.body': 'Không có giặc. Là dân. Họ đã ở trong sân, phần lớn không mang vũ khí, và họ biết kho ở đâu vì họ đã đếm xe suốt hai mùa. Quân đứng ở bậc thềm nhìn ngươi, chờ lệnh. Cái lệnh ấy, dù là lệnh gì, cũng sẽ được nhớ.',
  },

  'no-heir': {
    want: 'một người bạn, trước khi hai người kia tìm được',
    waiting: 'Xem ba anh em còn chưa nói chuyện với nhau không.',
  },

  'eat-together': {
    want: 'không bị tách ra',
    waiting: 'Bữa cơm chiều nay — xem họ còn ngồi cùng mâm không.',
  },

  unpaid: {
    want: 'bốn mùa lương, không một lời cảm ơn',
    waiting: 'Kỳ phát lương sau. Họ vẫn không nói gì.',
  },

  'five-days': {
    want: 'mùng bảy ăn Tết ở kinh thành',
    waiting: 'Đèn trong trại bên kia sông tắt hay chưa.',
  },

  'ghost-south': {
    want: 'không đáng một đồng tiền chuộc',
    waiting: 'Giá chuộc — và xem hắn ra giá để lấy tiền hay để đo kho.',
  },

  'without-slaughter': {
    want: 'giấy, mực, và một người đưa thư biết đường',
    waiting: 'Thư trả lời từ trong thành.',
  },

  delayer: {
    want: 'không đánh trận nào cả',
    waiting: 'Lương của họ mỏng thêm một mùa.',
  },

  sickness: {
    want: 'không có ai để trách',
    waiting: 'Số nhà có sốt ở {land} tuần này.',
  },

  'mountain-water': {
    want: 'một con đê trước mùa mưa',
    waiting: 'Mực nước năm nay, so với ba vạch trên cái que.',
    'raise-the-dyke.body': 'Năm nay ông lý trưởng không nói gì cả. Ông ta mang theo một cái que và đặt xuống chiếu. Trên que có ba vạch khắc: năm ngoái, năm kia, năm kìa. Khoảng cách giữa các vạch không đều — nó rộng dần. Rồi ông ta ngồi xuống và chờ.',
  },

  'salt-road': {
    want: 'có người chịu đi bốn ngày đường',
    waiting: 'Có ai lên đường ấy xem không.',
  },

  thirteenth: {
    want: 'tự xử việc của mình, như vẫn xử',
    waiting: 'Chuyến thuế mùa này từ {land} — có lên hay không.',
  },
};

export const depthEn: Record<string, StoryCatalog> = {
  'reed-banner': {
    want: 'a command of his own',
    waiting: 'To see whether {land} sends its tax this season.',
    stake: '{land} and the two provinces around it. Loyalty there is slipping.',
    'regard.hopeful': 'He still hopes. He has not said so, but he still hopes.',
    'regard.waiting': 'He waits. A man who waits counts, and he counts carefully.',
    'regard.cold': 'He has stopped asking. A man who stops asking has answered himself.',
    'regard.trusted': 'He is yours. Not for the office — because you trusted him first.',
    'regard.humiliated': 'He heard it. The whole hall heard it, and he stood straight while it was said.',

    'the-buffalo-feast.title': 'His Uncle’s Buffalo',
    'the-buffalo-feast.body': 'They bring him into the courtyard with the paddy mud still on his hands. Fourteen, barefoot. He herds buffalo at Uy Viễn, and every afternoon he breaks reed plumes for banners and lays out battles with the other children — never taking the strong side, taking the weak side, and winning. He kept winning until they made him their general. A general must feast his army. The house had nothing, so he killed his uncle’s only buffalo. His uncle chased him to the river with a blade. Now he stands here, and nobody has told him to kneel, and he has not.',
    'the-buffalo-feast.advice': 'My lord, he stole. That is the whole of it.',
    'the-buffalo-feast.take-him-in': 'Take him into the household',
    'the-buffalo-feast.take-him-in.d': 'Pay his uncle for the buffalo, out of your own purse.',
    'the-buffalo-feast.send-with-rice': 'Send him home with rice',
    'the-buffalo-feast.send-with-rice.d': 'Proper, and everyone will understand it.',
    'the-buffalo-feast.make-him-repay': 'Make him repay the buffalo',
    'the-buffalo-feast.make-him-repay.d': 'The law is the law. He will remember.',
    'the-buffalo-feast.chronicle': 'The boy killed a buffalo to feast an army that did not exist, and you judged it.',
    'the-buffalo-feast.scene': 'His uncle chased him to the river with a blade and stopped there — not because the anger went, but because he ran out of breath. That buffalo was the whole of a household. The boy does not deny it or plead. He stands and listens to the charge with paddy mud still on his hands, looking at the middle of the courtyard rather than at the ground.',

    'forty-men-mended-the-dyke.line': 'The dyke at {land} split. While the officials argued about timber he had already called up forty men and closed it before the rains. Nobody paid them. Nobody asked why they went.',
    'forty-men-mended-the-dyke.chronicle': 'Forty men mended the dyke at {land} on nobody’s wages.',
    'forty-men-mended-the-dyke.scene': 'The dyke at {land} broke last season and the prefecture promised twice and then stopped promising. Forty men rebuilt it in six days, unasked and unpaid. The village carried rice out to them in the fields. Nobody mentioned {hero} at all — it is only that all forty were his.',

    'reed-children.line': 'The reeds at Uy Viễn are white on the hill again. The children still lay out battles, and one of them still carries the banner.',
    'reed-children.chronicle': 'People began mentioning a herdsman’s son.',
    'reed-children.scene': 'The smith at Uy Viễn lost a small anvil last month. He finds it up on the hill, wedged at the foot of a reed banner to keep the pole from going over. He leaves it there. The boy holding the banner has taken the smaller side again, the way he does. At dusk the ones he sends home go home, and the ones he tells to hold the hill sit down and hold it until the buffalo come looking for them.',
    'three-banners.body': 'Three provinces open their gates in one night, and nobody fights. The garrison at {land} does not resist because the garrison at {land} is those men — the forty who mended the dyke, and their sons. By morning there is a banner on the wall, reed plume bound to a bamboo pole. You built that wall. You filled that granary.',
    'dai-co-viet.body': 'The provinces {hero} holds have stopped needing garrisons. Not because they are safe — because nobody in them wants anything to change.',
  },

  'goose-feathers': {
    want: 'to visit home',
    waiting: 'This month’s letter — and whether the feather gown is still thick.',
    stake: 'The trigger of the divine crossbow, and the road from the western gate to the border.',
    'regard.correct': 'He is correct in everything. So correct that nobody can remember one fault.',
    'regard.athome': 'He has settled in. So well that he knows the walls better than the guards do.',
    'regard.watched': 'He knows he is watched. He has not changed a single habit.',

    'a-marriage-offered.body': '{rival} offers a bond and sends a son to your court. He says nothing through the ceremony, and answers briefly, correctly, in our language — which he speaks better than a man newly taught it should. That night he asks leave to see the citadel: outer ring, middle, inner, three ramparts coiled like a snail’s shell, all three walked slowly, like a man admiring a view. The guards say he stopped longest at the small western gate nobody uses. In the morning he says the citadel is beautiful.',
    'the-gown-grows-thin.line': 'The princess’s feather gown still hangs in her room. If anyone went and counted, it has grown thin.',
    'the-gown-grows-thin.chronicle': 'The feather gown grew thin, and nobody counted.',
    'the-gown-grows-thin.scene': 'The girl who sweeps the princess\'s room finds three goose feathers on the threshold, takes them for a draught, and throws them out. The next morning, three more. She does not mention it to anyone, because mentioning it would mean she had been watching. The princess sits at the window as she always does, hands in her lap, doing nothing at all. Behind her the gown is still thick at the shoulder. At the hem you can see light through it.',
    'feathers-on-the-road.body': 'Along the road from the western gate to the border there are white goose feathers on the ground. Not dropped: spaced a lý apart, a handful at each place, every handful to the right of the road going out. The man who reports it is a young soldier who does not understand what he has reported — he only finds it strange, because there has been no wind, and feathers do not arrange themselves in a line.',
    'the-claw-is-changed.body': 'The trigger sits in a box, the box in a store, the store has a lock, and the lock is untouched. What is in the box now is also a sliver of golden claw — same size, same colour, ground the same way. It seats perfectly. It simply is not the one that was there.',
  },

  granaries: {
    want: 'the last three pages signed',
    waiting: 'The price of rice in the capital, and the coming harvest.',
    'a-proposal.body': 'He brings the memorial on an afternoon when nobody else is in the room. Twelve pages, all of it worked out: resurvey the fields, cap the estates, paper money for copper. You read to page four and stop. He knows, and is not offended: “The last three pages are the hard part, my lord. But you need not read them. You need only sign.”',
    'the-chancellor-answers.body': 'The granary is empty, and in the ledger is his signature from last winter. He denies nothing: “Without the sale there was no money last year. Without money last year there is no country left to starve this year.” And he is right. That is the worst part.',
  },

  'river-stakes': {
    want: 'the king to know about the tide',
    waiting: 'To see whether a fleet enters the river mouth at {land}.',
    stake: 'The river mouth at {land}, and the field of stakes nobody sees at high water.',
    'the-fishermans-complaint.body': 'They bring him in because nobody can work out how to send him away — he has stood at the gate three days. He talks about the tide: at length, out of order, doubling back. The substance is that at the mouth where he nets, the water goes out further and faster than any man alive has seen. Last spring a foreign ship went aground on that mud and they cut the mast away to free it. He asks for nothing. He only thinks the king should know.',
    'the-ebb.body': 'Their ships come in near the top of the tide, single file, because the mouth is narrow and they know it. The men on the bank can count them, and having counted, find the number larger than the one they wanted. The water will start to fall within the hour — nobody will say exactly when, because the tide is not a thing anybody says exactly.',
  },

  'counting-house': {
    want: 'a safer vault than yours',
    waiting: 'Next month’s figure, in the book nobody is allowed to see.',
  },

  'dien-hong': {
    want: 'to be asked, once',
    waiting: 'To see whether the provinces’ loyalty is still enough to answer with.',
    'the-elders-arrive.line': 'They come before dawn, on foot, some of them three days on the road. Nobody told them what to wear, so they wear their best, and their best is patched.',
    'the-elders-arrive.chronicle': 'The elders came to the capital, patched coats, bare feet.',
    'the-elders-arrive.scene': 'The gate officer counts seventy-two of them and then stops counting. One carries a bamboo stick worn flat down one side only, the side his hand favours. The kitchen runs out of kettles at the third round of water and sends to the next ward to borrow. Not one of them asks what the court means to discuss. They have walked three days to say one word, and they settled on the word before they left home.',
    'they-answer.body': 'The hall is full of old men from every province. The question has been put — fight, or terms — and now it is theirs. The same courtyard, the same people, and only one line still to come. You wrote that line ten minutes ago without knowing you were writing it.',
  },

  orange: {
    want: 'into the council room',
    waiting: 'To see whether the council door opens again.',
    'juice-on-his-wrist.body': 'He has stood outside the council for an hour. Sixteen — old enough to carry a sword, one year short of the room. Somebody gave him an orange, probably to occupy him. By the time they call him the juice has run to his wrist, and he has not noticed. He asks one question: is he kept out because he is young, or because his house is small?',
  },

  'sixty-five-citadels': {
    want: 'an answer, not condolences',
    waiting: 'Word from the north — and a name that came with no date.',
    'the-whole-province-has-risen.body': 'The woman who asks to be seen gives no title, only a name. Her husband was killed by the governor across the border last month — publicly, in the market, as an example. She has not come to weep. She asks whether you intend to help, in the voice of someone who already knows the answer and is asking for form’s sake. Her sister stands in the yard and does not come in. They say she is the one who knows how to fight.',
  },

  'ride-the-wind': {
    want: 'to ride the strong winds and tread the fierce waves',
    waiting: 'Her next battle — and the name the soldiers have given her.',
    'regard.burning': 'She is not angry. She only looks at the granary the way one looks at a coat that does not fit.',
    'regard.risen': 'The soldiers follow her under a name they made themselves. They use it in front of you.',
    'she-will-not-take-the-post.body': 'You appoint her to the granary at Thanh Hóa — a good post, safe, wanted. She stands up in the middle of court, which nobody gave her leave to do: “I want to ride the strong winds, tread the fierce waves, and slay the great whales of the Eastern Sea. I do not want a granary.” Then she sits down, quite normally, as though she had commented on the weather.',
  },

  substitution: {
    want: 'nobody to have to volunteer',
    waiting: 'For dark, and for the river to rise.',
    'they-know-which-banner-is-yours.body': 'Surrounded on three sides; the fourth is the river, and the river is rising. Four days. They know which banner is yours because it has stood in the middle of the camp all four — nobody lowers it, because lowering it would tell the men. And here is the detail that is usually told wrong: nobody volunteers. They stand there, looking at each other, waiting for you to speak. This is not a thing a man offers. It is a thing someone must be named for.',
  },

  'borrowed-sword': {
    want: 'to go back where it belongs',
    waiting: 'The surface of the lake, and the turtle that has not gone down.',
  },

  slandered: {
    want: 'to be asked how many ships are left',
    waiting: 'To learn who wrote the letter.',
    stake: 'Your best commander — and the southern sea.',
    'regard.silent': 'He sends no word from the cell. A man who does not plead is a man who trusts you to see it yourself.',
    'regard.spared': 'He never mentions those three months. He only asked how many were left.',
  },

  trusted: {
    want: 'to finish the work, as always',
    waiting: 'This week’s documents — and whether any pass through other hands.',
    stake: 'Two hosts, three provinces, one seat — all in a single pair of hands.',
    'regard.diligent': 'He works as he always has. That is the most reassuring thing about him, or the most frightening.',
    'regard.passedover': 'He took the lighter load without a word. They say he sleeps now.',
  },

  'cham-engineer': {
    want: 'timber, iron, and a yard',
    waiting: 'This evening’s drawing on the cell floor.',
    'drawing-in-the-dirt.body': 'The gaoler is embarrassed to report it, afraid of being laughed at. A prisoner from the last war has spent a month drawing on the floor of his cell every evening, rubbing it out with his foot, starting again differently the next day. The gaoler cannot read, but he says something exact: “He draws like a man remembering, not like a man inventing.”',
  },

  assembly: {
    want: 'to redraw the frame, not to take the throne',
    waiting: 'The list to be finished — laws on it, not names.',
  },

  'rice-riot': {
    want: 'rice at the old price',
    waiting: 'Whether anyone still stands at the gate counting carts.',
    'nika.body': 'There is no enemy. It is the people. They are already in the yard, most of them unarmed, and they know where the treasury is because they have counted the carts for two seasons. The soldiers stand on the steps and look at you, waiting for the order. Whatever that order is, it will be remembered.',
  },

  'no-heir': {
    want: 'a friend, before his brothers find one',
    waiting: 'To see whether the three brothers are still not speaking.',
  },

  'eat-together': {
    want: 'not to be separated',
    waiting: 'This evening’s meal — whether they still share the tray.',
  },

  unpaid: {
    want: 'four seasons’ wages, and no thanks required',
    waiting: 'The next pay day. They still have not said anything.',
  },

  'five-days': {
    want: 'to keep the seventh day of Tết in the capital',
    waiting: 'For the lanterns across the river to go out.',
  },

  'ghost-south': {
    want: 'to be worth no ransom at all',
    waiting: 'The ransom price — and whether it is set to take money or to measure the vault.',
  },

  'without-slaughter': {
    want: 'paper, ink, and a courier who knows the road',
    waiting: 'An answer from inside the fortress.',
  },

  delayer: {
    want: 'to fight no battle at all',
    waiting: 'Their supply to thin by one more season.',
  },

  sickness: {
    want: 'nobody to blame',
    waiting: 'This week’s count of fevered houses at {land}.',
  },

  'mountain-water': {
    want: 'a dyke before the rains',
    waiting: 'This year’s water, against the three notches on the stick.',
    'raise-the-dyke.body': 'This year the village head says nothing. He lays a stick on the mat. Three notches are cut in it: last year, the year before, the year before that. The gaps between them are not even — they widen. Then he sits down and waits.',
  },

  'salt-road': {
    want: 'somebody willing to walk four days',
    waiting: 'Whether anyone goes up the road to look.',
  },

  thirteenth: {
    want: 'to settle their own affairs, as they already do',
    waiting: 'This season’s tax convoy from {land} — whether it comes.',
  },
};
