# Phase 2 · Giai đoạn 2

**Focus:** make the existing game satisfying on mobile while giving desktop players meaningful strategic depth.

**Mục tiêu:** giúp game hiện tại thú vị, dễ theo dõi trên điện thoại và có chiều sâu chiến thuật thực chất cho người chơi máy tính.

**Status, September 13, 2026:** implementation roadmap scoped into 18 work packages. Hero Depth now has playable Ascent Beta implementation and an evidence report. Remaining roadmap and release gates stay tracked separately; experiments remain subject to playtest results.

**Trạng thái ngày 13/09/2026:** lộ trình có 18 gói công việc. Chiều sâu anh hùng đã có bản chơi được trong Ascent Beta và báo cáo bằng chứng. Các gói và điều kiện phát hành còn lại được theo dõi riêng; thử nghiệm vẫn phụ thuộc kết quả chơi thử.

**September 14 continuation:** new Hero Depth runs use numerical v2: corrected deed XP, forecast-based protection, scoped ransom, fortress commission guards, grouped aftermath and richer chronicle records. User correction: removed the comparison modal and floating HTML/Aa panels; hero actions use existing game screens. The [bilingual audit](hero-depth/index.html?lang=vi#completion-audit) keeps remaining code, balance and human/device gates explicit. Existing runs keep their pinned rules; death remains disabled.

**Làm tiếp ngày 14/09:** lượt Chiều sâu anh hùng mới dùng luật số học V2: sửa KN công trạng, bảo vệ theo dự báo, phạm vi chuộc, điều kiện ủy nhiệm pháo đài, tổng kết gộp và sử phong phú hơn. Điều chỉnh theo người dùng: bỏ hộp so sánh và bảng HTML/Aa nổi; thao tác anh hùng dùng màn hình game hiện có. Bảng đối chiếu song ngữ vẫn ghi rõ mã, cân bằng và tiêu chí người/thiết bị còn lại. Lượt đang chơi giữ luật đã chốt; vẫn tắt tử vong.

## Read and work · Đọc và triển khai

| Document | Use |
| --- | --- |
| [Gameplay review — English](gameplay-review-2026-09-12/index.html?lang=en) / [Tiếng Việt](gameplay-review-2026-09-12/index.html?lang=vi) | Baseline assessment, market comparisons, nine design loops, 48 recommendations and recorded evidence |
| [Interactive implementation roadmap — English / Tiếng Việt](implementation-roadmap.html) | 18 scoped work packages, dependencies, effort ranges, criticism and completion gates |
| [Hero depth — English](hero-depth/index.html?lang=en) / [Tiếng Việt](hero-depth/index.html?lang=vi) | New design addendum: service levels, specialization, evacuation, recovery, resident diplomacy, six cards and H01–H12 implementation packages / Bổ sung chiều sâu anh hùng và kế hoạch triển khai |
| [Implementation plan — English](implementation-plan.md) / [Tiếng Việt](implementation-plan.vi.md) | Complete Markdown version of the roadmap |
| [First implementation batch](first-implementation-batch.md) | Engineering checklist for baseline, correctness, controls, forecasts and recovery |
| [Validation protocol](validation-plan.md) | Software matrix, human playtests, balance comparisons and physical-device gates |
| [Backlog](backlog.md) | Current status of B01–B48; update this as implementation proceeds |
| [Report package notes](gameplay-review-2026-09-12/README.md) | Report data, translations and evidence files |
| [Phase 1 archive](../phase-1/README.md) | Earlier designs and implementation history |
| [Documentation index](../README.md) | Phase boundaries and shared reference folders |

The review is a dated baseline of the build inspected on September 12. Its weighted grades are editorial assessments, not measured enjoyment or a claim about later builds. Recorded simulations establish specific balance observations; human playtests and physical-device checks remain necessary.

**Hero Depth implementation, September 13:** [H01–H12 completion audit](hero-depth/index.html#completion-audit) distinguishes playable Beta systems from missing code/UX and unmet validation gates. Not every document item is implemented. Death stays disabled. This adds B23/R10 scope and does not promote anything to Stable. / **Triển khai chiều sâu anh hùng ngày 13/09:** Bảng đối chiếu H01–H12 phân biệt hệ thống Beta chơi được với mã/UX còn thiếu và tiêu chí chưa đạt. Chưa triển khai mọi mục trong tài liệu. Giữ tắt tử vong. Phần này mở rộng B23/R10, không đưa lên Stable.

Bản đánh giá ghi nhận phiên bản đã khảo sát ngày 12/09. Điểm số là nhận định có trọng số, không phải phép đo mức độ vui của người chơi. Mô phỏng hỗ trợ phân tích cân bằng; vẫn cần chơi thử với người thật và kiểm tra trên thiết bị thật.

## Design priorities · Ưu tiên thiết kế

1. **Trust and control.** Tell the truth about probabilities, forecasts and rewards; respect chosen pace, assistance and input bindings.
2. **A complete session.** Make the current phase readable, reduce avoidable interruptions, and prototype a finite objective with a satisfying stopping point.
3. **Mastery through decisions.** Prove that preparation, coherent builds and different plans matter; improve comparison and command tools around those decisions.

Ưu tiên lần lượt: **thông tin đáng tin và quyền kiểm soát** → **một phiên chơi trọn vẹn** → **chiều sâu từ quyết định**. Điện thoại cần thao tác ý định gọn và thời gian đọc phù hợp; máy tính cần so sánh, phím tắt ổn định và lập kế hoạch nhiều mặt trận. Hai nền tảng dùng chung luật cốt lõi.

## Working loop · Vòng lặp làm việc

1. **Idea / Đề xuất:** name the player problem, backlog ID and expected benefit.
2. **Critique / Phản biện:** test the assumption against the current implementation; identify complexity, exploit and mobile/desktop tradeoffs.
3. **Tune / Tinh chỉnh:** choose the smallest useful change and write observable acceptance criteria.
4. **Implement and validate / Triển khai và kiểm chứng:** play both layouts, check English and Vietnamese, and gather evidence appropriate to the change.
5. **Loop / Lặp lại:** record what worked, revise or reject the idea, then update the backlog status.

The roadmap defines initial scope and dependencies for each item; the first-batch checklist adds engineering detail. Revalidate the current behavior before starting implementation. After validation, link the evidence and the implementation revision from the tracker. A screenshot or simulation alone should not close an item whose acceptance criterion requires human or physical-device testing.

Trước khi làm một hạng mục, ghi rõ phạm vi, phụ thuộc và tiêu chí đạt. Sau khi kiểm chứng, dẫn liên kết bằng chứng và bản sửa đổi vào backlog. Không đánh dấu hoàn tất bằng ảnh chụp hoặc mô phỏng nếu tiêu chí yêu cầu người chơi hoặc thiết bị thật.

## Phase boundary · Ranh giới giai đoạn

Phase 1 preserves 36 original design documents. Shared art assets, research and [build references](../development/) remain outside the archive. New gameplay decisions belong here. The dated review remains the starting evidence; subsequent work should state where it agrees with, changes or rejects a recommendation.

Giai đoạn 1 lưu 36 tài liệu thiết kế gốc. Tài nguyên mỹ thuật và tài liệu dùng chung vẫn được giữ riêng. Các quyết định gameplay mới thuộc Giai đoạn 2 và cần ghi rõ đề xuất nào được giữ, sửa hoặc loại bỏ.
