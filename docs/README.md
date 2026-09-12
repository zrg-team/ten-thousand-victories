# Documentation · Tài liệu

The project documentation is organized into two product phases. **Phase 2 is the current planning phase.** Its starting point is the September 12, 2026 gameplay review, with recommendations for mobile play and desktop strategy.

Tài liệu được chia theo hai giai đoạn phát triển sản phẩm. **Giai đoạn 2 hiện đang chuẩn bị triển khai**, dựa trên bản đánh giá gameplay ngày 12/09/2026, nhằm giúp game dễ chơi, thú vị trên điện thoại và có chiều sâu chiến thuật trên máy tính.

| Phase / Giai đoạn | Purpose / Nội dung | Status / Trạng thái |
| --- | --- | --- |
| [Phase 1](phase-1/README.md) | Original design, systems, UI and implementation history / Thiết kế và lịch sử phát triển ban đầu | Archived reference / Lưu trữ tham khảo |
| [Phase 2](phase-2/README.md) | Gameplay review, priorities and implementation tracking / Đánh giá gameplay, thứ tự ưu tiên và theo dõi triển khai | Planning; gameplay changes not started / Đang lập kế hoạch; chưa triển khai thay đổi gameplay |

## Start here · Bắt đầu tại đây

1. Read the [Phase 2 guide](phase-2/README.md) for the goals and working process.
2. Open the [interactive gameplay review](phase-2/gameplay-review-2026-09-12/index.html) and use **English / Tiếng Việt** to switch languages.
3. Open the [bilingual implementation roadmap](phase-2/implementation-roadmap.html), start with the [first batch](phase-2/first-implementation-batch.md), and update the [48-item backlog](phase-2/backlog.md) as work proceeds.
4. Consult the [Phase 1 index](phase-1/README.md) when investigating an earlier design decision.

Đọc hướng dẫn Giai đoạn 2, xem bản đánh giá có nút chuyển ngôn ngữ, rồi theo dõi kế hoạch triển khai và danh sách 48 hạng mục. Tài liệu Giai đoạn 1 giúp tra cứu lý do của các quyết định trước đây.

## Folder map · Cấu trúc thư mục

```text
docs/
  README.md                         phase index
  phase-1/                          36 archived design documents and index
  phase-2/
    README.md                       current phase guide
    implementation-roadmap.html     bilingual interactive delivery plan
    implementation-plan.md          generated English plan (also .vi.md)
    first-implementation-batch.md    detailed first-batch checklist
    validation-plan.md               software, human and device checks
    backlog.md                      editable B01–B48 status tracker
    gameplay-review-2026-09-12/      bilingual report, data and evidence
  development/                      shared build and performance references
  art/, brand/, design/             shared visual production references
  research/                         other research and old report URL redirect
  resources/                        reference material
  readme/                           images used by the project READMEs
  dong-ho-*/                        shared art studies and generated assets
```

The [development](development/), [art](art/), [brand](brand/), [design](design/), [research](research/) and [resources](resources/) folders remain shared references. Art prompts, generation logs and other production notes at this level also remain available across phases. [README images](readme/) retain their existing paths.

Các tài liệu kỹ thuật, mỹ thuật, nghiên cứu và tài nguyên dùng chung vẫn ở vị trí hiện tại. Chúng không tự động trở thành yêu cầu mới của Giai đoạn 2.

## How to update · Quy tắc cập nhật

- Put new gameplay specifications and decision records in `phase-2/`; reference the relevant backlog ID (`B01`–`B48`).
- Preserve Phase 1 as historical context. An old proposal or “live” label is not proof of current implementation; check the code and a current playtest.
- Keep the dated gameplay review as the baseline. Track changed decisions, implementation status and new evidence in the Phase 2 plan/backlog; create a newly dated review for a new assessment.
- Older headings such as “Phase 2 — Map MVP” inside the archived implementation plan describe that document’s local steps, not this product phase.

Viết đặc tả gameplay và quyết định mới trong `phase-2/`, kèm mã hạng mục. Giữ bản đánh giá có ngày làm mốc so sánh; cập nhật tiến độ và bằng chứng mới trong kế hoạch/backlog. Các tiêu đề “Phase” bên trong tài liệu cũ chỉ là các bước của kế hoạch cũ.
