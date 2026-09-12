# Phase 2 · Giai đoạn 2

**Focus:** make the existing game satisfying on mobile while giving desktop players meaningful strategic depth.

**Mục tiêu:** giúp game hiện tại thú vị, dễ theo dõi trên điện thoại và có chiều sâu chiến thuật thực chất cho người chơi máy tính.

**Status, September 13, 2026:** implementation roadmap scoped into 18 work packages, with a detailed first batch and validation protocol. Gameplay implementation has not started under this plan. Conditional experiments remain subject to core playtest results.

**Trạng thái ngày 13/09/2026:** đã chia lộ trình thành 18 gói công việc, có danh sách đợt đầu và quy trình kiểm chứng. Chưa triển khai gameplay theo kế hoạch này. Thử nghiệm tùy chọn được quyết định theo kết quả chơi thử phần lõi.

## Read and work · Đọc và triển khai

| Document | Use |
| --- | --- |
| [Gameplay review — English](gameplay-review-2026-09-12/index.html?lang=en) / [Tiếng Việt](gameplay-review-2026-09-12/index.html?lang=vi) | Baseline assessment, market comparisons, nine design loops, 48 recommendations and recorded evidence |
| [Interactive implementation roadmap — English / Tiếng Việt](implementation-roadmap.html) | 18 scoped work packages, dependencies, effort ranges, criticism and completion gates |
| [Implementation plan — English](implementation-plan.md) / [Tiếng Việt](implementation-plan.vi.md) | Complete Markdown version of the roadmap |
| [First implementation batch](first-implementation-batch.md) | Engineering checklist for baseline, correctness, controls, forecasts and recovery |
| [Validation protocol](validation-plan.md) | Software matrix, human playtests, balance comparisons and physical-device gates |
| [Backlog](backlog.md) | Current status of B01–B48; update this as implementation proceeds |
| [Report package notes](gameplay-review-2026-09-12/README.md) | Report data, translations and evidence files |
| [Phase 1 archive](../phase-1/README.md) | Earlier designs and implementation history |
| [Documentation index](../README.md) | Phase boundaries and shared reference folders |

The review is a dated baseline of the build inspected on September 12. Its weighted grades are editorial assessments, not measured enjoyment or a claim about later builds. Recorded simulations establish specific balance observations; human playtests and physical-device checks remain necessary.

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
