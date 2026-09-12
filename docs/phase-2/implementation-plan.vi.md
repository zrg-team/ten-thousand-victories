<!-- Generated from implementation-roadmap.json by build-implementation-roadmap.mjs. -->
# Lộ trình triển khai Giai đoạn 2

[English](implementation-plan.md) · [Tiếng Việt](implementation-plan.vi.md) · [HTML](implementation-roadmap.html?lang=vi)

**2026-09-13 · Đã xác định kế hoạch; chưa triển khai gameplay**

Làm quyết định hiện tại đáng tin, hoàn thành một đời trị vì trọn vẹn, rồi chứng minh chiều sâu chiến lược. Bắt đầu bằng mốc đo R00 và sửa độ đúng R01.

Đã lập kế hoạch cho đợt kế tiếp; chưa khẳng định triển khai gameplay. Trạng thái trong backlog là nguồn tiến độ chính.

[Danh sách đợt đầu (tiếng Anh)](first-implementation-batch.md) · [Quy trình kiểm chứng (tiếng Anh)](validation-plan.md) · [Backlog theo dõi tiến độ](backlog.md) · [Bản đánh giá gốc](gameplay-review-2026-09-12/index.html?lang=vi)

## Mốc mã đã khảo sát

3914a9db + current working tree, 2026-09-13.

- B01: ngoại giao tích lũy tín nhiệm tất định khi bổ nhiệm còn hợp lệ; phần trăm hiện tại là tiến độ. ETA thiếu hệ số triều đình. Sửa mô hình đại lượng, không chỉ tính từ.
- B02/B03: đã lưu tùy chọn; luật thực theo đợt/độ khó ghi đè nhịp và hướng dẫn. Tốc độ còn đổi nhịp mỗi lượt kinh tế, nên đo như bối cảnh cân bằng riêng.
- B04/B24: đã có tạm dừng trận nhưng Space bỏ qua; số phím làn lấy từ thanh hành động thay đổi. Dùng hành động hiện có qua phím ngữ cảnh ổn định.
- B05/B06: gia sản được xếp cho mọi lượt mới; vị trí tiêu đề/phụ đề cố định. Xét gia sản thực và đo chữ xuống dòng trong thành phần dùng chung.
- B12/B13: boss đầu hiện ở đợt 4. endAscentRun đánh dấu thua và ghi nhiều kho thưởng; dọn kết thúc xóa bản lưu. Chương giữa cần chuyển trạng thái có thể khôi phục riêng.

## Thứ tự triển khai

1. Bắt đầu: R00 + R01; kiểm tra lưu trữ ở R04. R02 điều khiển và R03 dự báo hoàn tất Mốc 1. Bắt đầu kiểm tra thiết bị/thao tác R12 ngay.
2. Tiếp theo: R05 nhịp, R06 chuẩn bị/tự động, R07 rõ phần thưởng. R08 mục tiêu cần các phần này cùng khôi phục R04. R09 hậu chiến hoàn chỉnh phản hồi phiên.
3. Sau đó: R10 kiểm chứng lối chơi; R11 thêm công cụ chỉ huy tùy chọn theo nền tảng. Hoàn tất cổng tiếp cận/hiệu năng R12 liên quan trước khi nhận mốc lõi.
4. Chỉ sau bằng chứng lõi: chọn thử nghiệm R13–R16 có lợi ích được chứng minh. B43–B48 giữ Hoãn ở R17. Không tự bắt đầu toàn bộ gói tùy chọn.

- M1: đại lượng đúng nghĩa, mở đầu hữu ích, tùy chọn được giữ, mặt trận so được, mẫu khôi phục đạt. Không thêm lọt lệnh hay thao tác không truy cập được.
- M2: một mục tiêu dễ hiểu có thể thắng, nhận thưởng, tiếp tục sau tải hoặc chơi thêm mà không nhân đôi thưởng. Chuẩn bị và hậu chiến có bằng chứng ngoài điểm sống sót.
- M3: ba lối có năng lực có tình huống hữu ích riêng; lệnh điện thoại/máy tính dùng cùng hành động mô phỏng hợp lệ. Có bằng chứng người thử và thiết bị thật.

## Khoảng công sức phần lõi

Giả định lập kế hoạch: một kỹ sư có kinh nghiệm, quen kho mã; bố trí người thử và thiết bị riêng. Ước lượng gồm kỹ thuật và kiểm tra liên quan, không gồm tuyển người thử, chờ thiết bị hay gửi cửa hàng; không phải cam kết lịch. Ước lượng lại sau R00/R01.

| Phạm vi | ngày công kỹ sư |
| --- | --- |
| Mốc 1 · Thông tin đáng tin và quyền kiểm soát (R00–R04) | 18–31 |
| Lõi R00–R12, gồm Mốc 1 | 69–117 |
| Thử nghiệm có điều kiện R13–R16 | +22–38 |

## Các gói công việc

