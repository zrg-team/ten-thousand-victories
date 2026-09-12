> **Phase 1 archive.** Historical design and implementation notes through September 2026; proposals and status statements describe their original context. Use the [Phase 2 plan](../phase-2/README.md) for new gameplay work. Older numbered “Phase” headings are local steps, not the current product phase.

# Sử Ký Đại Việt

Sử Ký Đại Việt

Throne of Đại Việt · bản thiết kế lối chơi · bản thứ hai · 16/08/2026

The Chronicle

# Sử Ký

Truyện không phải là thứ để hoàn thành. Nó là một thứ đã để mắt tới ngươi — nó nhìn ngươi làm gì, tự quyết định sẽ nói gì về việc đó, và đôi khi ra tay mà không hỏi. Ngươi không bao giờ biết nó dài bao nhiêu, và không thể kết thúc nó sớm.

Phạm vi · ý tưởng, chưa viết mã
Chế độ · Dragon Ascent
Điểm · 8.7 / 10

[01Bản đầu là hệ thống nhiệm vụ](#wrong)
[02Truyện thật ra là gì](#model)
[03Mọi việc truyện có thể khiến ngươi làm](#reads)
[04Mọi thứ truyện có thể giáng xuống ngươi](#acts)
[05Bốn mươi khoảnh khắc, viết ra đầy đủ](#library)
[06Một truyện, ba ván chơi](#reed)
[07Chín cách giữ cho khó đoán](#unpredictable)
[08Nó trông như thế nào](#screens)
[09Truyện lấy từ đâu](#history)
[10Các game khác đã làm gì](#research)
[11Nhịp độ và chi phí](#pacing)
[12Chấm điểm thật lòng](#score)
[enEnglish version](chronicle-of-dai-viet.md)

01

## Bản đầu là một hệ thống nhiệm vụ

Nó có bộ đếm chương — *Hồi 3 · 5*. Nó có dãy chấm tiến độ. Nó có thanh nhiệm vụ ghi *"còn 6 mùa"* kèm vạch lấp đầy. Ba thứ đó đều là giao diện **hoàn thành**, và giao diện hoàn thành làm một việc rất cụ thể trong đầu người chơi: nó biến truyện thành một tờ khai phải điền. Một khi đã thấy mình đi được ba phần năm, ngươi không còn ở *bên trong* thứ gì nữa. Ngươi đang quản lý một công việc.

Lỗi sâu hơn nằm ở cấu trúc chứ không phải ở bề mặt. Bản đó để truyện **ra lệnh rồi kiểm tra xem ngươi có tuân theo không**. Dựng xưởng gỗ. Giữ 200 hàng hoá. Sáu mùa. Đó là một hợp đồng, hợp đồng chỉ có đúng hai kết cục, và người chơi học thuộc cả hai trong một ván.

Phân biệt mà cả bản viết lại này xoay quanh

**Nhiệm vụ có trạng thái hoàn thành. Truyện thì không.** Ngươi không thể thất bại một câu truyện. Ngươi chỉ có thể thay đổi nó thành cái gì — và nó vẫn tiếp tục trở thành một cái gì đó, dù ngươi có để tâm hay không.

Nên mô hình bị lật ngược. Truyện thôi bảo ngươi phải làm gì, và bắt đầu **quan sát những việc ngươi vốn dĩ đã định làm**. Mọi hành động của ngươi đều bị một thứ gì đó đọc. Không có danh sách việc, vì không có việc — chỉ có một con người, hoặc một vùng đất, mà truyện đã để mắt tới, và mọi chuyện xảy đến với nó đều có nghĩa.

Về mặt kỹ thuật, gần như không có gì thay đổi. Cái bộ theo dõi vốn phải kiểm tra "họ đã dựng xưởng gỗ chưa" vẫn còn đó; giờ nó kiểm tra "họ đã đối xử với ông ta thế nào" và không có đáp án đúng. **Giữ lại bộ theo dõi. Vứt bỏ danh sách việc.**

|  | Bản đầu — nhiệm vụ | Bản này — truyện |
| --- | --- | --- |
| **Cấu trúc** | Chuỗi chương cố định, viết sẵn theo thứ tự. | Một kho mảnh truyện. Mỗi lần lên tiếng, nó chọn mảnh nào *thích đáng nhất lúc này*. |
| **Độ dài** | Nói trước. Hồi 3 trên 5. | Không biết, và không thể biết. Hết là hết. Hai mảnh hay mười lăm mảnh. |
| **Việc của người chơi** | Làm xong mục tiêu. | Trị nước. Truyện đọc cách ngươi trị nước. |
| **Nếu phớt lờ** | Hết hạn. Truyện chết, phạt nhẹ. | Không thể phớt lờ. Phớt lờ cũng là một câu trả lời, và thường là câu thú vị nhất. |
| **Thời gian** | "Còn 6 mùa", kèm thanh tiến độ. | "Ông ta sẽ không hỏi lần thứ ba." Không bao giờ là con số. |
| **Ai ra tay** | Luôn là người chơi. Truyện chờ. | Cả hai. Đôi khi nó chỉ đơn giản giáng xuống, và không có thẻ nào để chọn. |
| **Chơi lại** | Cùng chuỗi đó, chọn phương án khác. | Những mảnh hoàn toàn khác lên tiếng. Cùng một truyện mà giữa hai ván không nhận ra nhau. |

02

## Truyện thật ra là gì

Ba phần, và không phần nào là một chuỗi.

- **Nhân vật liên đới.** Những đối tượng nó đã để mắt tới — một tướng, một trấn, một nước lân bang. Được gán khi truyện gieo mầm, lấy từ bất cứ thứ gì thế giới đang có.
- **Ký ức.** Một túi số phẳng ghi lại chuyện đã xảy ra. `bịBỏQua: 2`. `thắngDướiTrướngÔngTa: 1`. `ôngTaĐãXin: true`. Không gì phức tạp hơn thế.
- **Một kho mảnh truyện.** Chừng hai mươi mảnh, mỗi mảnh có điều kiện và trọng số. Không xếp thứ tự. Phần lớn sẽ chẳng bao giờ lên tiếng trong một ván bất kỳ.

Khi có chuyện gì xảy ra trong thế giới, truyện thức dậy, chấm điểm từng mảnh dựa trên trạng thái hiện tại và ký ức của chính nó, rồi nói ra mảnh phù hợp nhất — có bốc thăm ngẫu nhiên trong nhóm dẫn đầu, để cùng một tình huống không phải lúc nào cũng cho ra cùng một câu. Rồi nó ghi vào ký ức và im lặng trở lại.

Đây là kể chuyện theo *độ thích đáng* chứ không phải theo nhánh — cách phân biệt của Emily Short — và lý do nó quan trọng ở đây đúng bằng lời phàn nàn phía trên: **cây phân nhánh là tấm bản đồ người chơi học thuộc được, còn một kho mảnh truyện là một tính cách mà họ chỉ có thể dần dần làm quen.**

**Có chuyện xảy ra***chiếm đất · thua trận · tướng bị bỏ không*

→

**Truyện thức dậy***chỉ những truyện có quan tâm*

→

**Chấm điểm mọi mảnh***theo thế cuộc, và theo ký ức của chính nó*

→

**Bốc ngẫu nhiên***trong nhóm thích đáng nhất*

→

**Nó lên tiếng***lời đồn · thẻ · đòn giáng*

→

**Ghi vào ký ức***rồi ngủ*

→

**Hoặc nó khép lại***một kết cục nổ ra · Sử Ký chép lại*

↺ rồi quay về đầu — vòng lặp không có độ dài, nên không gì cho ngươi biết mình đã đi được tới đâu

Hình 1 — không chuỗi, không bộ đếm. Một cái kho, một ký ức, và một luật để chọn

### Ba giọng mà truyện dùng để nói

Không phải điều gì truyện nói cũng nên dừng cả ván chơi. Đây chính là thứ cho phép truyện hiện diện liên tục mà không bao giờ trở thành một hàng dài hộp thoại — và là thứ khiến nó giống một chuyện đang diễn ra quanh ngươi hơn là một tờ khai được gửi tới.

~70% số mảnh
**Lời đồn**

Một dòng chữ trên thanh đầu màn hình. Không dừng game, không phải chọn, không cần bấm gì. *"Có một thằng bé ở Hoa Lư đang bày trận cho lũ trẻ bằng cờ lau. Chúng nghe lời nó."* Ngươi có thể còn không nhận ra đó là truyện.

~25%
**Thẻ**

Dừng lại, và hỏi. Hai đến bốn phương án, giá phải trả ghi rõ, không có bộ đếm ở tiêu đề. Đây là giọng duy nhất người chơi phải trả lời.

~5%
**Đòn giáng**

Dừng lại, và *báo*. Không có phương án. Một viên tướng đã chết. Một đại quân đã tới biên giới. Ngươi không được chọn — ngươi chỉ được sống tiếp với nó.

Đòn giáng chính là thứ khiến hệ thống này không giống một cái menu. Một câu truyện chỉ biết hỏi là câu truyện ngươi nắm quyền kiểm soát, mà kiểm soát thì trái ngược với kịch tính. Mỗi truyện lớn nên giáng ít nhất một đòn, và người chơi không được thấy nó tới.

03

## Mọi việc truyện có thể khiến ngươi làm

Anh đã yêu cầu điều này hai lần: xây một công trình ở một vùng đất cụ thể, chiếm một vùng đất cụ thể, tăng quan hệ với một nước cụ thể, chuẩn bị đủ một lượng tài nguyên, giao quân cho một viên tướng — và *luôn luôn có việc để làm*. Đây là toàn bộ bộ từ vựng đó, cùng ba cơ chế khiến nó trở nên cấp thiết mà không bao giờ phải ra lệnh.

### Ba cơ chế

cơ chế một
**Dấu**

Một ký hiệu mực nhỏ bên cạnh tên một viên tướng, một trấn, một nước lân bang. Bấm vào chỉ hiện một câu: *"Người ta đang bàn tán về việc này."* Ngươi biết có thứ gì đó đang nhìn. Ngươi không biết nó muốn gì.

cơ chế hai
**Lối mở**

Một dòng phụ hiện ra ngay ở nơi ngươi vẫn thường ghé — bảng thông tin trấn, thẻ tướng, chi tiết đạo quân. Là một lời mời, không bao giờ là mệnh lệnh. Bỏ qua thì miễn phí, và bỏ qua cũng là một câu trả lời.

cơ chế ba
**Lời đồn**

*"Trường Yên mùa này không nộp thuế."* Không có chỉ thị nào. Nhưng ngươi sẽ đi xem Trường Yên, và game chưa từng bảo ngươi làm thế.

Lời bảo đảm cho "luôn có việc để làm"

**Bất cứ lúc nào cũng có ít nhất một lối mở đang sống trong lãnh thổ của ngươi**, và nó nằm trên một đối tượng ngươi dù sao cũng sẽ ghé qua. Đó là thứ thay cho nhật ký nhiệm vụ: việc để làm nằm ngay chỗ ngươi đang đứng, nó không bắt buộc, và nhận nó thì nuôi một thứ ngươi không nhìn thấy được.

### Lối mở, cụ thể

| Hiện ở đâu | Nó nói gì | Nó xin ngươi điều gì |
| --- | --- | --- |
| **Bảng trấn** | "Người của Đinh Công sẵn lòng đắp con đê ấy mà không lấy gì, nếu có ai hỏi tới." | Xây một công trình cụ thể ở đây |
| **Thẻ tướng** | "Ông ta xin được điều lên phương bắc. Ông ta không nói vì sao." | Bổ nhiệm ông ta về một trấn cụ thể |
| **Chi tiết quân** | "Lính Trường Yên không chịu theo ai khác." | Giao đạo quân này cho viên tướng này |
| **Bảng lân bang** | "Sứ giả của họ vẫn còn trong thành. Chưa ai tiếp." | Tăng quan hệ — hoặc từ chối tiếp |
| **Quốc khố** | "Nhà chùa xin giữ hộ vàng của ngươi. Vị sư trụ trì là người cẩn thận." | Chuyển một khoản, và tin một người |
| **Bản đồ, trên đất láng giềng** | "Kho Cổ Loa đầy ắp mà chúa đất đã tám mươi tuổi." | Chiếm một trấn cụ thể, hoặc không |
| **Triều đình** | "Ghế Nguyên soái bỏ trống từ mùa xuân. Người ta đã để ý." | Bổ nhiệm ai đó — hoặc cứ tiếp tục không |

### Toàn bộ từ vựng hành động — năm mươi mốt việc mà truyện đọc

Mỗi việc dưới đây đều là thứ game đã theo dõi sẵn. Không việc nào bắt buộc. Tất cả đều được đọc, và không việc nào có giá trị đúng — đó chính là toàn bộ khác biệt giữa hệ thống này và một danh sách gạch đầu dòng.

| Hệ thống | Ngươi có thể làm gì | Truyện hiểu ra sao |
| --- | --- | --- |
| **Xây dựng** | Xây một công trình *đích danh* ở trấn có dấu · xây bất cứ thứ gì ở đó · nâng cấp · để nó bị phá · tự phá bỏ | Của cải đáng để bảo vệ — hoặc đáng để cướp khỏi tay ngươi. Con đê ngươi đắp vì lý do riêng ở mùa 12 chính là thứ khiến một mảnh truyện ở mùa 60 tồn tại được. |
| **Trấn** | Đặt hướng phát triển và giữ nguyên · để lòng dân sa sút · vực lòng dân lên · tăng dân số vượt một mức · đóng quân · bỏ trống · giữ nó qua một đợt sóng | Một trấn giữ nguyên một hướng suốt ba mươi mùa nghĩa là mọi thứ khác bị bỏ bê — và có người sống trong cái "mọi thứ khác" ấy. |
| **Lãnh thổ** | Chiếm một trấn *đích danh* · chiếm bất kỳ trấn nào giáp một nước cụ thể · lấy đất từ một nước cụ thể · **cách ngươi lấy** — đút lót, di dân, đòi chủ quyền, hay đánh chiếm · để mất một trấn · từ chối chiếm lại · đạt một số trấn nhất định | Lấy Cổ Loa bằng vàng và lấy Cổ Loa bằng gươm là hai dữ kiện hoàn toàn khác nhau. Chiếm không đổ máu mở ra những mảnh truyện mà một trận cướp phá đóng lại vĩnh viễn. |
| **Tướng** | Giao quân · cho trấn thủ một vùng · phong vào triều · phong *người khác* vào chỗ ông ta muốn · bỏ qua ông ta hai lần · để ông ta kiệt sức · cho nghỉ · sa thải · ghép hai người vào một đạo quân · để ông ta tử trận · để danh vọng ông ta vượt cả vua | Nguồn phong phú nhất trong game. Bỏ qua một người không phải là hành động rỗng, đó là một câu có chủ ngữ và tân ngữ — và lần thứ hai nó xảy ra thì nó mang nghĩa mà lần đầu không có. |
| **Quân đội** | Dựng đạo quân đủ quân số · nâng cấp — trang bị, bổ sung, luyện tập · hành quân tới một trấn đích danh · để ngồi không · giải tán · thắng trận ở thế yếu · thua · diệt một đạo quân địch đích danh · để hết lương · chặn đường một đạo quân đang hành quân | Một đạo quân ngồi lì trong kinh thành bốn mươi mùa là câu chuyện về một viên tướng không có việc gì làm, và câu chuyện ấy có một kết cục ai cũng biết. |
| **Bang giao** | Nâng quan hệ với một nước *đích danh* vượt một mức · cố tình hạ nó · ký hoà ước · xé hoà ước · nộp cống · từ chối cống · tặng quà · cử sứ thần thường trú · đứng ngoài cuộc chiến của người khác | Được đọc theo tính cách của chính truyện đó. Hoà với lân bang là khôn ngoan trong truyện về một nho sĩ và là nhu nhược trong truyện về một võ tướng — *cùng một hành động*, nghĩa ngược nhau. |
| **Kinh tế** | Giữ đủ một lượng lương, vàng, hàng hoá hay dân đinh vào một thời điểm · dốc tiền vào một việc · chịu thâm hụt · tích trữ vượt ngưỡng · vét sạch quốc khố · giữ kho thóc trên mức đói | Chín trăm lượng vàng nằm im là một quốc khố đã có kẻ bắt đầu đếm. Thịnh vượng cũng là một dữ kiện, và không phải lúc nào cũng an toàn. |
| **Triều đình & luật** | Ban một sắc lệnh đích danh · bãi bỏ một sắc lệnh · rút một lá bài Quyền cụ thể · từ chối một lá · bỏ trống một ghế · lấp đầy mọi ghế | Những đạo luật ngươi ban là một bức chân dung. Truyện về một nhà cải cách càng thích đáng thêm với mỗi sắc lệnh, và mảnh sụp đổ của nó chỉ tồn tại nếu ngươi đã lấy hết. |
| **Không làm gì** | Phớt lờ một cái dấu · trả lời "chưa phải lúc" hai lần · không bao giờ tiếp sứ · để một lời đồn không được đáp lại suốt hai mươi mùa | **Dữ kiện mạnh nhất trong danh sách**, và là thứ bản đầu về mặt cấu trúc không thể đọc nổi. Trong ví dụ ở §06, chính nó tạo ra thảm hoạ. |

### Thời gian không bao giờ là con số

Giá phải trả vẫn ghi chính xác — kỷ luật này đã được thiết lập khắp giao diện và không được phá. Nhưng thời hạn, thời lượng và độ dài thì không bao giờ được lượng hoá ở bất cứ đâu trong một câu truyện. *"Trước khi mưa xuống."* *"Ông ta sẽ không hỏi lần thứ ba."* Một con số mời gọi tối ưu hoá; một câu chữ mời gọi lo lắng.

04

## Mọi thứ truyện có thể giáng xuống ngươi

Nửa còn lại của yêu cầu: một đại quân đổ xuống đầu ngươi, một cuộc nổi dậy bùng lên, một viên tướng chết, mất tài nguyên, được thêm quân, được thêm tướng. Đây là toàn bộ dải kết quả — và luật đầu tiên là **mảnh nào cũng trả giá hoặc trả thưởng, không riêng gì kết cục**. Lời đồn làm một chỉ số nhích nhẹ. Thẻ trả ngay lúc ngươi chọn. Đòn giáng thì đổ xuống hết sức. Không có mảnh nào trong kho là vô nghĩa.

### Danh mục — sáu mươi tám kết quả trên tám tầng

| Tầng | Tốt | Xấu |
| --- | --- | --- |
| **Chiến sự** | Một đạo quân đã dựng sẵn xuất hiện ở một trấn đích danh · lính cựu chiến được sáp nhập vào quân sẵn có · toàn quân được nâng một bậc tinh nhuệ · một cái bẫy đã chuẩn bị nổ ra và xoá sạch phần lớn quân xâm lược · một đạo quân địch tan rã trước khi tới · một viên tướng địch bị giết và quân của hắn mất buff · quân đồng minh dưới trướng ngươi một mùa · đợt sóng tới bị tách làm đôi | **Một đại quân lập tức tiến đánh một trấn đích danh, ngoài chu kỳ sóng** · hai nước lân bang cùng đánh trong một mùa · một đạo quân phản bội giữa đường hành quân, mang theo cả chủ tướng · quân biến loạn và không chịu di chuyển · sĩ khí toàn quốc chạm đáy · lương thảo hỏng dọc đường · đạo quân mạnh nhất tới trận chậm một mùa |
| **Nổi dậy** | Một vùng có sàn lòng dân vĩnh viễn · một trấn không bao giờ nổi loạn nữa · một toán phản quân quy hàng cùng người ngựa | **Một trấn nổi loạn và trở thành thù địch** · **ba trấn ly khai và lập thành một nước mới dưới trướng một viên tướng ngươi từng biết**, giữ nguyên mọi công trình của ngươi · dân nổi dậy, sinh ra một đạo quân từ chính dân ngươi · kinh thành bạo loạn mà không có bóng giặc nào · một dòng họ quyền quý ngừng nộp thuế và ngươi làm gì cũng vô ích · quân đội không chịu xuất chinh suốt mấy mùa |
| **Tướng lĩnh** | **Một viên tướng gia nhập** — từ bộ bài, hoặc một nhân vật riêng của truyện với đặc tính không bốc thăm nào tạo ra được · một chỉ số tăng vĩnh viễn · hai tướng kết nghĩa và được buff khi cùng ra trận · một người từng bỏ đi nay trở lại · một tướng bị bắt được cứu về và lòng trung khoá ở mức tối đa | **Một viên tướng chết** — tử trận, bệnh, bị xử, hoặc chết thay cho người khác · một tướng phản bội và về sau xuất hiện chỉ huy quân xâm lược · một tướng bỏ đi không một lời · một tướng bị bắt và bị đòi tiền chuộc · hai tướng bất hoà và không bao giờ cùng phục vụ được nữa · một tướng cãi lệnh kế tiếp của ngươi |
| **Đất đai** | **Một trấn quy phục không đổ máu, dân số nguyên vẹn**, công trình còn nguyên · một công trình miễn phí · một công trình địa hình vĩnh viễn — con đê, con kênh, hàng cọc dưới lòng sông — làm thay đổi bản chất vùng đất · thêm một suất đòi đất · dân số bùng nổ | Một trấn bị san bằng · dịch bệnh cướp một phần ba dân · hướng phát triển bị truyện khoá lại và ngươi không đổi được · mất một suất đòi đất · công trình tốt nhất cháy rụi |
| **Tài nguyên** | Một khoản trời cho · một khoản thu đều mỗi mùa · cống phẩm của một nước lân bang chuyển hướng về ngươi · một tuyến thương mại sinh lời trong thời gian nó còn | **Quốc khố bị tịch thu** · một món nợ tự trừ mỗi mùa · kho thóc mục nát · bị áp cống và bị thu tự động · một khoản hao hụt mỗi mùa không rõ nguyên do cho tới khi một mảnh truyện sau này gọi tên nó |
| **Bang giao** | Một liên minh · một nước lân bang bị hạ nhục và phải cống nạp cho ngươi · uy tín với mọi bên thứ ba đang đứng xem · một nước lân bang sụp đổ vào nội chiến | **Một liên minh chống lại ngươi hình thành** · mất hết uy tín với tất cả cùng lúc · một hoà ước ngươi không được xé cho tới hết ván · một nước địch mới mọc lên ở nơi trước đó không có |
| **Luật chơi** | **Một lá bài Quyền vào thẳng bộ bài của ngươi, vĩnh viễn** · một học thuyết được ban thẳng · một sắc lệnh mở sớm cả một thời đại · thêm một suất đòi đất · đồng hồ sóng chậm lại | **Một học thuyết bị lấy đi** · bộ bài mất một bậc hiếm · một sắc lệnh bị bãi trái ý ngươi · đồng hồ sóng nhanh lên · một lá bài ngươi trông cậy bị rút khỏi bộ |
| **Di sản** | Một mục vĩnh viễn trong cửa hàng Legacy · một viên tướng riêng của truyện được thêm vào bộ bài cho các ván sau · một danh hiệu mang theo buff sang ván kế | Một dòng trong Sử Ký ghi lại thất bại, mà các truyện về sau — kể cả ở những ván sau — được phép đọc và nhắc lại |

### Mười bốn thứ gánh cả tính năng này

Nếu ngân sách viết lách cạn, đây là những thứ bắt buộc phải có, vì đây là những thứ người chơi sẽ kể lại cho người khác nghe.

##### Bảy thứ khiến người ta khiếp

1. Ba trấn của ngươi ly khai thành một nước thù địch — giữ nguyên mọi công trình ngươi đã bỏ tiền ra xây.
2. Một viên tướng ngươi dùng suốt bốn mươi mùa chết hẳn, không có lượt tung xúc xắc nào để cứu.
3. Một đại quân lập tức xuất kích nhắm vào một trấn đích danh, ngoài chu kỳ sóng.
4. Một học thuyết ngươi xây cả ván chơi quanh nó bị lấy lại.
5. Kinh thành bạo loạn. Không có giặc. Là chính dân ngươi.
6. Một đạo quân phản bội giữa đường hành quân, mang theo chủ tướng và kỵ binh tinh nhuệ nhất.
7. Viên tướng lặng lẽ bỏ đi ở một ván trước đang chỉ huy đạo quân tiến đánh ngươi bây giờ.

##### Bảy thứ khiến người ta reo

1. Một trấn quy phục không cần đánh, dân đủ, công trình còn nguyên.
2. Một viên tướng không thể bốc được, mang đặc tính không tồn tại ở đâu khác.
3. Một lá bài Quyền vào bộ bài vĩnh viễn, cho tới hết ván.
4. Cái bẫy ngươi chuẩn bị năm mươi mùa trước xoá sạch hai phần ba cuộc xâm lăng.
5. Một nước lân bang sụp vào nội chiến và đất của họ long ra.
6. Hai viên tướng kết nghĩa, và mọi trận họ cùng đánh đều tốt hơn.
7. Trấn nơi một viên tướng ngã xuống có sàn lòng dân không bao giờ tụt.

### Truyện tự ra tay

Truyện không phải một người dẫn chuyện ngồi chờ được kích hoạt. Nó là một tác nhân có dục vọng, và nó ra tay trước — dựng quân, giết tướng, lật trấn, lấy lại học thuyết, khiến hai viên tướng của ngươi thôi nói chuyện với nhau.

Luật giữ cho điều này công bằng

Truyện không bao giờ được ra tay khi chưa từng lên tiếng. **Mọi đòn giáng đều có ít nhất hai lời đồn đi trước**, và những lời đồn ấy nằm trong Sử Ký, đọc lại được. Người chơi nào để ý thì được quyền nói *"tôi đã thấy trước rồi"*. Người chơi nào không để ý thì bị phục kích, và đáng bị. Đó là toàn bộ khác biệt giữa bất ngờ và bất công.

### Nhiệt độ

Mỗi truyện mang một con số ẩn duy nhất — nó gần tới lúc ra tay đến đâu. Nuôi dục vọng của nó thì số ấy tăng; thời gian và những hành động ngược lại thì làm nó giảm. Con số không bao giờ được hiện ra. Dấu hiệu duy nhất là **tần suất**: một truyện đang nóng lên thì đồn đại thường hơn, về những chuyện nhỏ hơn. Khi một mạch truyện im lặng suốt hai mươi mùa bỗng lên tiếng hai lần trong một chu kỳ, có chuyện sắp xảy ra — và người chơi học cách đọc áp lực đó như đọc thời tiết.

### Quy kết — kịch tính rẻ nhất trong cả bản thiết kế

Bộ mô phỏng vốn đã tự sinh ra đói kém, đào ngũ, lòng dân sụp đổ, xâm lăng. Truyện được phép **nhận vơ** những sự kiện ấy. Nạn đói đến theo lịch riêng của nó; câu truyện đang chạy về một vị tể tướng cải cách bèn nói: *"kho thóc đã bị bán sạch từ mùa đông năm ngoái."* Không có gì bị làm giả, không có gì mới được mô phỏng — và thế giới thôi có cảm giác như một bảng tính kèm thời tiết.

### Các truyện can thiệp lẫn nhau

- **Chúng dùng chung nhân vật.** Hai truyện cùng gán một viên tướng thì đọc được ký ức của nhau. Ông ta có thể là liệt sĩ trong truyện này và kẻ phản bội trong truyện kia, và game sẽ không hoà giải mâu thuẫn ấy hộ ngươi.
- **Chúng va nhau.** Khi hai truyện muốn nói về cùng một đối tượng trong cùng một mùa, chúng hợp thành một mảnh không truyện nào viết ra, và ngươi cứu được một bên bằng cái giá của bên kia.
- **Chúng thừa kế.** Một truyện đã khép để lại ký ức trong Sử Ký, và một truyện gieo mầm sau đó được phép đọc — kể cả ở ván sau. *"Người ta bảo ngươi đã bỏ mặc Đỗ Khắc chết ở Vân Đồn."* Nói bởi một kẻ không có mặt ở đó, trong một ván mà chuyện ấy có thật.

05

## Bốn mươi khoảnh khắc, viết ra đầy đủ

Hai mục trên là từ vựng. Mục này là nội dung — bốn mươi khoảnh khắc thật, mỗi cái có đúng câu chữ người chơi đọc, việc nó muốn ở họ, và cả hai nhánh viết ra cụ thể chứ không phải dưới dạng một loại. Đọc sáu cái trong này là biết ngay tính năng có đáng làm hay không.

→ là việc nó đòi ở ngươi. ✓ và ✗ là chuyện thực sự xảy ra.

### Nó muốn ngươi xây một thứ gì đó

Con Đê Sông Đáy*lối mở*

"Người của Đinh Công sẵn lòng đắp con đê ấy mà không lấy gì, nếu có ai hỏi tới. Ông ta không hỏi."

~~→~~Đắp con đê ở Sông Đáy. Một suất xây, không tốn vàng.

~~✓~~Bốn mươi mùa sau, nước cuốn ba trấn và chừa trấn này. Trấn nhận *Giữ Được Nước Lũ* — lòng dân không bao giờ xuống dưới 70 nữa.

~~✗~~Lũ về. 1.400 dân, hai công trình, và một lời đồn: *"Ông lão đã nói rồi mà."*

Lò Rèn Không Ai Xin*thẻ*

"Một người thợ rèn Chăm đi bộ từ Vijaya tới. Ông ta nói sẽ dạy, nhưng không lấy tiền, và không dạy người ngươi chọn — dạy người ông ta chọn."

~~→~~Xây lò rèn, và giao cho ông ta một trấn ngươi không định giao cho ai.

~~✓~~Mọi đạo quân dựng từ trấn ấy cao hơn một bậc tinh nhuệ, tới hết ván.

~~✗~~Ông ta sang Chiêm Thành. Ba mươi mùa sau, quân họ cao hơn một bậc so với trước.

Chòi Canh Trên Đỉnh Núi*lời đồn → thẻ*

"Một người thợ săn bảo từ sống núi trên Vân Đồn, sáng trời quang, có thể nhìn sâu bốn ngày đường vào đất Chiêm."

~~→~~Dựng chòi canh ở đó. 90 hàng hoá, một suất xây, và nó chẳng sản xuất gì.

~~✓~~Mọi đạo quân địch vượt biên đều lộ ra trước ba mùa — suốt cả ván.

~~✗~~Cuộc xâm lăng kết thúc ván chơi tới mà không một lời báo, và Sử Ký ghi rằng từng có một người thợ săn nhắc tới một sống núi.

Ngôi Chùa Mẹ Ngươi Muốn*thẻ*

"Thái hậu xin một ngôi chùa ở Hoa Lư. Nó không có giá trị quân sự nào. Bà đã xin bốn lần."

~~→~~Xây một ngôi chùa. Nó không cho gì đo đếm được.

~~✓~~Không gì cả, suốt sáu mươi mùa. Rồi khi kinh thành bị vây, trấn ấy tự dấy 900 người và vòng vây vỡ.

~~✗~~Không gì cả, mãi mãi. Đây là một nhánh thật và nó phải được giữ là một nhánh thật.

### Nó muốn một vùng đất cụ thể

Cổ Loa Trước Khi Chúa Đất Chết*lối mở*

"Kho Cổ Loa đầy ắp mà chúa đất đã tám mươi tuổi. Các con ông ta không nói chuyện với nhau."

~~→~~Lấy Cổ Loa. **Cách ngươi lấy chính là dữ kiện.**

~~✓~~Bằng vàng hoặc bằng danh nghĩa: nó về nguyên vẹn. Đủ dân, ba công trình, và quân đồn trú nhập vào quân ngươi thành lính cựu.

~~✗~~Bằng gươm: ngươi được tường thành và một trần lòng dân vĩnh viễn ở mức 45. Dân ở đó không quên, và hai mảnh truyện sau này chỉ tồn tại vì việc ấy.

Cái Làng Ông Ta Sinh Ra*thẻ*

"Đỗ Khắc chưa từng xin ngươi thứ gì. Bây giờ ông ta xin. Làng ông ta ở bên kia biên giới và đang bị vắt thuế đến chết."

~~→~~Chiếm một trấn đích danh mà về chiến lược thì vô giá trị.

~~✓~~Lòng trung của ông ta khoá ở mức tối đa vĩnh viễn. Không truyện nào sau này có thể mua chuộc hay khiến ông ta phản.

~~✗~~Ông ta không nhắc lại chuyện đó nữa. Mười một mảnh trong kho của ông ta đổi trọng số. Ngươi sẽ không được cho biết là những mảnh nào.

Cứ Để Vân Đồn Mất*thẻ*

"Nếu chúng lấy cửa sông, chúng sẽ đưa thuyền lên lúc triều dâng. Cọc đã cắm dưới nước rồi."

~~→~~**Cố tình để mất một trấn**, và đừng chiếm lại. Lòng dân khắp nơi tụt 10 trong lúc ngươi cắn răng.

~~✓~~Hạm đội vào theo con nước. 68% nằm trên bãi lầy khi nước rút. Ngươi đánh một phần ba đạo quân bằng toàn bộ quân của mình.

~~✗~~Ngươi chiếm lại ở mùa thứ hai, đúng như ai cũng van nài. Cọc mục. Không ai từng biết chuyện gì suýt xảy ra.

Đường Muối*lời đồn*

"Muối không lên theo đường ven biển từ mùa xuân. Không ai nói vì sao, và không ai đi xem."

~~→~~Chiếm, hoặc đóng quân, ở bất kỳ trấn nào trên con đường ấy.

~~✓~~Là cướp, không phải quân đội. Ngươi được 200 vàng và một viên tướng từng là tù binh của chúng.

~~✗~~Là quân đội. Chúng đã dựng trại chín mùa, giờ đã 1.800 người và ở sâu trong đất ngươi bốn mươi dặm.

### Nó muốn một viên tướng, hoặc một đạo quân

Bốn Trăm Người*thẻ*

"Ông ta đợi ngoài sảnh, việc không ai bảo ông ta làm. Ông ta nói không xin một chức lớn."

~~→~~Giao cho một viên tướng đích danh một đạo quân.

~~✓~~Ông ta không để mất một người lính nào mà không buộc phải mất. Hai trấn của ngươi thôi cần quân đồn trú.

~~✗~~Từ chối hai lần và ba trấn dựng cờ *ông ta*. Không có trận nào — quân đồn trú tự mở cổng. Ông ta giữ tường thành và kho thóc của ngươi.

Lính Trường Yên*lối mở*

"Lính Trường Yên không chịu theo ai khác. Họ chưa nói câu ấy ra miệng."

~~→~~Đặt một viên tướng cụ thể chỉ huy một đạo quân cụ thể.

~~✓~~Đạo quân đó được +14% và không bao giờ vỡ trận khi ông ta còn sống.

~~✗~~Giao cho người khác thì 400 người biến mất trước kỳ điểm binh sau. Không sự kiện nào nổ ra. Con số chỉ đơn giản là thấp hơn.

Ai Mặc Áo Giáp Của Ngươi*đòn giáng → thẻ*

"Chúng giữ bến đò và chúng biết lá cờ nào là của ngươi. Đêm nay có thể một người khác mặc nó mà ra khỏi trại."

~~→~~**Chọn viên tướng nào sẽ chết.** Gọi tên ông ta chính là toàn bộ tấm thẻ.

~~✓~~Ngươi thoát. Mọi viên tướng còn sống được +15 lòng trung vĩnh viễn, và trấn ông ta ngã xuống có sàn lòng dân không bao giờ tụt.

~~✗~~Từ chối chọn thì ngươi mất đạo quân, mất hai trấn, và mất luôn cả ông ta.

Bà Không Nhận Chức Ấy*thẻ*

"Tôi muốn cưỡi cơn gió mạnh, đạp luồng sóng dữ. Tôi không muốn một cái kho thóc ở Thanh Hoá."

~~→~~Cho bà cầm quân ngoài mặt trận thay vì chức trấn thủ hợp lý, hoặc mất bà.

~~✓~~Bà là tướng giỏi nhất trong ván và bà biết điều đó. Võ lực tăng +2 mỗi trận thắng, không có trần.

~~✗~~Bà bỏ đi. Bốn mươi mùa sau bà cầm đầu liên minh, và bà không hề kém đi.

Hai Người Cùng Đánh Chi Lăng*lời đồn*

"Họ đã bắt đầu ăn cùng nhau. Cả hai đều không ăn với ai khác."

~~→~~Giữ hai viên tướng cụ thể trong cùng một đạo quân một thời gian.

~~✓~~Kết nghĩa. Mỗi người +12% khi cùng phục vụ, vĩnh viễn, và không ai phản ngươi chừng nào người kia còn sống.

~~✗~~Tách họ ra thì một người xin nghỉ phép. Ông ta không quay lại.

Thằng Bé Với Quả Cam*thẻ*

"Nó còn quá nhỏ để dự hội nghị. Nó đứng ngoài đã một canh giờ. Có nước cam chảy xuống cổ tay nó."

~~→~~Cho vào, hoặc đuổi về.

~~✓~~Cho vào: trong bốn mùa nó đem về 600 gia binh của chính nhà nó.

~~✗~~Đuổi về: **nó vẫn dựng cờ.** Ngươi không điều khiển được đạo quân ấy, không gọi về được, và nó lao vào kẻ địch mạnh nhất bản đồ. Thường thì nó chết.

### Nó muốn thứ gì đó từ hàng xóm của ngươi

Người Sứ Không Ai Tiếp*lối mở*

"Sứ giả của họ vẫn còn trong thành. Chưa ai tiếp. Ông ta đã thôi hỏi."

~~→~~Nâng quan hệ với một nước đích danh vượt 60.

~~✓~~Thuỷ quân của họ ở nhà khi liên minh xuất phát. Ngươi đánh hai kẻ thù thay vì ba.

~~✗~~Ông ta về nước và kể lại chính xác ngươi có bao nhiêu đạo quân và ở đâu.

Cuộc Hôn Nhân*thẻ*

"Họ xin kết thân, và gửi một người con trai sang triều. Hắn có duyên, hắn có tài, và lòng trung của hắn hiện ra là *không rõ*."

~~→~~Nhận, và bổ nhiệm hắn đi đâu đó. Hắn thực sự giỏi việc.

~~✓~~Bắt được thì âm mưu sụp, quan hệ của họ sụp theo — và ngươi giữ lại hắn, đã gãy và vẫn dùng được.

~~✗~~**Lông ngỗng rải trên đường**, cách nhau đúng một lý. Cái buff phòng thủ ngươi hưởng suốt mười phút hết hạn đúng mùa chúng tới.

Hoà Hiếu Quá Mức*đòn giáng*

"Ngươi đã hoà với mọi nước giáp biên. Một ông vua thứ tư, không giáp biên với ngươi, đã rút ra kết luận hiển nhiên."

~~→~~Không gì cả. Cái này nổ ra *vì* ngươi đã làm điều hợp lý.

~~✓~~—

~~✗~~Một đòi hỏi cống nạp từ một nước ngươi chưa từng gặp, hậu thuẫn bởi một đạo quân đã ở ngoài khơi. Thành công bị trừng phạt, cố ý.

Sáu Mùa Im Lặng*thẻ*

"Đừng nộp gì cả. Mùa này không, mùa sau cũng không. Để chúng tự hỏi liệu ta đã thôi sợ chưa."

~~→~~**Từ chối mọi đòi hỏi cống nạp suốt sáu mùa**, bất kể ai hỏi.

~~✓~~Tần suất đòi hỏi của mọi nước giảm một nửa tới hết ván. Ngươi mua được nó bằng gan, không phải bằng vàng.

~~✗~~Lỡ một lần là về lại từ đầu, và kẻ ngươi vừa nộp sẽ nói cho các nước khác biết ngươi đáng giá bao nhiêu.

### Nó muốn tài nguyên, hoặc muốn ngươi kiên nhẫn

Vị Sư Biết Đếm*thẻ*

"Nhà chùa xin giữ hộ vàng của ngươi. Vị sư trụ trì là người cẩn thận và đã hỏi, hai lần, rằng có bao nhiêu."

~~→~~Có đủ 400 vàng ở một chỗ khi ông ta quay lại.

~~✓~~Nó an toàn ở đó. Khi kinh thành bị cướp phá, quốc khố của ngươi còn nguyên — lần duy nhất điều đó từng xảy ra.

~~✗~~Ông ta đếm hộ người khác. Toán cướp kéo tới biết đúng con số và tới lấy đúng chừng ấy.

Kho Đầy Trong Năm Đói*lối mở*

"Gạo năm nay đắt. Gạo của ngươi rẻ vì ngươi có quá nhiều."

~~→~~Giữ 500 lương qua mùa đông thay vì tiêu.

~~✓~~Hai trấn láng giềng theo về *với ngươi*, mang cả dân, vì ngươi đã cho họ ăn.

~~✗~~Tiêu nó đi và nạn đói ập tới là nạn đói mà Sử Ký gọi thẳng tên ngươi ra.

Chín Trăm Lượng Nằm Im*lời đồn*

"Có kẻ trong kho bạc đã bắt đầu chép con số ấy lại mỗi tháng."

~~→~~Tiêu nó, hoặc chuyển nó, hoặc chấp nhận thứ đang tới.

~~✓~~Kịp tiêu xuống dưới 300: không có gì xảy ra, và ngươi không bao giờ biết đã suýt có gì.

~~✗~~**Quan Tể tướng đi trong đêm. Tiền cũng đi.** Toàn bộ.

Nuôi Quân Cho Đủ*lối mở*

"Họ chưa được trả lương bốn mùa. Họ không nói gì, và như thế mới đáng lo."

~~→~~Trả hết nợ lương — một khoản vàng thật, chẳng hào nhoáng gì.

~~✓~~Không có gì. Kết quả tốt nhất trong game thường là không có gì.

~~✗~~Đạo quân mạnh nhất của ngươi **không chịu xuất chinh**. Không vỡ, không mất — đơn giản là từ chối, suốt sáu mùa, và địch biết điều đó.

### Nó chẳng đòi gì cả — những đòn giáng

Ba Lá Cờ*đòn giáng*

"Ba trấn của ngươi đã theo về ông ta. Không có trận nào. Quân đồn trú tự mở cổng thành."

~~→~~Không gì cả. Hai lời đồn đã đi trước và chúng nằm trong Sử Ký.

~~✓~~—

~~✗~~Một **nước thù địch mới**, cắt ra từ đất ngươi, giữ nguyên tường thành, kho thóc và đường sá của ngươi. Từ giờ nó chơi theo luật của một nước địch.

Bến Đò Vân Đồn*đòn giáng*

"Đỗ Khắc giữ bến đò. Ông ta giữ được một ngày rưỡi. Ông ta không về nữa."

~~→~~Không gì cả. Không tung xúc xắc, không cứu, không chuộc.

~~✓~~Mọi viên tướng từng theo ông ta được +8 lòng trung, và bến đò mang tên ông ta trên bản đồ tới hết ván.

~~✗~~Bốn mươi mùa Nguyên soái, mất. Ghế ông ta bỏ trống và cả triều đều biết vì sao.

Nghị Viện Đã Bỏ Phiếu*đòn giáng*

"Cái học thuyết ngươi xây cả ván quanh nó đã bị gạch khỏi luật. Ngươi không được hỏi ý. Ngươi là vua; vẫn không được hỏi ý."

~~→~~Không gì cả.

~~✓~~—

~~✗~~Một **luật chơi ngươi đang trông cậy bị gỡ giữa ván**. Đây là kết quả khiến hệ thống truyện thực sự nguy hiểm chứ không chỉ kịch tính.

Một Viên Tướng Ngươi Quen*đòn giáng*

"Đạo quân đang tiến về Vân Đồn nằm dưới quyền một viên tướng ngươi quen. Ông ta giỏi hơn ngày trước."

~~→~~Không gì cả. Ông ta lặng lẽ bỏ đi ba mươi tám mùa trước, hoặc ở một ván chơi khác hẳn.

~~✓~~—

~~✗~~Ông ta có phép luyện quân cũ của ngươi, đội hình cũ của ngươi, và biết trấn nào của ngươi mỏng nhất. Ông ta không phải giặc vô danh và game sẽ gọi đúng tên.

Kinh Thành, Không Phải Biên Giới*đòn giáng*

"Không có giặc. Là loạn gạo. Chúng đang ở cổng cung và chúng là dân của ngươi."

~~→~~Không gì cả. Tấm thẻ kế tiếp hỏi ngươi xử ra sao, và cả hai cách đều tệ.

~~✓~~—

~~✗~~Ổn định sụp mà không có nguyên nhân ngoại bang và không có quân nào để đánh. Thịnh vượng cộng với lòng dân bị bỏ bê là thứ châm ngòi.

Mã Viện Đã Được Giao Quân*lời đồn*

"Mã Viện đã được giao quân."

~~→~~Không gì cả. Không ngày tháng. Không quân số. Không gọi tên trấn nào.

~~✓~~—

~~✗~~Đâu đó giữa tám và bốn mươi mùa nữa, tuỳ vào những thứ ngươi không nhìn thấy. Câu hay nhất trong cả bản thiết kế và nó tốn có sáu chữ.

### Nó cho, và chính việc cho là cái bẫy

Thanh Gươm Dưới Hồ*thẻ*

"Một người đánh cá kéo lưới lên được một lưỡi gươm. Cái chuôi tìm thấy sau, trên một cây đa, và nó vừa khít."

~~→~~Nhận nó. Không có gì nói rằng ngươi phải trả lại.

~~✓~~+30% sức mạnh quân đội, ngay lập tức, chừng nào ngươi còn giữ. Nó không tinh tế và nó không nói dối.

~~✗~~Giữ nó sau khi chiến tranh xong thì mỗi mùa lại có bốn mảnh truyện thích đáng thêm. Không mảnh nào tốt. Không ai từng nói cho ngươi biết điều này.

Sáu Mươi Lăm Thành*thẻ*

"Cả một vùng đã nổi lên chống chúng. Họ đang hỏi ai sẽ cầm đầu. Họ đang nhìn ngươi."

~~→~~Nhận cuộc khởi nghĩa.

~~✓~~**Sáu trấn cùng lúc**, miễn phí, cả dân lẫn thành. Món lợi đơn lẻ lớn nhất trong game.

~~✗~~Và một lời đồn, một mùa sau, có tên một người đàn ông trong đó. Xem ở trên.

Người Thợ Chăm*lối mở*

"Một tù binh từ cuộc chiến trước đã vẽ một thứ gì đó xuống nền đất ngục suốt một tháng."

~~→~~Thả hắn ra, và cấp vật liệu cho hắn.

~~✓~~Một lá bài Quyền vào bộ bài của ngươi vĩnh viễn — một lá thật, trong bộ thật, tới hết ván.

~~✗~~Để hắn đó thì hai mươi mùa sau, những cỗ máy công thành ngoài tường ngươi có một kiểu dáng lạ.

Ông Vua Không Con*lời đồn → đòn giáng*

"Vua họ chết và các em ông ta không nói chuyện với nhau. Có ba đạo quân và không có ngai."

~~→~~Không gì cả, hoặc tất cả. Có một tấm thẻ, và đó là một canh bạc.

~~✓~~Nước họ vỡ làm ba. Hai trong ba thà làm chư hầu của ngươi còn hơn làm thần dân của bên kia.

~~✗~~Nhúng tay vào mà thua thì cả ba giảng hoà với nhau, riêng để xử ngươi.

### Hai cái chỉ tồn tại được nhờ mô hình này

Các Bô Lão Trả Lời*thẻ, không được trả lời*

"Cả sảnh đầy các cụ già từ mọi trấn. Ngươi đã đặt câu hỏi trước mặt họ: đánh, hay hoà."

~~→~~Ngươi đưa ra các phương án. **Ngươi không chọn.** Họ chọn — theo lòng dân từng trấn và sự ổn định của triều đình.

~~✓~~Họ hô đánh. +25% sức mạnh quân đội và một sàn sĩ khí trong mười hai mùa, toàn quốc.

~~✗~~Họ khuyên hoà, và ngươi buộc phải hoà. Mười phút trị nước bị bỏ bê, thanh toán trong một câu, trước mặt tất cả.

Kho Thóc Đã Bị Bán*quy kết*

"Nạn đói này không phải tại trời. Kho thóc đã bị bán từ mùa đông năm ngoái, và Tể tướng là người ký."

~~→~~Không gì cả. **Nạn đói dù sao cũng sẽ xảy ra** — bộ mô phỏng tự sinh ra nó theo lịch của riêng nó.

~~✓~~Truyện chỉ đơn giản *nhận vơ* nó, và giờ nó có tác giả, có chữ ký, và có một cái tên để ngươi ra tay.

~~✗~~Tốn một cái hook và mười một chữ. Tỷ lệ kịch tính trên công sức cao nhất trong cả tài liệu này.

Danh sách này để chứng minh điều gì

Mọi hành động trong yêu cầu của anh đều có mặt ở đây dưới dạng một khoảnh khắc cụ thể chứ không phải một loại — xây một công trình cụ thể, chiếm một vùng đất cụ thể, nâng quan hệ với một nước cụ thể, giữ đủ một lượng tài nguyên, giao quân cho một viên tướng — và mọi kết quả cũng vậy: một đại quân được tung ra, một cuộc nổi dậy, một viên tướng chết, quốc khố bay sạch, được thêm quân, được thêm tướng. Sáu cái trong số này đã viết đủ tốt để đưa thẳng vào game.

06

## Một truyện, ba ván chơi

Đây là phần chứng minh, và là phần duy nhất thực sự quan trọng. Dưới đây là *một* câu truyện — một kho mảnh, một khuôn mẫu — diễn ra trong ba ván khác nhau. Không phải ba nhánh của một cái cây. Ba *hình dạng* khác nhau, dài ngắn khác nhau, với những mảnh xuất hiện ở ván này và không hề tồn tại ở ván kia.

Khuôn mẫu · Ngọn Cờ Lau

**Gieo mầm khi:** có bất kỳ viên tướng nào trong danh sách với danh vọng dưới 25. Không có thẻ nào hiện ra. Không có gì được thông báo. Ông ta chỉ đơn giản bị đánh dấu, và truyện bắt đầu quan sát.

**Dục vọng của nó:** được trao binh quyền · bị bỏ qua · đất nước mất đất · danh vọng của chính ông ta vượt vua. Nó có hai mươi hai mảnh và sáu kết cục. Trong ba ván dưới đây, nó dùng từ bốn đến bảy mảnh.

Ván A · ngươi dùng ông ta

Người Thống Nhất

lời đồn · mùa 12"Có một thằng bé ở Hoa Lư bày trận cho lũ trẻ bằng cờ lau. Chúng nghe lời nó."

ngươi giao quân cho ông ta ở mùa 19

lời đồn · mùa 26"Ông ta chưa để mất một người lính nào mà không buộc phải mất."

thẻ · mùa 41Thuộc tướng của ông ta xin cho ông ta cả vùng bắc — không phải để cai trị, mà để *giữ*. Quan Tể tướng chỉ ra rằng chức ấy không tồn tại.  
Đặt ra chức ấy · Từ chối · Cho một trấn rồi xem sao

lời đồn · mùa 58"Ba làng ở Trường Yên đã dựng cờ ông ta mà chẳng ai bảo."

kết cục · mùa 71Đại Cồ ViệtNhững trấn ông ta giữ thôi cần quân đồn trú. sàn lòng dân vĩnh viễn một lá bài Quyền vào bộ ông ta theo sang ván sau

Ván B · ngươi phớt lờ ông ta

Loạn Sứ Quân

lời đồn · mùa 14"Có một thằng bé ở Hoa Lư bày trận cho lũ trẻ bằng cờ lau. Chúng nghe lời nó."

thẻ · mùa 33Ông ta xin một chức chỉ huy. Không phải chức lớn.  
Cho một đạo · Chưa phải lúc · Nó là con nhà chăn trâu

ngươi phong người khác làm Nguyên soái ở mùa 44

lời đồn · mùa 45"Ông ta không tới dự lễ tấn phong."

lời đồn · mùa 52"Những người đáng lẽ có tên trong sổ quân của ngươi đang luyện tập ở một nơi khác."

lời đồn · mùa 55"Trường Yên mùa này không nộp thuế. Không ai chịu nói vì sao."

đòn giáng · mùa 57Ba trấn của ngươi đã theo về ông ta. Không có trận nào. Quân đồn trú tự mở cổng thành.

kết cụcMười Hai Sứ Quânmột nước thù địch mới, cắt ra từ đất của chính ngươi ông ta giữ nguyên chỉ số và công trình của ngươi

Ván C · ngươi thử, rồi lấy lại

Người Đã Bỏ Đi

lời đồn · mùa 9"Có một thằng bé ở Hoa Lư bày trận cho lũ trẻ bằng cờ lau. Chúng nghe lời nó."

ngươi giao quân ở mùa 15 — ông ta thua ở Chi Lăng

thẻ · mùa 22Ông ta mất bốn trăm quân và một mình trở về để tự nói ra điều đó. Triều đình muốn giao đạo quân ấy cho người khác.  
Lấy lại · Cứ để ông ta giữ · Hỏi ông ta đã xảy ra chuyện gì

lời đồn · mùa 31"Ông ta xin phép về thăm mộ mẹ."

kết cục · mùa 34Ông ta không trở lạiKhông phạt. Không một lời nhắn. Ông ta biến khỏi danh sách. Sử Ký chỉ chép rằng ông ta đã đi

— ba mươi tám mùa không có gì —

đòn giáng · mùa 72Đạo quân đang tiến về Vân Đồn nằm dưới quyền một viên tướng ngươi quen. Ông ta giỏi hơn ngày trước.

Hình 2 — cùng một khuôn mẫu. bốn mảnh, bảy mảnh, sáu mảnh. không bộ đếm nào mô tả nổi ván nào trong ba ván này

- **Ván B không hề có thất bại nào.** Người chơi chưa từng bỏ lỡ một mục tiêu. Họ phong một Nguyên soái, đó là một quyết định hoàn toàn hợp lý, và truyện đã đọc nó. Thảm hoạ là có chủ ý, là đáng, và hoàn toàn không được báo trước.
- **Kết cục của ván C không phải là kết thúc.** Truyện khép ở mùa 34 mà không có hậu quả nào cả — rồi ba mươi tám mùa sau, trong một bối cảnh hoàn toàn khác, nó tới đòi nợ.
- **Thẻ ở mùa 41 của ván A không tồn tại trong ván nào khác.** Điều kiện của nó là `kýỨc.thắngDướiTrướng >= 2 && danhVọng > danhVọngVua`. Phần lớn người chơi sẽ không bao giờ thấy nó, và như thế là đúng — một câu truyện có thể vét cạn là một câu truyện có bản hướng dẫn.

### Một mảnh truyện trông như thế nào

Mảnh · ngon-co-lau / ong-ta-lai-xin

- **Lên tiếng khi** — ông ta còn trong danh sách, chưa được bổ nhiệm, `kýỨc.đãXin >= 1`, và đã qua ít nhất mười hai mùa từ lần cuối ông ta nói.
- **Thích đáng hơn khi** — từ đó tới nay ngươi đã phong người khác; đất nước vừa mất một trấn; danh vọng ông ta vẫn cứ lên.
- **Bị chặn bởi** — bất kỳ kết cục nào đã nổ ra; ông ta đang cầm quân.
- **Giọng** — Thẻ.
- **Ghi lại** — `đãXin += 1`, và `lạnhNhạt += 1` nếu bị từ chối.

Hai mươi hai cái như thế, không có thứ tự nào giữa chúng, và truyện tự viết ra mình khác đi mỗi lần. Đây là toàn bộ mô hình dữ liệu — điều kiện, một trọng số, một giọng, và những gì nó nhớ. Nó không phức tạp hơn `foreignCardTemplates`, thứ đã chạy sẵn trong game.

07

## Chín cách giữ cho nó khó đoán

Sự khó đoán phải nằm ở cấu trúc. Nếu nó phụ thuộc vào việc người chơi chưa đọc mảnh truyện đó, nó chỉ sống được một ván.

| Cơ chế | Nó làm gì |
| --- | --- |
| **Bốc theo độ thích đáng** | Trong số các mảnh phù hợp, lựa chọn là ngẫu nhiên. Cùng một thế cuộc hai lần cho ra hai câu khác nhau. |
| **Im lặng** | Một truyện có thể cố ý không nói gì suốt ba mươi mùa rồi tiếp tục. Im lặng là một mảnh có điều kiện riêng, không phải một sự vắng mặt. |
| **Tiềm ẩn** | Truyện gieo mầm mà không có thẻ, không có thông báo. Ngươi không đếm được có bao nhiêu truyện đang chạy. |
| **Vọng lại** | Một mảnh trích lại đúng một việc ngươi đã làm, kèm tên và mùa. *"Ngươi đã giao quân cho ông ta vào mùa xuân năm thứ chín."* |
| **Rẽ hướng** | Ý đồ của truyện đổi giữa ván. Truyện về lòng trung biến thành truyện về kế vị. Không có gì báo trước cú rẽ ấy. |
| **Quy kết** | Truyện nhận vơ những sự kiện mô phỏng vốn dĩ vẫn xảy ra. Miễn phí, và làm thế giới có cảm giác được viết ra. |
| **Cố vấn nói dối** | Mỗi thẻ mang một câu từ một viên quan đang tại vị. Người có `lòng trung` thấp hoặc `danh vọng` cao sẽ khuyên theo hướng có lợi cho *chính hắn*. Không có gì đánh dấu điều đó. Đây mới là lúc `lòng trung` có ý nghĩa thật. |
| **Va chạm** | Hai truyện trên cùng một đối tượng hợp thành một mảnh không truyện nào viết. Người chơi sẽ tưởng nó được viết riêng cho họ. |
| **Thừa kế** | Ký ức của một truyện đã khép được các truyện gieo sau đọc, kể cả ở ván kế tiếp. |

Và một sự vắng mặt có chủ ý

Không có phần trăm ở bất cứ đâu. Giá phải trả thì chính xác, còn lại đều bằng lời. *"Ông ta không chắc nó chịu nổi."*

08

## Nó trông như thế nào

### Thẻ — đã bỏ bộ đếm

Ngọn Cờ Lau

Ông ta lại xin

**◉***Đinh Công*

nền · triều đình

Ông ta đang đợi ngoài sảnh, việc mà không ai bảo ông ta làm. Ông ta nói đã nghĩ về chuyện này rất lâu, và rằng ông ta không xin một chức lớn. Ông ta không nhắc gì tới lễ tấn phong.

Giao cho ông ta một đạo quân

Bốn trăm người và con đường phía bắc.

400 dân đinh60 vàng

Chưa phải lúc

Sẽ còn những mùa khác.

Nó là con nhà chăn trâu

Nói ngay chỗ triều đình nghe được.

+ ổn định triều đình

Đỗ Khắc, Nguyên soái — "Đừng cho hắn gì cả. Hạng người ấy chỉ nguy hiểm khi đã có thứ để mất."

**Không có bộ đếm chương.** Tiêu đề chỉ mang tên truyện. Ngươi không biết đây là mảnh thứ hai hay thứ chín, và không có tổng số nào để mà đi được hai phần ba.

**Hai trong ba phương án không tốn gì và không hứa gì.** "Chưa phải lúc" không phải là từ chối — nó là một câu trả lời mà truyện sẽ đọc, và là phương án phần lớn người chơi sẽ chọn hai lần trước khi nhận ra rằng *hai lần* mới là con số quan trọng.

**Phương án thứ ba là cái bẫy đội lốt phần thưởng.** Nó cho ổn định triều đình thật. Nó cũng ghi `bịNhụcMạ`, thứ mở ra bốn mảnh và chặn hai mảnh khác.

**Đỗ Khắc không vô tư.** Ông ta đang giữ đúng cái ghế người kia muốn. Không có gì trong giao diện nói ra điều đó.

#### Tranh: mặt người đang nói, và một tấm nền không thuộc về truyện nào

**Không truyện nào có tranh riêng.** Một bức vẽ "người đánh cá Vân Đồn" trở thành sai ngay khi khuôn mẫu gán vào một trấn khác — mà gán vào một trấn khác trên mỗi bản đồ chính là toàn bộ ý đồ của mô hình này. Tranh cụ thể và đối tượng ngẫu nhiên không thể cùng đúng.

Nên tấm thẻ mang hai thứ. Bên trái là **chân dung của chính người đang nói**, lấy từ danh sách tướng đã có sẵn — thứ này làm hai việc một lúc, vì nó cho người chơi biết ngay *truyện này nói về ai*, và đó là một nửa vấn đề dễ đọc ở §12 được giải quyết miễn phí. Bên phải là một **tấm nền khắc gỗ chung**, chọn theo thẻ phân loại chứ không theo truyện:

**triều đình****sông****đồng****biển****núi****hành quân****lửa****kho thóc****đêm****đám đông****đền****biên ải**

Mười hai tấm nền, sinh ra từ chính bộ mã khắc gỗ `washFill` / `inkPath` đã có, gieo hạt theo từng mảnh truyện nên không có hai bản in nào giống hệt nhau. Một mảnh khai báo `band: 'trieu-dinh'` và không bao giờ gọi tên một tấm ảnh. Việc cùng một tấm nền xuất hiện trong nhiều truyện khác nhau ở đây không phải là sự nhân nhượng — nó *đúng*, vì bản thân các truyện là khuôn mẫu chung và nên trông đúng như thế. Chi phí: vài giờ lập trình, một lần, thay vì hai mươi bức tranh.

### Lối mở — việc để làm, nằm ngay chỗ ngươi đang đứng

Trường Yên ◈

Đồng bằng · 4.100 dân · lòng dân 61

Tình trạng

**Sản lượng**lương 14 · hàng 6 · vàng 9

**Phòng thủ**18 · không quân đồn trú

Bổ nhiệm

**Trấn thủ**chưa có ai

Hướng phát triển

**Lương thực**rất hợp

Xây dựng

**Kho thóc**90 hàng hoá

◈ Người của Đinh Công sẵn lòng đắp con đê ấy mà không lấy gì, nếu có ai hỏi tới. Ông ta không hỏi.

Để họ đắp →

Đây là thứ thay cho thanh nhiệm vụ. Nó là dòng cuối của một bảng ngươi vốn đang xem, tô màu hoa hoè để đọc ra như một lời mời chứ không phải một chỉ số.

**Không thời hạn. Không hiện phần thưởng. Không tiến độ.** Nó sẽ ở đó một thời gian rồi biến mất, và chẳng có gì báo trước cả hai điều.

Nhận nó tốn của ngươi một suất xây ở một trấn có thể ngươi đang định dùng cho việc khác — một sự đánh đổi thật, quyết định vì một lý do ngươi không nhìn thấy hết.

**Không nhận cũng là một câu trả lời**, và trong Ngọn Cờ Lau thì đó mới là câu quan trọng. Cụm *"Ông ta không hỏi"* đang gánh rất nhiều nghĩa.

### Lời đồn — cách truyện hiện diện mà không đòi hỏi gì

◈
Những người đáng lẽ có tên trong sổ quân của ngươi đang luyện tập ở một nơi khác.

◈
Trường Yên mùa này không nộp thuế. Không ai chịu nói vì sao.

Một dòng trên thanh đầu màn hình sẵn có. Không dừng game, không hộp thoại, không cần xác nhận, không tốn suất nào trong ngân sách nhắc việc. Nó trôi qua rồi rơi vào Sử Ký.

Nó không mang chỉ thị và không có thời hạn — nhưng hai dòng như thế trong năm mùa là một lời cảnh báo, và người chơi nào đọc được sẽ tự đi xem Trường Yên mà không cần ai bảo.

**Đó là toàn bộ thiết kế gói trong một tương tác:** game không giao việc, và họ vẫn đi làm một việc gì đó.

### Sử Ký — một pho sử, không phải danh sách việc

Sử Ký

mùa 57 · năm thứ mười bốn

Đang được bàn tán

Ngọn Cờ Lau

"Trường Yên mùa này không nộp thuế."

◈ Đinh Công · ◈ Trường Yên

Kho Thóc Của Tể Tướng

"Giá gạo trong kinh đã tăng gấp đôi."

◈ Thăng Long

Đã chép

Lông Ngỗng

Cái lẫy đã bị tráo. Cổ Loa mất trong một mùa, và đường ra biên giới rải đầy lông ngỗng.

mùa 44

Người Đánh Cá Vân Đồn

Ngươi đã nghe ông ta và không làm gì, và con nước cũng chỉ là con nước.

mùa 21

**Chiếm chỗ của trang Danh mục.** Anh đã đánh giá trang ấy vô nghĩa khi đang chơi; đây mới là thứ người chơi thực sự mở ra.

**Không tiến độ. Không chấm. Không số đếm.** Một truyện đang chạy chỉ hiện câu mới nhất và những đối tượng nó đánh dấu. Ngươi thấy được *rằng* nó đang được bàn tán và *người ta vừa nói gì* — không bao giờ thấy nó đi được tới đâu, vì nó không đi tới đâu cả.

**Các dòng đã chép do chính mảnh kết thúc chúng viết ra**, thì quá khứ, mỗi truyện một câu. Kể cả những truyện chẳng có gì xảy ra — "con nước cũng chỉ là con nước" là một kết cục thật và xứng đáng có một dòng.

Hết ván, danh sách này chính là bản tổng kết. Nó là thứ người chơi chụp màn hình, và không tốn thêm gì để làm.

09

## Truyện lấy từ đâu

Sử Việt hợp với hệ thống này một cách khác thường, vì rất nhiều đoạn xoay quanh *một quyết định dưới áp lực* chứ không phải quanh sự bào mòn — và vì mấy giai thoại nổi tiếng nhất lại chính là chuyện *không biết điều gì đang tới*.

Luật đặt ra: sử phải cho ra một **hành vi**, không phải một cái tên. Nếu chỉ cho ra cái tên thì để ngoài.

| Nguồn | Chuyện đã xảy ra | Hành vi rút ra |
| --- | --- | --- |
| **Đinh Bộ Lĩnh** 968 | Con nhà chăn trâu bày trận cờ lau, lớn lên dẹp loạn mười hai sứ quân và dựng nước Đại Cồ Việt. | **Một người trở thành đúng cái ngươi tạo ra.** Ví dụ đầy đủ ở [§06](#reed). Kết cục của ông ta là dựng nước hoặc phản loạn, và cùng những mảnh ấy dẫn tới cả hai. |
| **Mỵ Châu – Trọng Thuỷ** truyền thuyết | Một cuộc hôn nhân liên minh. Chàng rể tìm ra chỗ giấu lẫy nỏ và tráo bằng đồ giả. Khi chạy, công chúa rắc lông ngỗng đánh dấu đường — cho hắn. | **Một món quà vẫn đang đọc ngược lại ngươi.** Mảnh lông ngỗng chỉ tồn tại nếu viên tướng bị đánh dấu đang trấn thủ một trấn biên giới, và nó nổ ra theo lịch của *hắn*. |
| **Hội nghị Diên Hồng** 1284 | Trước cuộc xâm lăng thứ hai của quân Nguyên, Thượng hoàng triệu các bô lão cả nước về hỏi nên hoà hay nên đánh. Họ hô đánh. | **Một tấm thẻ ngươi không được trả lời.** Ngươi đưa ra các phương án; các bô lão quyết, dựa trên lòng dân các trấn và sự ổn định của triều đình. Mười phút trị nước lặng lẽ được quy đổi trong một khoảnh khắc, và người chơi chỉ đứng nhìn. |
| **Bà Triệu** 248 | "Tôi muốn cưỡi cơn gió mạnh, đạp luồng sóng dữ… chứ không chịu khom lưng làm tì thiếp người ta." | **Một viên tướng có hoài bão không phải của ngươi.** Bà từ chối các chức ngươi giao. Ngươi từ chối lại thì bà bỏ đi — và truyện không kết thúc khi bà đi. |
| **Trần Quốc Toản** 1285 | Một vương tử còn quá nhỏ để dự hội nghị bóp nát quả cam trong tay, rồi tự dựng cờ và tử trận. | **Từ chối không phải là dữ kiện rỗng.** Ông ta hành động không cần lệnh của ngươi và kết quả hoàn toàn nằm ngoài tay ngươi. |
| **Hồ Quý Ly** 1400–1407 | Những cải cách thực sự tiến bộ — tiền giấy toàn quốc, hạn điền — áp đặt mà không có sự đồng thuận của dân. Rồi tiền giả, rồi đói, rồi quân Minh. Bảy năm. | **Quy kết.** Truyện này không gây ra gì cả. Nó nhận vơ những nạn đói và bất ổn mà bộ mô phỏng vốn dĩ sẽ sinh ra, và gán cho chúng một tác giả. |
| **Bạch Đằng** 938 & 1288 | Cọc bịt sắt đóng xuống lòng sông thuỷ triều, giấu kín lúc nước lên. Thuyền địch bị dụ vào lúc triều dâng và bị diệt lúc triều rút — hai lần, cách nhau 350 năm. | **Một việc ngươi làm từ rất lâu, nay tới đòi.** Không nhiệm vụ, không thời hạn. Đồn một câu, để người chơi dựng xưởng gỗ vì lý do của riêng họ, rồi nổ ra năm mươi mùa sau nếu quả có hạm đội nào tới. |
| **Lê Lai** 1419 | Lê Lai mặc áo Lê Lợi, ra ngoài chịu bắt và chịu chết, mua đường thoát cho chủ tướng thật. | **Một tấm thẻ hỏi viên tướng nào sẽ chết.** Không phải mất mát ngẫu nhiên — một cái tên, do ngươi chọn, và người sống sót mang dấu ấy vĩnh viễn trong mọi truyện gán vào ông ta về sau. |
| **Hoàn Kiếm** truyền thuyết | Thuận Thiên, thanh gươm từ đáy hồ, thắng cuộc chiến — rồi rùa vàng nổi lên đòi lại. Gươm là cho mượn, không phải cho hẳn. | **Một ân huệ đang bị đếm.** Không có gì báo rằng phải trả lại. Giữ nó chỉ đơn giản khiến vài mảnh truyện trở nên thích đáng hơn. |
| **Hai Bà Trưng** 40–43 | Sáu mươi lăm thành trì đổ trong vài tháng. Ba năm sau Mã Viện lấy lại toàn bộ. | **Một món quà kèm theo một cái tên.** Một lời đồn — *"Mã Viện đã được giao quân"* — và không bao giờ có ngày tháng. |
| **Quang Trung** Tết 1789 | Lên ngôi, đưa mười vạn quân ra bắc chia làm năm đạo, phá quân Thanh trong năm ngày Tết. | **Câu truyện duy nhất được phép gấp gáp.** Ngoại lệ duy nhất cho luật "thời gian không bao giờ là con số", vì toàn bộ kịch tính của nó nằm ở cái đồng hồ. |
| **Lý Thuấn Thần** Triều Tiên, 1597 | Một tin giả được gài khiến triều đình bắt giam và tra tấn chính viên tướng giỏi nhất của mình. Sau thảm bại họ phục chức cho ông, khi chỉ còn mười ba chiến thuyền. | **Một câu truyện mà kẻ đối địch là triều đình của chính ngươi.** Tin lời thì mất ông ta; bênh ông ta thì ổn định sụt và triều đình quay sang chống ngươi. |
| **Bản Năng Tự** Nhật, 1582 | Akechi Mitsuhide trở giáo với Oda Nobunaga đúng lúc ông ta đang ở đỉnh cao. | **Phản bội tính theo mức tập trung quyền lực.** Số quân, số trấn và số ghế mà một viên tướng nắm. Hiệu quả chính là cách ngươi chết. |
| **Fabius Maximus** La Mã, 217 TCN | Suốt một năm trời né đánh trong khi nước Ý cháy, và bị gọi là Kẻ Trì Hoãn như một lời sỉ nhục. | **Đúng và bị ghét cùng lúc.** Một truyện đọc sự *không hành động* của ngươi làm dữ kiện, phạt ngươi về mặt xã hội trong khi thưởng ngươi về mặt chiến lược. |

Về cách xử lý chất liệu này

Dùng *hình dạng* của sự kiện, và chỉ dùng tên thật ở những chỗ giọng điệu là tôn kính — Bạch Đằng, Diên Hồng, Lê Lai. Đặt tên hư cấu ở bất cứ đâu câu truyện cần một kẻ xấu hoặc một kẻ ngu: mạch Hồ Quý Ly nên ra mắt dưới hình một vị tể tướng cải cách không tên. Và phần lời Việt nên được **viết trước** cho những truyện này, chứ không phải dịch sang.

10

## Các game khác đã làm gì

Đọc lại theo góc phàn nàn ở trên thì ranh giới rất rõ: những game làm *chuỗi* là những game bị người chơi chê lặp lại, còn những game làm *kho mảnh* là những game hai mươi năm sau người ta vẫn nhắc.

| Game | Hình dạng | Nó chứng minh điều gì |
| --- | --- | --- |
| **King of Dragon Pass** kho mảnh | Khoảng 600 sự kiện, một hội đồng cố vấn mỗi người góp một câu trước khi ngươi chọn, và một pho sử tự động viết theo từng năm khi hết ván. | Họ hàng gần nhất và là mẫu để theo. Ba mươi năm rồi chưa ai làm hơn. Câu cố vấn và pho sử cuối ván đều gần như miễn phí và đều gánh việc rất nặng. |
| **Fallen London** kho mảnh | Storylet mở khoá bằng "quality" — những con số đơn giản bao trùm cả vật phẩm, kỹ năng lẫn tiến trình truyện. Bài viết của Emily Short về cấu trúc theo độ thích đáng so với phân nhánh là lý thuyết đằng sau §02. | Tiến trình truyện chỉ là một con số, nên mô hình dữ liệu không cần gì cầu kỳ. Và độ thích đáng thắng phân nhánh chính vì một cái cây thì học thuộc được. |
| **Old World** kho mảnh | Một bộ bài ảo: điều kiện kích hoạt, yêu cầu, hiệu ứng, kèm trọng số và độ ưu tiên. Mỗi sự kiện gán ngẫu nhiên các **đối tượng** — một nhân vật, một thành, một dòng họ, một đạo luật. | Gán đối tượng là hệ số nhân khiến hai mươi khuôn mẫu đọc ra như hàng trăm. Cũng là lời cảnh báo thành thật: Mohawk viết 1.200 sự kiện và dự tính 2.000. |
| **Crusader Kings III** đối tượng | Story cycle: một đối tượng bền vững thuộc về một nhân vật, có `on_setup`, các nhóm hiệu ứng hẹn giờ tự chạy, và `on_end`. Nó sống lâu hơn bất kỳ sự kiện đơn lẻ nào và chết cùng chủ nhân. | Đây là kiến trúc. Một truyện là một thứ *tồn tại trong file save* và có đồng hồ riêng — không phải một mục trong hàng đợi. Nhược điểm của họ là vô hình; của ta thì đọc được trong Sử Ký. |
| **Wildermyth** kho mảnh | Sự kiện biến đổi, làm tàn tật và giết các nhân vật có tên, vĩnh viễn, và những người sống sót thì nhớ. | Tính vĩnh viễn. Một câu truyện chỉ biết cho ngươi thứ này thứ kia thì không phải câu truyện. |
| **Griftlands** kho mảnh | Quan hệ với các nhân vật có tên tồn tại xuyên các ván chơi và làm đổi những gì ván sau đưa ra. | Khớp chính xác với cửa hàng Legacy, và là thứ khiến cú trả nợ ở mùa 72 của Ván C có thể xảy ra ngang qua ranh giới ván chơi chứ không chỉ trong một ván. |
| **Stellaris — khai quật** chuỗi | Sáu chương, mở khoá bằng việc một nhà khoa học thật sự đang khai quật một điểm trên bản đồ. | Đúng một nửa. Lý lẽ của chính Paradox — chuyện gắn với một nơi ngươi nhìn thấy thì dễ hình dung hơn — là lý do các truyện đánh dấu vùng đất. Nhưng bộ đếm chương và quãng chờ chính là thứ bị cắt ở đây. |
| **Endless Legend** chuỗi | Tám chương theo thứ tự cố định, mục tiêu sau bị giấu tới khi mở khoá, thưởng theo độ khó. | Giấu mục tiêu kế tiếp là hay và đáng giữ. Còn lại là đúng cái hệ thống nhiệm vụ mà bản này vứt đi. |
| **Total War: Three Kingdoms** chuỗi phản ví dụ | Dilemma và phân công triều đình. Lời phàn nàn kinh niên của cộng đồng là chúng lặp lại, và rằng từ chối một dilemma chỉ có nghĩa là sau đó sẽ bị giao đúng việc ấy dưới dạng nhiệm vụ. | Chính là thất bại mà bản này được thiết kế để tránh, với ngân sách lớn hơn game này rất nhiều. Mọi nhánh đều quy về một chỗ, nên đọc thẻ trở thành phí thời gian. |

11

## Nhịp độ và chi phí

Mô hình theo độ thích đáng *nhẹ hơn* cho ngân sách nhắc việc so với mô hình chuỗi, và đó là một may mắn đáng nói rõ.

`DecisionDirector` của chế độ ascent là file được tinh chỉnh kỹ nhất trong dự án, và các ghi chú trong đó chép lại đúng thất bại này: ở khoảng cách hai tick, một ván sinh ra khoảng 250 lượt nhắc trên 320 tick, một nửa số tick kết thúc với một hộp thoại đang mở, và bản đồ — toàn bộ mặt tiền nghệ thuật của chế độ — không bao giờ hiện lên. Chín loại đã tranh nhau hàng đợi đó rồi, và bốn trong số đó từng được đo là **không lên tiếng lần nào** trong một ván 320 tick trước khi có cơ chế lão hoá.

**Bảy mươi phần trăm những gì truyện nói là lời đồn**, thứ không tốn gì: không dừng game, không hộp thoại, không suất hàng đợi. Nhờ vậy truyện hiện diện liên tục mà chỉ tiêu tốn một phần nhỏ ngân sách. Thêm đúng một loại mới, `story-beat`, giới hạn ~15% số lượt nhắc, lên tiếng trong pha Triều đình, với một ngoại lệ duy nhất cho cái đồng hồ Quang Trung — đúng lối thoát mà nạn đói đã có sẵn.

### Chi phí xây dựng

**Lập trình, khoảng một tuần.** Một `StorySystem` gồm gieo mầm / gán / chấm điểm / lên tiếng / ghi nhớ. Một mảng `ActiveStory` và một `storyLog` trên `GameState`, đều là trường tuỳ chọn nên save cũ vẫn nạp được. Bộ chấm độ thích đáng, thực chất là một bộ lọc cộng một lượt bốc có trọng số. Một dòng lời đồn trên thanh đầu màn hình. Lối Sử Ký, tái dùng `laneList`.

### Mô hình sản xuất — đã chốt

Hai thứ phải chốt trước khi viết dòng mã nào

Cả hai bây giờ gần như miễn phí và về sau thì rất đắt để sửa, và cả hai đều là hệ quả của việc truyện là đối tượng bền vững chứ không phải sự kiện dùng một lần.

**1 · Văn bản truyện không nằm trong `src/i18n/catalogs/*.ts`.** Mấy file đó đã đủ lớn tới mức mở ra là khó chịu, và chúng được import ngay từ đầu — nhét vài chục nghìn chữ mảnh truyện vào đó nghĩa là đẩy toàn bộ kho truyện vào gói tải ban đầu, cho một chế độ mà phần lớn phiên chơi thậm chí không mở. Văn bản truyện phải nằm trong **các catalog riêng theo từng truyện, nạp trễ khi cần**, khoá theo `story.<id>.<fragment>`. Một ván chơi chạm tối đa sáu truyện, nên nó nên tải sáu file chứ không phải văn của một trăm hai mươi truyện. Chốt việc này trước khi viết mảnh đầu tiên, vì đổi về sau nghĩa là sờ vào từng khoá một.

**2 · Mã định danh mảnh truyện chỉ được thêm, không bao giờ đổi.** Một truyện đang sống trong file save giữ mã của mảnh nó vừa nói và những cờ nó đã ghi. Đổi tên `ong-ta-lai-xin` là mọi save đang dở truyện đó nạp vào một tham chiếu treo. Điều này biến mã định danh thành một *khế ước tương thích* ngay từ ngày truyện đầu tiên ra mắt: thêm thoải mái, không bao giờ đổi tên, không bao giờ dùng lại, và loại bỏ bằng cách đánh dấu chết chứ không xoá. Luật đó áp dụng cho cả tên cờ ký ức. Tuân thủ thì không tốn gì và vi phạm thì không cứu được — một người chơi đã đi hai tiếng vào ván không quan tâm vì sao Sử Ký của họ trống trơn.

Bản đầu của tài liệu này tính phần viết như văn bản viết tay ở hai ngôn ngữ, và đó là nơi con số 43.000 chữ cùng điểm số thấp sinh ra. Kế hoạch giờ không còn như vậy, và phép tính đổi hoàn toàn.

| Quyết định | Hệ quả |
| --- | --- |
| **LLM soạn nháp, anh biên tập** | Mảnh truyện được sinh ra theo một bản đặc tả cho từng mảnh rồi được biên tập lại. Khối lượng thôi là nút thắt. *Nhưng một nút thắt khác xuất hiện — xem rủi ro bên dưới.* |
| **Tiếng Việt là bản gốc** | Viết Việt trước nên giữ được giọng. Bản tiếng Anh là bản dẫn xuất và chỉ cần rà soát chứ không phải sáng tác. Số chữ không nhân đôi; công *người* giảm khoảng một nửa. |
| **Không tranh riêng cho truyện** | Mười hai tấm nền sinh tự động cộng chân dung sẵn có của người nói. Hai mươi bức tranh bị gạch khỏi ngân sách. |
| **Không hạn chót, ra từng chặng** | Mỗi chặng dưới đây đều tự ra mắt được và tự có giá trị. Dừng ở chặng nào cũng không phí gì. |

Rủi ro thay chỗ cho số chữ

**Đồng giọng.** Văn LLM hội tụ về một giọng điệu, và hai mươi hai mảnh trong cùng một kho mà nghe như nhau chính là kiểu lặp lại mà mô hình này dễ dính nhất — còn tệ hơn một chuỗi, vì chuỗi ít ra không tự lặp. Cách chữa là đặc tả mảnh truyện bằng *ràng buộc* chứ không phải bằng đề bài: một giới hạn độ dài cứng, một danh từ cụ thể bắt buộc (một địa danh, một dụng cụ, một bộ phận cơ thể, một mùi), một danh sách từ cấm lớn dần theo quá trình biên tập, và một luật rằng không hai mảnh nào trong cùng một kho được mở đầu bằng cùng một kiểu câu. Rồi biên tập theo nhịp. Đó là phần việc bây giờ, ít hơn 43.000 chữ rất nhiều nhưng không phải bằng không.

### Thứ tự làm — bốn chặng, mỗi chặng tự ra mắt được

| Chặng | Ra mắt cái gì | Công người |
| --- | --- | --- |
| **1 · Lời đồn** | Ba truyện, không thẻ nào cả. Những dòng nền phản ứng với việc anh làm, dấu trên các đối tượng, lối Sử Ký ở chỗ Danh mục để lại. Chứng minh bộ chấm điểm và vòng lưu/nạp save. | Vài buổi tối. Khoảng 40 dòng tiếng Việt. **Làm cái này trước và chơi thử trước khi cam kết bất cứ thứ gì khác** — nó trả lời câu hỏi anh có muốn tính năng này không. |
| **2 · Thẻ, ký ức, vọng lại** | Những mảnh dừng game và hỏi. Cờ ký ức. Câu cố vấn — bốn dòng mã đổi cách đọc của mọi tấm thẻ. Và **vọng lại**, thứ không được phép trượt sang chặng 4. | Bản đặc tả được viết ở đây, một lần, và mọi mảnh về sau thừa hưởng nó. Chặng biên tập nặng nhất. |
| **3 · Ngọn Cờ Lau, trọn vẹn** | Một truyện hoàn chỉnh: 22 mảnh, 6 kết cục, kể cả cái cắt một nước thù địch ra khỏi đất của chính anh. | Phần chứng minh. Nếu cái này ăn, thiết kế đúng. Nếu không, dừng ở đây và chỉ mất hai ngày cuối tuần. |
| **4 · Phần còn lại** | Đòn giáng, quy kết, va chạm, thừa kế, Legacy mang sang ván sau — rồi truyện thêm mãi, từng cái một, với nhịp nào tuỳ ý. | Mở ngỏ có chủ ý. Không hạn chót thì cái kho truyện là một khu vườn, không phải một hạng mục bàn giao. |

Sáu truyện làm thật sâu vẫn là mục tiêu đầu tiên đúng đắn. Không còn vì ngân sách nữa, mà vì một kho hai mươi hai mảnh mới là thứ mua được sự sống động, và sáu truyện hành xử như con người vẫn thắng mười hai truyện hành xử như bảng biểu.

12

## Chấm điểm thật lòng

Chấm như một tính năng để làm tiếp theo, cho game này, ở giai đoạn này. Bản đầu được 7,6 với chi phí nội dung là điểm trừ; bản hai được 8,1 với đúng điểm trừ đó. Bốn quyết định sản xuất vừa gỡ bỏ phần lớn nó, nên đây là lần chấm thứ ba và là lần cuối.

Tác động lên người chơiCó sửa được vấn đề thật không?

9.5

Bất ngờ & chơi lạiSống nổi tới ván thứ năm không?

9

Khớp với thứ đang cóPhải làm mới bao nhiêu?

9

Độ mới của thiết kếĐộ thích đáng + ba giọng + quy kết, trong vỏ 4X

8.5

Tính khả thiKhông hạn chót, bốn chặng tự ra mắt được

8 ↑

Rủi ro kỹ thuậtChỉnh bộ chấm, di trú save, nạp văn bản trễ

7.5

Chi phí nội dungLLM soạn nháp, Việt trước, không tốn tranh

7 ↑

Rủi ro dễ đọcNgười chơi có nhận ra nó đang phản ứng với mình?

7 ↑

Rủi ro giọng vănVăn LLM hội tụ về một giọng duy nhất

6 mới

Kết luận có trọng số

8.7 / 10  ·  trước là 8.1

**Nên làm.** Hai con số kéo điểm xuống đều là sản phẩm của những giả định tôi tự đặt ra mà không hỏi, và cả hai đã biến mất. Chi phí nội dung là 3,5 vì tôi tính 43.000 chữ viết tay ở hai ngôn ngữ; giờ là 7 khi mảnh truyện do LLM soạn theo đặc tả, tiếng Việt là bản gốc chứ không phải lượt thứ hai, và hai mươi bức tranh đã ra khỏi ngân sách. Tính khả thi là 4,5 vì tôi giả định một ngân sách hữu hạn chi cho một đích cố định; không hạn chót và bốn chặng tự ra mắt được thì việc làm xong không còn là rủi ro như trước.

**Quyết định về tranh là một cái được về thiết kế, không chỉ là tiết kiệm.** Nền chung cộng khuôn mặt người nói *đúng hơn* tranh riêng cho từng truyện, vì một câu truyện gán ngẫu nhiên một viên tướng và một trấn thì không thể có một bức tranh cụ thể mà không nói dối. Nó cũng đẩy tính dễ đọc lên: một khuôn mặt trên thẻ cho người chơi biết ngay truyện đang nói về ai, và đó là một nửa việc mà cơ chế vọng lại phải làm.

**Còn hai rủi ro, và cả hai đều về chất văn chứ không phải về cấu trúc.** *Dễ đọc* — một kho mảnh có thể phản ứng hoàn hảo mà vẫn đọc ra như nhiễu, nên vọng lại và những dòng chép quá khứ trong Sử Ký phải vào ở chặng 2. Và cái mới, *giọng văn*: mảnh do LLM soạn hội tụ về một giọng, và một kho mà cả hai mươi hai dòng nghe như cùng một người kể chính là kiểu lặp lại mô hình này dễ dính nhất. Cách chống là đặc tả mảnh bằng ràng buộc — giới hạn độ dài, một danh từ cụ thể bắt buộc, danh sách từ cấm lớn dần, không hai mảnh nào mở đầu cùng kiểu câu — và biên tập theo nhịp chứ không theo nghĩa. Lượt biên tập ấy là phần việc thật sự còn lại.

**Làm chặng 1 ngay tuần này.** Ba truyện, chỉ lời đồn, không thẻ, không ký ức, không phân nhánh — chỉ những dòng nền phản ứng với việc anh thực sự đã làm, và lối Sử Ký ở chỗ Danh mục để lại. Vài buổi tối thôi. Một thanh đầu màn hình thỉnh thoảng nói *"Ông ta không tới dự lễ tấn phong"* sẽ cho anh biết trong một buổi rằng phần còn lại của tài liệu này có đáng làm không, và nếu câu trả lời là không thì anh gần như chẳng mất gì.

#### Điều gì sẽ làm điểm này đổi

| Nếu… | Thì |
| --- | --- |
| **Vọng lại** và dòng chép quá khứ trượt sang chặng 4 | **rơi xuống ~7.** Tính phản ứng thành vô hình và cả thứ này đọc ra như chữ ngẫu nhiên. Đây là hai thứ rẻ nhất trong thiết kế và cũng chịu lực nhiều nhất. |
| Mảnh truyện ra mắt do LLM soạn mà không biên tập | **rơi xuống ~6,5.** Một người kể, hai mươi hai giọng, và người chơi nghe ra ngay trong một ván. Lượt biên tập không phải tuỳ chọn; nó chính là thứ mô hình sản xuất đã đánh đổi số chữ để lấy. |
| Mỗi truyện ra mắt với dưới ~15 mảnh | **rơi xuống ~7.** Lặp lại thấy rõ ngay trong một ván, còn tệ hơn chuỗi — chuỗi ít ra không tự lặp. |
| **Đòn giáng** bị cắt vì sợ quá nặng | **rơi xuống ~7,5.** Không có thứ gì đơn giản là giáng xuống thì người chơi luôn nắm quyền, mà kiểm soát thì trái ngược với kịch tính. |
| **Quy kết** được làm | **lên ~8,9.** Một cái hook và mười một chữ, và nạn đói mà bộ mô phỏng dù sao cũng sinh ra bỗng có tác giả và chữ ký. |
| Thẻ **Diên Hồng** ra đúng như thiết kế | **lên ~9.** Một tấm thẻ mà người chơi đứng nhìn một quyết định được đưa ra về mình, dựa trên mười phút trị nước lặng lẽ, là thứ khiến một game được nhớ. |
| **Thừa kế xuyên ván** được làm | **lên ~9,2.** Một viên tướng bỏ đi ở ván ba đang chỉ huy đạo quân giết ngươi ở ván năm chính là toàn bộ lời hứa của tính năng này, đã được giao. |

Bản thứ hai · tài liệu thảo luận · chưa viết mã · Throne of Đại Việt

Nguồn thiết kế — [Emily Short về cấu trúc theo độ thích đáng](https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/) · [QBN và storylet](https://videlais.github.io/simple-qbn/qbn.html) · [Dunham về systemic stories](https://www.gamedeveloper.com/design/the-designer-of-i-six-ages-i-i-king-of-dragon-pass-i-on-the-power-of-systemic-stories) · [Designing Six Ages, GDC](https://www.gdcvault.com/play/1025740/Designing-Six-Ages-a-Storytelling) · [Soren Johnson về sự kiện trong Old World](https://civfanatics.com/2021/10/01/old-world-designer-notes-8-soren-johnson-on-events/) · [CK3 story cycles](https://ck3.paradoxwikis.com/Story_cycles_modding) · [Stellaris dev diary về khảo cổ](https://forum.paradoxplaza.com/forum/developer-diary/stellaris-dev-diary-145-archaeology.1170190/) · [Endless Legend quests](https://endlesslegend.fandom.com/wiki/Quests) · [Phàn nàn về triều đình trong Three Kingdoms](https://steamcommunity.com/app/779340/discussions/0/1736635023059106949/)

Sử liệu — [Loạn 12 sứ quân](https://grokipedia.com/page/Era_of_the_Twelve_Warlords) · [Nhà Đinh](https://en.wikipedia.org/wiki/%C4%90inh_dynasty) · [Nỏ thần](https://www.vietnam.com/en/culture/art/fairy-tales/the-magic-crossbow-an-old-vietnam-tale-of-trong-thuy-and-my-chau.html) · [Hội nghị Diên Hồng](https://vi.wikipedia.org/wiki/H%E1%BB%99i_ngh%E1%BB%8B_Di%C3%AAn_H%E1%BB%93ng) · [Bà Triệu](https://en.wikipedia.org/wiki/Lady_Tri%E1%BB%87u) · [Trần Quốc Toản](https://en.wikipedia.org/wiki/Tr%E1%BA%A7n_Qu%E1%BB%91c_To%E1%BA%A3n) · [Hồ Quý Ly](https://grokipedia.com/page/H%E1%BB%93_Qu%C3%BD_Ly) · [Bạch Đằng 1288](https://en.wikipedia.org/wiki/Battle_of_B%E1%BA%A1ch_%C4%90%E1%BA%B1ng_(1288)) · [Khởi nghĩa Lam Sơn](https://en.wikipedia.org/wiki/Lam_S%C6%A1n_uprising) · [Thuận Thiên](https://en.wikipedia.org/wiki/Thu%E1%BA%ADn_Thi%C3%AAn_(sword)) · [Hai Bà Trưng](https://en.wikipedia.org/wiki/Tr%C6%B0ng_sisters) · [Quang Trung](https://localvietnam.com/culture/history/quang-trung/) · [Trận Minh Lương](https://en.wikipedia.org/wiki/Battle_of_Myeongnyang)
