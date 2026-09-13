const t = (en, vi) => ({ en, vi });
/** September 14 continuation: supersedes the initial audit, preserving it as authoring history. */
export const auditRevision = {
  H01: {
    status: t('V2 implemented · full matrix open', 'Đã có V2 · còn ma trận đầy đủ'),
    present: t('New Beta runs snapshot numerical v2. V1 saves retain their rules. Failed departure, XP, fate, ransom and memorial writes preserve both slots; command retry and recovery reload are checked.', 'Beta mới chụp luật số học V2. Lưu V1 giữ luật cũ. Lỗi ghi khi đi, thưởng KN, số phận, chuộc và ghi công giữ cả hai ô; đã kiểm lệnh lặp và tải phục hồi.'),
    remaining: t('The five transaction fixtures do not cover every story, recruitment and faction-removal entrypoint or an operating-system kill. Complete that matrix and physical restart checks.', 'Năm tình huống giao dịch chưa bao phủ mọi điểm truyện, tuyển và loại phe hay hệ điều hành tắt ứng dụng. Cần hoàn tất ma trận và thử khởi động lại thiết bị.'),
  },
  H02: {
    status: t('V2 rules verified', 'Đã kiểm luật V2'),
    present: t('Successful participating commanders now receive 2 deed XP on legal withdrawal. A real requested resupply column awards its 2 deed XP only on final delivery. Both retain the dispatch/encounter window and duplicate protection. Curve and 6+2 cap are unchanged.', 'Tướng tham chiến rút hợp lệ nhận 2 KN công trạng. Đoàn tiếp tế được yêu cầu thật chỉ nhận 2 KN công trạng khi giao xong. Cả hai giữ cửa sổ lúc gửi/giao tranh và chống trùng. Không đổi đường cong và trần 6+2.'),
    remaining: t('Progression pacing and late-recruit usefulness remain H04/H12 balance questions, rather than missing deed hooks. A requested column means an actual resupply order with a positive deficit.', 'Nhịp trưởng thành và giá trị tuyển muộn còn là vấn đề cân bằng H04/H12, không còn thiếu điểm nối công trạng. Yêu cầu tiếp tế là lệnh gửi thật có thiếu hụt dương.'),
  },
  H03: {
    status: t('Game-native UI · access validation open', 'UI trong game · còn kiểm tiếp cận'),
    present: t('September 14 user decision: remove the comparison modal and floating Aa/HTML panels. Hero roster, details, transfers, grouped aftermath and chronicle use the existing Phaser/InkUI screens. Portraits now use fixed card frames with a compact bottom-right level badge; XP labels and bars sit inside the information panel. Keep destination training and actual contribution previews.', 'Quyết định người dùng ngày 14/09: bỏ hộp so sánh và bảng Aa/HTML nổi. Danh sách, chi tiết, điều chuyển, tổng kết gộp và sử anh hùng dùng màn hình Phaser/InkUI hiện có. Chân dung nay có khung thẻ cố định và nhãn cấp gọn ở góc dưới phải; số KN và thanh tiến độ nằm trong bảng thông tin. Giữ nghề ở đích và dự báo đóng góp thật.'),
    remaining: t('Validate readability, keyboard and screen-reader support within the game interface, including enlarged text and physical devices. Old 200% DOM-panel checks are superseded. The comparison modal is removed by request, not a missing feature to rebuild.', 'Cần kiểm dễ đọc, bàn phím và trình đọc trong giao diện game, gồm chữ lớn và thiết bị thật. Kiểm bảng DOM 200% cũ đã hết hiệu lực. Hộp so sánh bị bỏ theo yêu cầu, không phải tính năng thiếu để xây lại.'),
    file: 'src/scenes/conquest/screens/heroDepth.ts',
  },
  H04: {
    status: t('Effects and output caps shown · pacing open', 'Có hiệu ứng và trần sản lượng · còn nhịp độ'),
    present: t('Sixteen perks and one home respec remain. Governed food/supply modifiers now show raw and capped values from the production reader. Local measurements record offers, choices and level milestones.', 'Giữ 16 đặc tính và một lần học lại ở nhà. Hiệu chỉnh lương/thứ tiếp tế hiện số trước/sau trần từ bộ đọc sản lượng. Đo cục bộ ghi lựa chọn được mở, lựa chọn đã chọn và mốc cấp.'),
    remaining: t('Evaluate first/second-tier timing by peaceful role and late recruitment. Production-cap display does not yet form a complete per-category combat/diplomacy breakdown.', 'Đánh giá thời điểm bậc đầu/thứ hai theo vai hòa bình và tuyển muộn. Hiển thị trần sản lượng chưa là phân tích mọi nhóm chiến đấu/ngoại giao.'),
  },
  H05: {
    status: t('Route previews and tie ordering verified', 'Đã kiểm đường dự báo và thứ tự đồng thời'),
    present: t('Protection shows the named refuge and route/ETA before commitment. Transfer confirmation includes destination training, actual output change and cost. A real Ascent settlement test proves occupation resolves before a same-season hero arrival.', 'Bảo vệ nêu nơi trú, đường và thời gian trước khi chốt. Xác nhận đi có nghề đích, thay đổi sản lượng thật và giá. Kiểm xử lý mùa Ascent thật chứng minh chiếm đóng xử lý trước anh hùng đến cùng mùa.'),
    remaining: t('Expand simultaneous-front and background/reload route cases on devices. The <=3-action evacuation path still needs unaided-player evidence.', 'Mở rộng ca nhiều mặt trận và đường đi khi xuống nền/tải lại trên thiết bị. Luồng sơ tán ≤3 thao tác vẫn cần bằng chứng người chơi tự làm.'),
  },
  H06: {
    status: t('V2 forecast protection implemented', 'Đã có bảo vệ theo dự báo V2'),
    present: t('Default evacuation compares forecast loss with escape ETA + 1. It reads the shared invader forecast, occupation countdown or observed field attrition, without rolling enemies. Reinforcements, changed routes and worsening estimates revoke hold/consent and pause before settlement.', 'Sơ tán mặc định so thời điểm mất đất với thời gian thoát + 1. Đọc dự báo quân xâm lược chung, đếm chiếm đóng hoặc hao quân quan sát, không bốc kẻ địch. Viện quân, đổi đường và dự báo xấu hủy trụ/xác nhận, dừng trước xử lý mùa.'),
    remaining: t('Observed attrition is an estimate; insufficient observations produce an explicit unknown. Warning comprehension, simultaneous-front play and <=3-action evacuation remain human gates. No lethal activation.', 'Hao quân quan sát là ước tính; thiếu quan sát hiển thị chưa biết. Hiểu cảnh báo, chơi nhiều mặt trận và sơ tán ≤3 thao tác còn cần người thật. Không bật tử vong.'),
  },
  H07: {
    status: t('Table sampled · lethal gate closed', 'Đã lấy mẫu bảng · vẫn khóa tử vong'),
    present: t('10,000 seeded eligible draws for each of open, trapped/protected and test-only consented tiers use the production fate table, with 95% Wilson intervals. Resolver replay and failed-write recovery fixtures pass; no unconsented deaths in tested cases.', '10.000 lần bốc đủ điều kiện có seed cho mỗi nhóm có đường, bị vây/bảo vệ và xác nhận chỉ để kiểm dùng bảng số phận thật, có khoảng Wilson 95%. Kiểm bộ xử lý lặp và phục hồi lỗi ghi đạt; không chết thiếu xác nhận trong ca đã thử.'),
    remaining: t('These are outcome-table draws, not 30,000 complete battles. Complete the remaining combined-loss/crash entrypoint matrix and human consent gates before any lethal activation.', 'Đây là mẫu bảng kết quả, không phải 30.000 trận đầy đủ. Cần đủ ma trận mất gộp/lỗi theo điểm vào và tiêu chí xác nhận người thật trước khi bật tử vong.'),
    file: 'test_scripts/verify/verify-hero-v2.mjs',
  },
  H08: {
    status: t('Scoped recovery verified · players pending', 'Đã kiểm phục hồi có phạm vi · chờ người chơi'),
    present: t('UI ransom and concession commands now quote the recruited instance, exact captivity, turn, method and price. Same-price recapture or replacement rejects a stale confirmation; retry cannot pay twice. No-gold pacts retain resolved-wave expiry.', 'Lệnh UI chuộc/nhượng bộ báo cá thể tuyển, lần giam cụ thể, mùa, cách và giá. Bắt lại cùng giá hoặc thay người từ chối xác nhận cũ; lặp không trả hai lần. Hòa ước không vàng vẫn hết theo đợt đã kết thúc.'),
    remaining: t('Validate that players can discover and finish zero-gold recovery, and assess whether recovering a veteran is worth the cost.', 'Thử người chơi tìm và hoàn tất phục hồi không vàng, đánh giá cứu người kỳ cựu có đáng chi phí.'),
  },
  H09: {
    status: t('Cancellation and identity guards verified', 'Đã kiểm hủy và định danh'),
    present: t('Residency quotes/queued actions pin envoy identity and release-target captivity. Recall, host expulsion, lost charter, recaptured target and replaced envoy refund once without granting an effect. Action transitions are measured locally.', 'Báo giá/hành động thường trú khóa định danh sứ thần và lần giam đích cứu. Triệu hồi, trục xuất, mất thương ước, bắt lại và thay sứ hoàn một lần không tạo hiệu ứng. Chuyển trạng thái được đo cục bộ.'),
    remaining: t('Measure useful player choices among all three actions. Supply still supplements connected own-province production for three seasons; there is no new foreign economy.', 'Đo lựa chọn hữu ích của người chơi giữa cả ba hành động. Tiếp tế vẫn bổ sung sản xuất đất mình có kết nối trong ba mùa; không thêm kinh tế ngoại quốc.'),
  },
  H10: {
    status: t('V2 commission guards verified', 'Đã kiểm ràng buộc ủy nhiệm V2'),
    present: t('Frontier Commission requires an owned fortress and active governor, before the first combat beat/order. Leaving removes defense immediately but retains the production penalty through the next settlement. V1 keeps its original timing. Six policy effects and draft reservations remain.', 'Ủy nhiệm biên cương cần pháo đài của mình và quan đang làm, trước nhịp/lệnh chiến đấu đầu. Đi bỏ phòng thủ ngay nhưng giữ phạt sản lượng qua lần xử lý mùa kế. V1 giữ thời điểm cũ. Giữ sáu hiệu ứng và đặt chỗ lượt thẻ.'),
    remaining: t('Set B remains experimental opt-in content; its player-usage and residency/recovery validation gate is not closed by effect fixtures alone.', 'Bộ B vẫn là nội dung thử nghiệm chủ động bật; kiểm hiệu ứng chưa đủ đóng tiêu chí sử dụng bởi người chơi và thường trú/phục hồi.'),
  },
  H11: {
    status: t('Records and grouped aftermath implemented', 'Đã có bản ghi và tổng kết gộp'),
    present: t('V2 memorials preserve former assignment, historical posting name and accepted-risk revision before cleanup. These fields display in the chronicle, including after departure. Duplicate memorial commands are inert. Roster opens one grouped aftermath; archive failure updates the existing reign-end message and controls, with retry, stay and explicit unsaved exit; no browser dialog.', 'Tưởng niệm V2 giữ vị trí trước đó, tên nơi làm việc lúc ấy và bản xác nhận rủi ro trước dọn. Sử hiển thị các trường này, cả sau khởi hành. Lệnh ghi công trùng không đổi gì. Danh sách mở một tổng kết gộp; lỗi lưu sử đổi thông báo và nút ngay trên màn kết thúc triều đại, có thử lại, ở lại và chủ động rời khi chưa lưu; không mở hộp trình duyệt.'),
    remaining: t('Complete persistent cross-reign crash coverage and physical restart checks. While all writes fail, unsaved history exists only in the current session.', 'Hoàn tất kiểm lỗi lưu qua triều đại và khởi động lại thiết bị. Khi mọi lần ghi đều lỗi, lịch sử chưa lưu chỉ còn trong phiên hiện tại.'),
  },
  H12: {
    status: t('Instrumentation implemented · release open', 'Đã có đo lường · còn phát hành'),
    present: t('Bounded local transition events, deployment seasons by level, milestone timing, offer/choice counts and diagnostics are implemented. New hero-aware matched-seed and perk/card ablation harness verifies source hashes across each measurement.', 'Đã có sự kiện chuyển trạng thái cục bộ giới hạn, mùa làm việc theo cấp, thời điểm mốc, đếm mở/chọn và chẩn đoán. Bộ so seed có dùng anh hùng, tắt riêng đặc tính/thẻ kiểm hash mã qua từng phép đo.'),
    remaining: t('The v2 balance run is incomplete and later arms detected concurrent source changes; rerun on fixed source. Passing code checks is not proof of fun. The season denominator currently includes all living heroes, so availability-adjusted hoarding analysis remains open. Add a dedicated diplomacy-led strategy and late-recruit analysis. Actual screen readers, device performance, 6 mobile + 6 desktop players and >=10/12 unaided warning/evacuation remain gates. No Stable promotion.', 'Lượt cân bằng V2 chưa hoàn tất và các nhánh sau phát hiện mã đổi đồng thời; cần chạy lại trên mã cố định. Đạt kiểm mã không chứng minh vui. Mẫu số mùa hiện gồm mọi người còn sống, nên còn phân tích cất người có điều chỉnh theo khả năng làm việc. Cần chiến lược thiên ngoại giao và phân tích tuyển muộn. Trình đọc thật, hiệu năng thiết bị, 6 người điện thoại + 6 máy tính và ≥10/12 tự hiểu cảnh báo/sơ tán vẫn là tiêu chí. Không đưa lên Stable.'),
    file: 'test_scripts/verify/verify-hero-balance-v2.mjs',
  },
};
export const revisionNote = t('<strong>September 14 UI correction.</strong> Removed the comparison modal, floating Aa panel and browser archive dialog at the user’s request. Hero actions stay in the established game interface; archive failure stays on the reign-end page. Prior DOM accessibility checks are superseded. Numerical-v2 improvements remain, with 76 v2 and 159 v1 checks previously passing. Balance and human/device gates remain open.',
  '<strong>Sửa UI ngày 14/09.</strong> Đã bỏ hộp so sánh, bảng Aa nổi và hộp lưu sử của trình duyệt theo yêu cầu. Thao tác anh hùng ở giao diện game hiện có; lỗi lưu ở ngay màn kết thúc triều đại. Kiểm tiếp cận DOM cũ đã hết hiệu lực. Giữ cải tiến luật V2, với 76 kiểm V2 và 159 kiểm V1 đã đạt trước đó. Vẫn còn tiêu chí cân bằng, người chơi và thiết bị.');