| ID | Gói công việc | Hạng mục | Phụ thuộc | ngày công kỹ sư |
| --- | --- | --- | --- | --- |
| [R00](#r00) | Thiết lập mốc đo đáng tin cậy | B11 | — | 3–5 |
| [R01](#r01) | Sửa thông tin gây hiểu nhầm và phần mở đầu | B01, B05, B06, B42 | — | 3–5 |
| [R02](#r02) | Tôn trọng nhịp chơi, hỗ trợ và lệnh điều khiển | B02, B03, B04, B07, B24 | — | 6–10 |
| [R03](#r03) | Làm dự báo mặt trận có thể so sánh | B10 | R00 | 3–5 |
| [R04](#r04) | Thiết lập mẫu khôi phục và chuyển đổi dữ liệu | B41 | — | 3–6 |
| [R05](#r05) | Tạo nhịp phiên chơi dễ theo dõi | B08, B09 | R00, R02 | 4–7 |
| [R06](#r06) | Chứng minh chuẩn bị có giá trị, rồi hiện ngân sách tự động | B15, B16, B17, B18 | R00, R02, R03 | 7–12 |
| [R07](#r07) | Làm rõ phần thưởng và gia sản | B19, B30 | R01 | 4–6 |
| [R08](#r08) | Thử nghiệm một mục tiêu Ascent trọn vẹn | B12, B13, B14 | R04, R05, R06, R07 | 10–16 |
| [R09](#r09) | Giải thích thời điểm quyết định trận đánh | B27 | R00, R03 | 3–5 |
| [R10](#r10) | Kiểm chứng ba lối chiến lược nhất quán | B20, B21, B22, B23 | R00, R06, R07 | 8–14 |
| [R11](#r11) | Thêm chiều sâu điều khiển tùy chọn cho từng nền tảng | B25, B26 | R02, R03, R06 | 8–14 |
| [R12](#r12) | Kiểm chứng thao tác, khả năng tiếp cận và hiệu năng dài hạn | B36, B37, B38, B39 | — | 7–12 |
| [R13](#r13) | Thử phát lại tình huống luyện tập có giới hạn | B28 | R00, R09 | 5–8 |
| [R14](#r14) | Mở rộng trận sau khi kiểm chứng chiến lược | B29, B34, B35 | R03, R10 | 8–14 |
| [R15](#r15) | Tạo thử thách chuẩn hóa có thể chia sẻ | B31, B40 | R00, R07, R10 | 5–9 |
| [R16](#r16) | Làm rõ cam kết và khôi phục kinh thành | B32, B33 | R01, R03, R06, R11 | 4–7 |
| [R17](#r17) | Để mở rộng lớn ngoài đợt triển khai hiện tại | B43, B44, B45, B46, B47, B48 | — | — |

## R00

**Thiết lập mốc đo đáng tin cậy** · Mốc 1 · Thông tin đáng tin và quyền kiểm soát

[B11](backlog.md#b11)

**Phụ thuộc:** Không phụ thuộc gói khác; kiểm tra lại hành vi hiện tại trước

**Lợi ích người chơi:** So sánh thay đổi trên hồ sơ mới và đã có tiến trình, các chế độ chỉ huy và bố cục.

**Phản biện / rủi ro:** Điểm tự động cao có thể che khuất quyết định khó đọc. Thêm số liệu không tự đo được mức độ vui.

**Phạm vi triển khai đã tinh chỉnh:**

1. Mở rộng bộ chơi thử hiện có với bản ghi có phiên bản, bộ nhớ tách biệt và cấu hình luật/tùy chọn rõ ràng.
2. Ghi seed, bản sửa đổi, hồ sơ, chế độ, mục tiêu, tổn thất, đất, thời gian cạn tài nguyên, số hộp thoại và kết quả. Chỉ đo thời gian đọc trong phiên thời gian thực.
3. Lưu 16 seed đối chứng theo cặp; tái sử dụng công cụ hồ sơ mới của bản đánh giá và tách quan sát người chơi khỏi mô phỏng.

**Điều kiện hoàn tất:** Chạy hai lần cùng mẫu cho kết quả tất định trùng nhau; không trộn ngầm hồ sơ mới với hồ sơ đã chơi. Có bộ kết quả gốc và phiếu quan sát người chơi.

**Mã và tài liệu hiện có:**

- [test_scripts/playtest/playtest-lib.mjs](../../test_scripts/playtest/playtest-lib.mjs)
- [test_scripts/playtest/playtest-metrics.mjs](../../test_scripts/playtest/playtest-metrics.mjs)
- [docs/phase-2/gameplay-review-2026-09-12/evidence/review-fresh-metrics.mjs](../../docs/phase-2/gameplay-review-2026-09-12/evidence/review-fresh-metrics.mjs)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/playtest/playtest-metrics.mjs --seeds 16 --ticks 600 --json
```

## R01

**Sửa thông tin gây hiểu nhầm và phần mở đầu** · Mốc 1 · Thông tin đáng tin và quyền kiểm soát

[B01](backlog.md#b01) · [B05](backlog.md#b05) · [B06](backlog.md#b06) · [B42](backlog.md#b42)

**Phụ thuộc:** Không phụ thuộc gói khác; kiểm tra lại hành vi hiện tại trước

**Lợi ích người chơi:** Giải thích đúng ý nghĩa con số và đưa người mới tới quyết định hữu ích đầu tiên, không qua nghi thức trống.

**Phản biện / rủi ro:** Phần trăm ngoại giao là tiến độ tín nhiệm, không phải xác suất ngẫu nhiên. Bỏ gia sản trống không được che lợi ích thực; sửa hộp thoại dùng chung có thể ảnh hưởng màn khác.

**Phạm vi triển khai đã tinh chỉnh:**

1. Phân loại đánh giá chinh phục thành xác suất, tiến độ và ước tính. Dùng tốc độ tiếp nhận thực gồm hệ số triều đình; nêu điều kiện hủy.
2. Tổng hợp gia sản mở đầu từ Legacy, Dynasty và Cabinet. Chỉ bỏ khi không có lợi ích đã áp dụng hoặc lựa chọn cần làm; giữ giải thích tùy chọn trong hướng dẫn.
3. Đo chiều cao tiêu đề/phụ đề sau xuống dòng rồi phân bổ vùng nội dung/cuộn. Thống nhất thuật ngữ song ngữ cho xác suất, tiến độ, mùa và phạm vi phần thưởng.

**Điều kiện hoàn tất:** Ngoại giao không gọi tín nhiệm là xác suất; dự báo khớp khi trạng thái không đổi. Mở đầu mới/cũ giữ mọi lợi ích. Không chồng tiêu đề, phụ đề hay nút trong ma trận kiểm tra.

**Mã và tài liệu hiện có:**

- [src/systems/ascent/ConquestSystem.ts](../../src/systems/ascent/ConquestSystem.ts)
- [src/systems/AcquisitionSystem.ts](../../src/systems/AcquisitionSystem.ts)
- [src/state/types.ts](../../src/state/types.ts)
- [src/state/GameState.ts](../../src/state/GameState.ts)
- [src/scenes/conquest/prompts/inheritance.ts](../../src/scenes/conquest/prompts/inheritance.ts)
- [src/scenes/conquest/prompts/conquest.ts](../../src/scenes/conquest/prompts/conquest.ts)
- [src/ui/InkUI.ts](../../src/ui/InkUI.ts)
- [src/scenes/menu/shell.ts](../../src/scenes/menu/shell.ts)
- [src/i18n/catalogs/ascent.ts](../../src/i18n/catalogs/ascent.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-conquest-offer.mjs
node test_scripts/verify/verify-inheritance-screen.mjs
node test_scripts/verify/verify-resume.mjs
```

## R02

**Tôn trọng nhịp chơi, hỗ trợ và lệnh điều khiển** · Mốc 1 · Thông tin đáng tin và quyền kiểm soát

[B02](backlog.md#b02) · [B03](backlog.md#b03) · [B04](backlog.md#b04) · [B07](backlog.md#b07) · [B24](backlog.md#b24)

**Phụ thuộc:** Không phụ thuộc gói khác; kiểm tra lại hành vi hiện tại trước

**Lợi ích người chơi:** Giữ thời gian đọc và hướng dẫn đã chọn, đồng thời làm thao tác nhất quán trên cả hai nền tảng.

**Phản biện / rủi ro:** Đã có tùy chọn riêng nhưng cấu hình thực tế ghi đè chúng. Nhịp chậm đổi số nhịp chiến đấu mỗi lượt kinh tế nên có tác động cân bằng. Phím theo ngữ cảnh cần quyền xử lý rõ ràng.

**Phạm vi triển khai đã tinh chỉnh:**

1. Giữ khóa tùy chọn hiện có; bỏ ép tăng tốc và ẩn gợi ý, tách độ dễ đọc bong bóng khỏi độ khó địch. Hiện cấp địch thực nếu giữ tăng tiến chiến dịch.
2. Bản đầu giữ cặp đồng hồ mô phỏng/hiển thị hiện có; kiểm tra cân bằng riêng từng nhịp. Ngăn tùy chọn bong bóng của Skirmish rò sang Ascent.
3. Space điều khiển tạm dừng bản đồ hoặc trận hiện tại; menu và ô nhập giữ quyền phím khi mở. Dùng mã hành động cố định, nhãn phím và đổi phím có kiểm tra xung đột.
4. Giải thích chỉ huy trực tiếp và có trợ giúp trong luồng mở đầu/menu hiện có, cho chọn trên cả hai nền tảng và ghi cờ hardcore thực trong phép đo.

**Điều kiện hoàn tất:** Nhịp chậm và hướng dẫn vẫn giữ ở đợt 1/10/30, sau tải lại và sau Skirmish. Không lọt lệnh qua lớp phủ; đổi mặt trận không đổi phím Xây. Báo tác động nhịp chơi, không giả định chúng ngang nhau.

**Mã và tài liệu hiện có:**

- [src/game/battleOptions.ts](../../src/game/battleOptions.ts)
- [src/game/ascentConfig.ts](../../src/game/ascentConfig.ts)
- [src/input/desktopKeys.ts](../../src/input/desktopKeys.ts)
- [src/ui/ActionBar.ts](../../src/ui/ActionBar.ts)
- [src/scenes/SettingsScene.ts](../../src/scenes/SettingsScene.ts)
- [src/scenes/menu/front.ts](../../src/scenes/menu/front.ts)
- [src/scenes/conquest/battle/shell.ts](../../src/scenes/conquest/battle/shell.ts)
- [src/scenes/conquest/battle/dock.ts](../../src/scenes/conquest/battle/dock.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-battle-options.mjs
node test_scripts/verify/verify-escalation.mjs
node test_scripts/verify/verify-battle-pacing.mjs
node test_scripts/verify/verify-desktop-layout.mjs
```

## R03

**Làm dự báo mặt trận có thể so sánh** · Mốc 1 · Thông tin đáng tin và quyền kiểm soát

[B10](backlog.md#b10)

**Phụ thuộc:** [R00](#r00)

**Lợi ích người chơi:** Giúp người chơi biết quân phòng thủ có tới nơi bị đe dọa kịp lúc hay không.

**Phản biện / rủi ro:** SỨC MẠNH vương quốc gồm kinh tế. Đổi sang tổng số không rõ nghĩa khác vẫn gây nhầm; ước tính hiện tại không thể hứa một tương lai bất biến.

**Phạm vi triển khai đã tinh chỉnh:**

1. Tạo dự báo chỉ đọc gồm mục tiêu, thời gian tới, quân công, quân thủ kịp tới và giả định.
2. Dùng bộ đọc di chuyển/tiếp tế và phòng thủ hiện có; ghi riêng sức mạnh tổng thể vương quốc.
3. Cập nhật khi lệnh đổi và phân biệt lực lượng đã cam kết với viện binh chưa chắc chắn.

**Điều kiện hoàn tất:** Mẫu kiểm tra thời gian tới khớp quân thực tham chiến; không tính quân tới muộn, bị chặn hoặc đã triệu hồi là sẵn sàng.

**Mã và tài liệu hiện có:**

- [src/systems/ascent/PowerSystem.ts](../../src/systems/ascent/PowerSystem.ts)
- [src/systems/ascent/WaveDirector.ts](../../src/systems/ascent/WaveDirector.ts)
- [src/systems/ascent/fronts.ts](../../src/systems/ascent/fronts.ts)
- [src/systems/WarSystem.ts](../../src/systems/WarSystem.ts)
- [src/ui/ascent/AscentHud.ts](../../src/ui/ascent/AscentHud.ts)
- [src/scenes/conquest/screens/warBoard.ts](../../src/scenes/conquest/screens/warBoard.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-fronts.mjs
node test_scripts/verify/verify-invasion-reach.mjs
```

## R04

**Thiết lập mẫu khôi phục và chuyển đổi dữ liệu** · Mốc 1 · Thông tin đáng tin và quyền kiểm soát

[B41](backlog.md#b41)

**Phụ thuộc:** Không phụ thuộc gói khác; kiểm tra lại hành vi hiện tại trước

**Lợi ích người chơi:** Biết chính xác dữ liệu nào sống qua khởi động lại trước khi thêm chương hoặc giao dịch phần thưởng.

**Phản biện / rủi ro:** Bản lưu thủ công, tự lưu và kho tiến trình có vai trò khác nhau. Đồng bộ đám mây sẽ thêm một nguồn lỗi ngoài phạm vi.

**Phạm vi triển khai đã tinh chỉnh:**

1. Liệt kê snapshot, Legacy, Dynasty, Cabinet và tùy chọn; ghi dữ liệu cần có và không cần có trong bản xuất.
2. Tạo mẫu bản lưu cũ/hiện tại riêng và chứng minh khôi phục sau ghi lỗi, chạy nền, dọn dữ liệu khi kết thúc.
3. Kiểm tra sao lưu/khôi phục qua các ứng dụng nền tảng đã khai báo. Ghi kiểm tra thiếu thiết bị là còn chờ; sửa lỗi chuyển đổi đã xác nhận trước khi làm chương.

**Điều kiện hoàn tất:** Hợp đồng lưu trữ và mẫu chuyển đổi đạt, không ghi đè bản lưu thủ công của người chơi. Kết quả liên nền tảng nêu rõ nguồn lưu/thiết bị đã thử và phần còn chờ.

**Mã và tài liệu hiện có:**

- [src/state/save.ts](../../src/state/save.ts)
- [src/state/legacy.ts](../../src/state/legacy.ts)
- [src/state/dynasty.ts](../../src/state/dynasty.ts)
- [src/state/cabinet.ts](../../src/state/cabinet.ts)
- [src/game/awayPause.ts](../../src/game/awayPause.ts)
- [src/game/resilience.ts](../../src/game/resilience.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-save-lifecycle.mjs
node test_scripts/verify/verify-resume.mjs
```

## R05

**Tạo nhịp phiên chơi dễ theo dõi** · Mốc 2 · Phiên chơi trọn vẹn

[B08](backlog.md#b08) · [B09](backlog.md#b09)

**Phụ thuộc:** [R00](#r00), [R02](#r02)

**Lợi ích người chơi:** Cho người chơi dùng được thời gian chuẩn bị và biết mình đang ở giai đoạn nào.

**Phản biện / rủi ro:** Giới hạn hộp thoại cứng có thể che quyết định nạn đói hoặc xâm lược; sự kiện trong hàng đợi có thể hết hạn hoặc bị bỏ đói.

**Phạm vi triển khai đã tinh chỉnh:**

1. Mở rộng hàng đợi ưu tiên với cách hiển thị khẩn cấp, do người chơi gọi và tùy chọn; giữ lựa chọn hợp lệ và gộp lời khuyên cũ.
2. Ban đầu cho tối đa một hộp thoại tùy chọn tự xuất hiện mỗi giai đoạn chuẩn bị; để phần còn lại trong luồng triều vụ/thông báo hiện có.
3. Hiện hậu chiến, triều chính và tập hợp quân cùng cam kết kế tiếp, trạng thái đồng hồ. Tinh chỉnh ngân sách theo phiên quan sát.

**Điều kiện hoàn tất:** Quyết định khẩn và được gọi vẫn truy cập được, hộp thoại tùy chọn không bị bỏ quên, người thử nêu được giai đoạn và cam kết kế tiếp.

**Mã và tài liệu hiện có:**

- [src/systems/ascent/AscentState.ts](../../src/systems/ascent/AscentState.ts)
- [src/systems/ascent/DecisionDirector.ts](../../src/systems/ascent/DecisionDirector.ts)
- [src/systems/ascent/WaveDirector.ts](../../src/systems/ascent/WaveDirector.ts)
- [src/scenes/conquest/prompts/router.ts](../../src/scenes/conquest/prompts/router.ts)
- [src/scenes/conquest/screens/affairs.ts](../../src/scenes/conquest/screens/affairs.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-prompt-stack.mjs
node test_scripts/verify/verify-claiming-window.mjs
```

## R06

**Chứng minh chuẩn bị có giá trị, rồi hiện ngân sách tự động** · Mốc 2 · Phiên chơi trọn vẹn

[B15](backlog.md#b15) · [B16](backlog.md#b16) · [B17](backlog.md#b17) · [B18](backlog.md#b18)

**Phụ thuộc:** [R00](#r00), [R02](#r02), [R03](#r03)

**Lợi ích người chơi:** Làm đầu tư và hành động được ủy quyền có đánh đổi dễ hiểu.

**Phản biện / rủi ro:** Tăng thu nhập có thể chỉ làm địch thích ứng mạnh hơn. Dự báo cố định có thể bị lợi dụng, dự trữ có thể khiến trợ lý tự động không làm được gì.

**Phạm vi triển khai đã tinh chỉnh:**

1. Chạy đối chứng chuẩn bị theo cặp trước khi đổi hệ số; ghi mọi phần ngân sách địch và giữ cả kết quả không cải thiện hoặc xấu đi.
2. Tách bộ đọc dùng chung cho giá, duy trì, hoàn tất và thời gian cạn tài nguyên. Chỉ khóa cam kết xâm lược gần đã công bố, nêu rõ thích ứng về sau.
3. Thêm dự trữ vàng/lương/tiếp tế và giải thích hành động kế tiếp cho trợ lý hiện có. Lệnh tay ưu tiên; chỉ ra bế tắc dự trữ và cho tùy chọn vượt ngưỡng.

**Điều kiện hoàn tất:** Phân rã ngân sách địch khớp; người chơi giải thích được chi phí cơ hội; kết quả cặp cho biết chuẩn bị hữu ích ở đâu. Không chi quá ngầm hay bế tắc dự trữ vô hạn.

**Mã và tài liệu hiện có:**

- [src/systems/ascent/WaveDirector.ts](../../src/systems/ascent/WaveDirector.ts)
- [src/systems/ResourceSystem.ts](../../src/systems/ResourceSystem.ts)
- [src/systems/ascent/SupplySystem.ts](../../src/systems/ascent/SupplySystem.ts)
- [src/systems/ascent/AutopilotSystem.ts](../../src/systems/ascent/AutopilotSystem.ts)
- [src/systems/ascent/priceScale.ts](../../src/systems/ascent/priceScale.ts)
- [src/scenes/conquest/screens/build.ts](../../src/scenes/conquest/screens/build.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-economy.mjs
node test_scripts/verify/verify-delegation.mjs
```

## R07

**Làm rõ phần thưởng và gia sản** · Mốc 2 · Phiên chơi trọn vẹn

[B19](backlog.md#b19) · [B30](backlog.md#b30)

**Phụ thuộc:** [R01](#r01)

**Lợi ích người chơi:** Giúp phân biệt sức mạnh trong lượt, bài sở hữu và lợi ích cho lượt kế tiếp.

**Phản biện / rủi ro:** Bảng tổng hợp mới có thể thành hệ tiến trình thứ tư. Đổi tên không được đổi sở hữu hoặc nhân đôi công thức thưởng.

**Phạm vi triển khai đã tinh chỉnh:**

1. Dùng nhãn nhất quán: đời này, bộ sưu tập, đời kế tiếp trên chọn bài, Cabinet và kết quả.
2. Tạo một tổng hợp chỉ đọc từ bộ đọc gia sản và kho hiện có; giữ lối vào bộ sưu tập chi tiết.
3. Thử phân loại ba phần thưởng ở cả hai ngôn ngữ trước khi đổi kinh tế thưởng.

**Điều kiện hoàn tất:** Người thử phân loại đúng ba phạm vi ví dụ mà không được nhắc; số bản bài, đặc tính, số dư và tổng thưởng hiện có được giữ.

**Mã và tài liệu hiện có:**

- [src/systems/ascent/Inheritance.ts](../../src/systems/ascent/Inheritance.ts)
- [src/state/legacy.ts](../../src/state/legacy.ts)
- [src/state/dynasty.ts](../../src/state/dynasty.ts)
- [src/state/cabinet.ts](../../src/state/cabinet.ts)
- [src/scenes/CabinetScene.ts](../../src/scenes/CabinetScene.ts)
- [src/scenes/conquest/prompts/run.ts](../../src/scenes/conquest/prompts/run.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-inheritance.mjs
node test_scripts/verify/verify-cabinet.mjs
node test_scripts/verify/verify-dynasty.mjs
```

## R08

**Thử nghiệm một mục tiêu Ascent trọn vẹn** · Mốc 2 · Phiên chơi trọn vẹn

[B12](backlog.md#b12) · [B13](backlog.md#b13) · [B14](backlog.md#b14)

**Phụ thuộc:** [R04](#r04), [R05](#r05), [R06](#r06), [R07](#r07)

**Lợi ích người chơi:** Cho một chiến thắng thực và điểm dừng an toàn, cùng lựa chọn tiếp tục có ý nghĩa.

**Phản biện / rủi ro:** Hàm kết thúc hiện đánh dấu thua, ghi thưởng vào nhiều kho và chặn lưu sau đó. Dùng nó cho chương giữa có thể hỏng tiếp tục hoặc nhân đôi thưởng.

**Phạm vi triển khai đã tinh chỉnh:**

1. Thử giữ kinh thành qua đại xâm lược đầu và bảo toàn một biên trấn đã chọn. Boss hiện xuất hiện mỗi bốn đợt, nên đợt 4 là mốc ứng viên đầu; tinh chỉnh theo thời gian phiên quan sát.
2. Thêm tiến trình mục tiêu/chương có phiên bản và chuyển trạng thái rõ: đang chơi, hoàn tất, nhận thưởng-kết thúc, tiếp tục. Hoàn tất giữa chừng không gọi endAscentRun hay dọn bản lưu kết thúc.
3. Dùng biên nhận/nhật ký thưởng bền vững theo lượt và chương; lưu lựa chọn đang chờ trước khi hiện kết quả. Mỗi kho chỉ áp dụng một biên nhận tối đa một lần và khôi phục ghi dở.
4. Cho nhận thưởng-kết thúc, sang chương hai hoặc Vô tận. Thử một mục tiêu dài đổi cách ưu tiên; chỉnh thưởng theo thời gian để tránh cày kết thúc sớm.

**Điều kiện hoàn tất:** Phân biệt được thắng và thua; lựa chọn chương, phần thưởng sống qua khởi động lại/ngoại tuyến. Bấm lặp, tải lại và lỗi ghi từng phần không mất hoặc nhân đôi thưởng. Tiếp tục vẫn chơi được.

**Mã và tài liệu hiện có:**

- [src/state/types.ts](../../src/state/types.ts)
- [src/state/save.ts](../../src/state/save.ts)
- [src/systems/ascent/AscentTick.ts](../../src/systems/ascent/AscentTick.ts)
- [src/systems/ascent/AscentResolver.ts](../../src/systems/ascent/AscentResolver.ts)
- [src/systems/ascent/Ceremony.ts](../../src/systems/ascent/Ceremony.ts)
- [src/systems/ascent/WaveDirector.ts](../../src/systems/ascent/WaveDirector.ts)
- [src/scenes/conquest/prompts/run.ts](../../src/scenes/conquest/prompts/run.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-save-lifecycle.mjs
node test_scripts/verify/verify-dynasty.mjs
node test_scripts/verify/verify-cabinet.mjs
```

## R09

**Giải thích thời điểm quyết định trận đánh** · Mốc 2 · Phiên chơi trọn vẹn

[B27](backlog.md#b27)

**Phụ thuộc:** [R00](#r00), [R03](#r03)

**Lợi ích người chơi:** Biến kết quả thành bài học cho quyết định tiếp theo.

**Phản biện / rủi ro:** Một câu kết luận chắc chắn có thể suy diễn nguyên nhân từ các sự kiện chỉ xảy ra cùng nhau.

**Phạm vi triển khai đã tinh chỉnh:**

1. Ghi sự kiện trận có giới hạn với lượt/nhịp và quân tham gia; giữ tên chỉ huy cùng tổng kết thương vong.
2. Hiện một quan sát kiểm chứng được như viện binh tới muộn hoặc bị khắc chế kéo dài, kèm vị trí dòng thời gian.
3. Gắn nhãn giải thích chưa chắc chắn và cho mở số liệu chi tiết khi cần.

**Điều kiện hoàn tất:** Mỗi nhận định nổi bật truy được về sự kiện đã ghi; bản ghi có giới hạn và không đổi ý nghĩa sau lưu/tải.

**Mã và tài liệu hiện có:**

- [src/systems/ascent/battleReport.ts](../../src/systems/ascent/battleReport.ts)
- [src/systems/ascent/BattleSystem.ts](../../src/systems/ascent/BattleSystem.ts)
- [src/scenes/conquest/screens/aftermath.ts](../../src/scenes/conquest/screens/aftermath.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-aftermath.mjs
node test_scripts/verify/verify-costly-victory.mjs
```

## R10

**Kiểm chứng ba lối chiến lược nhất quán** · Mốc 3 · Thành thạo và chỉ huy

[B20](backlog.md#b20) · [B21](backlog.md#b21) · [B22](backlog.md#b22) · [B23](backlog.md#b23)

**Phụ thuộc:** [R00](#r00), [R06](#r06), [R07](#r07)

**Lợi ích người chơi:** Thưởng sự thành thạo qua ưu tiên khác nhau thay vì thêm nhiều hệ số.

**Phản biện / rủi ro:** Sống sót trung bình ngang nhau không chứng minh lối chơi đa dạng; chính sách tự động yếu có thể làm chiến lược tốt trông kém.

**Phạm vi triển khai đã tinh chỉnh:**

1. Định nghĩa lối kinh tế/tiếp tế, phòng thủ và tấn công có năng lực từ nội dung hiện có; xem lại quyết định thủ công trên seed chung.
2. So sánh 32–64 seed theo cặp với chế độ, hồ sơ rõ ràng; đo thắng mục tiêu, tổn thất và từng tình huống. Chỉ chỉnh hai tương tác bài hiện có sau phân tích.
3. Hiện ưu điểm và đánh đổi của học thuyết và ý định tự động tiếp theo; hiện chi phí cơ hội ở mọi lối bổ nhiệm tướng.

**Điều kiện hoàn tất:** Mỗi lối có tình huống hữu ích và giá phải trả có bằng chứng; không bỏ qua lựa chọn thống trị mọi tình huống trong tập đã thử. Dự báo bổ nhiệm khớp vai trò thực bị bỏ.

**Mã và tài liệu hiện có:**

- [src/data/ascentCards.ts](../../src/data/ascentCards.ts)
- [src/systems/ascent/PowerDraftSystem.ts](../../src/systems/ascent/PowerDraftSystem.ts)
- [src/systems/ascent/RealmDoctrineSystem.ts](../../src/systems/ascent/RealmDoctrineSystem.ts)
- [src/systems/ascent/CourtLaneSystem.ts](../../src/systems/ascent/CourtLaneSystem.ts)
- [src/scenes/conquest/screens/court.ts](../../src/scenes/conquest/screens/court.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-draft-depth.mjs
node test_scripts/verify/verify-hero-actions.mjs
```

## R11

**Thêm chiều sâu điều khiển tùy chọn cho từng nền tảng** · Mốc 3 · Thành thạo và chỉ huy

[B25](backlog.md#b25) · [B26](backlog.md#b26)

**Phụ thuộc:** [R02](#r02), [R03](#r03), [R06](#r06)

**Lợi ích người chơi:** Máy tính so sánh và xếp lệnh; điện thoại ra ý định ngắn gọn với cùng luật mô phỏng.

**Phản biện / rủi ro:** Bàn chỉ huy lớn có thể che bản đồ. Thêm thao tác hoặc bắt điều khiển vụn sẽ làm trải nghiệm điện thoại kém đi.

**Phạm vi triển khai đã tinh chỉnh:**

1. Lát cắt máy tính đầu: ghim hai trấn/mặt trận, so quân thủ kịp tới và thời gian đường đi, rồi xếp một lệnh có phản hồi hủy/đổi thứ tự.
2. Lát cắt điện thoại đầu: chọn quân, ý định, mục tiêu/xác nhận trong tối đa ba thao tác chính với đạo quân quen; hiện thời gian tới và cam kết trước khi thi hành.
3. Dùng lại kiểm tra lệnh hiện có, giữ ý định khi đóng bảng; giới hạn hàng hiển thị và dùng cơ chế danh sách ảo hiện có.

**Điều kiện hoàn tất:** Hai giao diện tạo lệnh hợp lệ tương đương; số thao tác và độ rõ bản đồ đạt phạm vi. Đường chết, quân không sẵn và lựa chọn cũ được giải thích rõ.

**Mã và tài liệu hiện có:**

- [src/systems/ascent/armyOrders.ts](../../src/systems/ascent/armyOrders.ts)
- [src/systems/ascent/StandingOrders.ts](../../src/systems/ascent/StandingOrders.ts)
- [src/scenes/conquest/screens/army.ts](../../src/scenes/conquest/screens/army.ts)
- [src/scenes/conquest/screens/armyTargets.ts](../../src/scenes/conquest/screens/armyTargets.ts)
- [src/scenes/conquest/screens/warBoard.ts](../../src/scenes/conquest/screens/warBoard.ts)
- [src/input/desktopKeys.ts](../../src/input/desktopKeys.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-land-command.mjs
node test_scripts/verify/verify-desktop-layout.mjs
```

## R12

**Kiểm chứng thao tác, khả năng tiếp cận và hiệu năng dài hạn** · Xuyên suốt · Thao tác và độ tin cậy

[B36](backlog.md#b36) · [B37](backlog.md#b37) · [B38](backlog.md#b38) · [B39](backlog.md#b39)

**Phụ thuộc:** Không phụ thuộc gói khác; kiểm tra lại hành vi hiện tại trước

**Lợi ích người chơi:** Giữ mỗi mốc dùng được trên thiết bị thật, kể cả chữ lớn và cách nhập thay thế.

**Phản biện / rủi ro:** Ảnh canvas không chứng minh thoải mái ngón tay hay truy cập ngữ nghĩa. Đo ngắn trên máy tính không xác nhận hiệu năng điện thoại khi nóng.

**Phạm vi triển khai đã tinh chỉnh:**

1. Kiểm tra đợt đầu trên điện thoại cấu hình thấp và máy tính bảng đã khai báo; đo bấm nhầm, khoảng cách nút và quyết định trên màn ngắn.
2. Thêm cỡ chữ dễ đọc qua bộ bố cục hiện có, rồi kiểm tra thứ tự focus, tín hiệu không lệ thuộc màu, truy cập chữ và thay thế giữ/vuốt. Xác định riêng việc lớn về lớp ngữ nghĩa từ kết quả.
3. Chạy bản production riêng 20 phút với trận đông và chạy nền/tiếp tục; so thời gian khung hình, độ trễ, bộ nhớ, khôi phục với mốc cùng thiết bị.

**Điều kiện hoàn tất:** Không có quyết định bắt buộc không truy cập được hoặc nút chính bị cắt trong ma trận đã thử. Kết quả nêu phần cứng, tùy chọn; thiếu thiết bị là cổng còn mở, không phải đã đạt.

**Mã và tài liệu hiện có:**

- [src/ui/InkUI.ts](../../src/ui/InkUI.ts)
- [src/platform/layout.ts](../../src/platform/layout.ts)
- [src/game/renderProfile.ts](../../src/game/renderProfile.ts)
- [docs/development/performance.md](../../docs/development/performance.md)
- [test_scripts/perf/android-emulator.mjs](../../test_scripts/perf/android-emulator.mjs)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-performance-layouts.mjs
node test_scripts/perf/performance-soak.mjs
```

## R13

**Thử phát lại tình huống luyện tập có giới hạn** · Thử nghiệm có điều kiện

[B28](backlog.md#b28)

**Phụ thuộc:** [R00](#r00), [R09](#r09)

**Lợi ích người chơi:** Cho thử lại một quyết định và hiểu giới hạn của phép so sánh.

**Phản biện / rủi ro:** Nhật ký sự kiện không phải bản phát lại tất định; trạng thái, thứ tự RNG và luật theo phiên bản đều ảnh hưởng kết quả.

**Phạm vi triển khai đã tinh chỉnh:**

1. Lưu một trạng thái trận giới hạn, trạng thái RNG, phiên bản luật và điểm quyết định.
2. Chứng minh cùng đầu vào ra cùng kết quả trước; sau đó cho đổi một lệnh, không thưởng tiến trình.
3. Gắn nhãn phiên bản không hỗ trợ và sai khác; giữ tùy chọn này ngoài lõi cho tới khi hậu chiến giúp hiểu tốt hơn.

**Điều kiện hoàn tất:** Phát lại chính xác đạt trước khi mở thử phương án khác; trạng thái không hỗ trợ báo rõ và không tác động kho chiến dịch.

**Mã và tài liệu hiện có:**

- [src/systems/ascent/BattleSystem.ts](../../src/systems/ascent/BattleSystem.ts)
- [src/systems/ascent/battleReport.ts](../../src/systems/ascent/battleReport.ts)
- [src/state/save.ts](../../src/state/save.ts)

**Kiểm tra hiện có cần mở rộng:**

Thêm kiểm tra hành vi tập trung cho tính năng mới trước khi đánh dấu Hoàn tất.

## R14

**Mở rộng trận sau khi kiểm chứng chiến lược** · Thử nghiệm có điều kiện

[B29](backlog.md#b29) · [B34](backlog.md#b34) · [B35](backlog.md#b35)

**Phụ thuộc:** [R03](#r03), [R10](#r10)

**Lợi ích người chơi:** Dùng địa hình và ràng buộc lịch sử Việt Nam để đòi hỏi chuẩn bị khác nhau.

**Phản biện / rủi ro:** Ba boss theo kịch bản hoặc nhãn lịch sử có thể thêm nội dung mà không thêm lựa chọn.

**Phạm vi triển khai đã tinh chỉnh:**

1. Thử một trận vượt sông/trận địa chuẩn bị với hai cách giải khả thi bằng địa hình và tiếp tế hiện có.
2. Nếu hiệu quả, làm ba yêu cầu boss có cảnh báo rõ trước hai mùa và luật dễ hiểu.
3. Dựng một màn lịch sử nhỏ từ tình huống đã chứng minh; dẫn nguồn tiền đề lịch sử, ghi rõ kết quả ngẫu nhiên/hư cấu.

**Điều kiện hoàn tất:** Màn nhỏ chứng minh hai kế hoạch hữu ích trước khi mở rộng; mỗi boss thưởng cách chuẩn bị khác thay vì chỉ tăng chỉ số.

**Mã và tài liệu hiện có:**

- [src/systems/ascent/WaveDirector.ts](../../src/systems/ascent/WaveDirector.ts)
- [src/systems/ascent/BattleSystem.ts](../../src/systems/ascent/BattleSystem.ts)
- [src/systems/ascent/SupplySystem.ts](../../src/systems/ascent/SupplySystem.ts)
- [src/game/ascentConfig.ts](../../src/game/ascentConfig.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-battle-moments.mjs
```

## R15

**Tạo thử thách chuẩn hóa có thể chia sẻ** · Thử nghiệm có điều kiện

[B31](backlog.md#b31) · [B40](backlog.md#b40)

**Phụ thuộc:** [R00](#r00), [R07](#r07), [R10](#r10)

**Lợi ích người chơi:** So kỹ năng mà không trộn tiến trình hoặc luật không tương thích.

**Phản biện / rủi ro:** Một seed chưa đủ tái hiện, và lượt chuẩn hóa không được xóa tiến trình người chơi sở hữu.

**Phạm vi triển khai đã tinh chỉnh:**

1. Chạy thử thách với lớp cấu hình tách biệt, khai báo độ khó, nhịp, hỗ trợ, chỉ huy và hiệu ứng tiến trình.
2. Mã chia sẻ chứa seed, phiên bản và cấu hình; kiểm tra đầu vào và giải thích lệch phiên bản.
3. Tách điểm theo luật tương thích; bắt đầu bằng so sánh cục bộ, chưa cần bảng xếp hạng máy chủ.

**Điều kiện hoàn tất:** Cùng mã được hỗ trợ tái tạo cùng thiết lập; thoát thử thách giữ tiến trình sở hữu và không trộn điểm khác luật.

**Mã và tài liệu hiện có:**

- [src/state/GameState.ts](../../src/state/GameState.ts)
- [src/state/legacy.ts](../../src/state/legacy.ts)
- [src/state/dynasty.ts](../../src/state/dynasty.ts)
- [src/state/cabinet.ts](../../src/state/cabinet.ts)
- [test_scripts/playtest/playtest-lib.mjs](../../test_scripts/playtest/playtest-lib.mjs)

**Kiểm tra hiện có cần mở rộng:**

Thêm kiểm tra hành vi tập trung cho tính năng mới trước khi đánh dấu Hoàn tất.

## R16

**Làm rõ cam kết và khôi phục kinh thành** · Thử nghiệm có điều kiện

[B32](backlog.md#b32) · [B33](backlog.md#b33)

**Phụ thuộc:** [R01](#r01), [R03](#r03), [R06](#r06), [R11](#r11)

**Lợi ích người chơi:** Biến nghĩa vụ ngoại giao và thời gian cứu kinh thành còn lại thành hành động rõ ràng.

**Phản biện / rủi ro:** Đếm ngược không có hành động khả thi chỉ gây áp lực; không cần thêm tiền tệ ngoại giao.

**Phạm vi triển khai đã tinh chỉnh:**

1. Hiện thời hạn, nghĩa vụ, hủy và hậu quả từ trạng thái thỏa thuận hiện có.
2. Hiện thời gian ân hạn kinh thành cùng ý định cứu viện/tái chiếm khả thi và thời gian tới.
3. Đưa một trong hai việc lên sớm nếu chơi thử hiện tại cho thấy nó chặn mục tiêu cốt lõi.

**Điều kiện hoàn tất:** Nghĩa vụ hiển thị khớp xử lý; gợi ý cứu viện không được tới sau hạn mà không cảnh báo.

**Mã và tài liệu hiện có:**

- [src/systems/DiplomacySystem.ts](../../src/systems/DiplomacySystem.ts)
- [src/systems/ascent/EnvoySystem.ts](../../src/systems/ascent/EnvoySystem.ts)
- [src/systems/ascent/AscentTick.ts](../../src/systems/ascent/AscentTick.ts)
- [src/scenes/conquest/screens/affairs.ts](../../src/scenes/conquest/screens/affairs.ts)
- [src/scenes/conquest/screens/armyTargets.ts](../../src/scenes/conquest/screens/armyTargets.ts)

**Kiểm tra hiện có cần mở rộng:**

```text
node test_scripts/verify/verify-foreign-relations.mjs
node test_scripts/verify/verify-crisis-vassal.mjs
```

## R17

**Để mở rộng lớn ngoài đợt triển khai hiện tại** · Phạm vi hoãn

[B43](backlog.md#b43) · [B44](backlog.md#b44) · [B45](backlog.md#b45) · [B46](backlog.md#b46) · [B47](backlog.md#b47) · [B48](backlog.md#b48)

**Phụ thuộc:** Không phụ thuộc gói khác; kiểm tra lại hành vi hiện tại trước

**Lợi ích người chơi:** Giữ thời gian cho lõi chơi đơn trọn vẹn.

**Phản biện / rủi ro:** Đa người chơi, hải chiến, điều khiển vụn bắt buộc, tiền tệ mới, bản đồ lớn hơn và cổng cày cuốc nhân phạm vi trước khi quyết định hiện tại được chứng minh.

**Phạm vi triển khai đã tinh chỉnh:**

1. Giữ B43–B48 ở trạng thái Hoãn; dùng điều kiện trong bản đánh giá để cân nhắc đưa lên.
2. Cần nhu cầu người chơi có bằng chứng, thử nghiệm giới hạn và ước lượng mới trước khi thêm vào mốc.

**Điều kiện hoàn tất:** Chưa xếp lịch triển khai; xem xét lại là quyết định thiết kế được ghi nhận, không tự mở rộng backlog.

**Kiểm tra hiện có cần mở rộng:**

Chưa xếp lịch triển khai.

## Vòng lặp làm việc

Đề xuất → phản biện theo mã hiện tại → thay đổi hữu ích nhỏ nhất → kiểm tra và chơi thử → tinh chỉnh hoặc loại bỏ → lặp lại. Mỗi triển khai gắn mã B, gói R, bản sửa đổi và bằng chứng. Bộ kiểm tra cũ có thể giữ hành vi cũ: sửa có chủ đích các khẳng định đó, giữ bảo vệ không liên quan.

## Cách quyết định game có tốt hơn

Vòng quan sát đề xuất: sáu người điện thoại và sáu người máy tính, có cả hai ngôn ngữ. Mốc đầu: 5/6 mỗi nhóm hiểu mục tiêu/giá/phạm vi thưởng; lệnh ý định quen trên điện thoại ≤3 thao tác chính; mục tiêu ngắn 8–12 phút, mục tiêu máy tính dài 20–35 phút. Mốc ≥70% muốn chơi tiếp của bản đánh giá tính trên người hoàn tất; phải báo cả người bắt đầu và số thực sự tiếp tục. Đây là giả thuyết, chưa phải kết quả.

Dùng 16 seed cặp cho mốc đầu, 32–64 cho ba lối xây dựng nhất quán. Nêu rõ hồ sơ, nhịp và chỉ huy. Kiểm tra EN/VI trên điện thoại/bảng/máy tính, chuyển bản lưu và khôi phục lỗi thưởng. Chạy production riêng 20 phút trên thiết bị thật được nêu tên. Điểm mô phỏng hay ảnh giả lập không đóng được cổng kiểm tra người/thiết bị.

## Lưu trữ và hoàn tác

Thêm giá trị mặc định cho snapshot cũ; giữ bản lưu tay riêng tự lưu. Hoàn tất chương không gọi luồng thua/ghi thưởng hiện tại. Dùng biên nhận giao dịch bền vững qua các kho tiến trình và phục hồi ghi dở. Hoàn tác có thể ẩn lối vào mới nhưng phải đọc được trạng thái đã lưu và giữ phần thưởng đã nhận.

## Cập nhật kế hoạch

Sửa implementation-roadmap.json rồi chạy node docs/phase-2/build-implementation-roadmap.mjs. Công cụ tạo lại Markdown hai ngôn ngữ và HTML này. Giữ tiến độ/bằng chứng trong backlog.md; dẫn thay đổi phạm vi tại đó. Bản nghiên cứu có ngày vẫn giữ nguyên.

