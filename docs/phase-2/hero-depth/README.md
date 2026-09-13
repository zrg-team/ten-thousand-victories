# Hero Depth / Ascent Beta

**Playable in new opt-in Beta reigns; implementation and validation are incomplete. Death is disabled.**

**Chơi được trong triều đại Beta mới có chủ động bật; chưa hoàn tất triển khai và kiểm chứng. Tắt tử vong.**

Open [English](index.html?lang=en#implementation) or [Tiếng Việt](index.html?lang=vi#implementation).

The [completion audit](index.html#completion-audit) lists what exists and what is still missing for every H01–H12 package. Remaining work includes actual code/UX gaps, not only human testing. Earlier broad “implemented” labels were too strong.

[Bảng đối chiếu hoàn thành](index.html?lang=vi#completion-audit) ghi phần đã có và còn thiếu cho từng gói H01–H12. Vẫn còn mã/UX cần làm, không chỉ thử người chơi. Nhãn “đã triển khai” bao quát trước đó chưa chính xác.

The original design, interactive examples and H01–H12 tracker are preserved, with an implementation section covering the approved refinements and play/critique/tuning work. Source baseline at implementation start: 54f0b8da. Other work is active in the same checkout; see the regression caveats in the evidence.

- [Implementation evidence](implementation-evidence.json): reproducible commands, automated checks, matched-seed results and remaining gates.
- [Implementation authoring](implementation.mjs): bilingual implementation notes and ticket status.
- [Completion audit authoring](completion-audit.mjs): package status and concrete remaining work.
- [September 14 continuation](implementation-v2.mjs): numerical-v2 changes, verified fixes and remaining gates.
- [Design authoring](design-data.mjs): original design model and critiques, plus implementation status.
- Build: `node docs/phase-2/hero-depth/build.mjs`. Standalone HTML works offline and keeps the EN/VI switch.
- Raw captures and logs are deliberately ignored under `output/hero-depth/`; commit the source, verifiers and compact reviewed evidence.
- [Original document QA](document-validation.json) describes the earlier 69 document checks; it is not evidence of the new gameplay.

Play with Settings → Ascent Beta → new reign → Heroes. Existing Stable/Beta saves keep their original behavior. Hero actions use existing Phaser/InkUI screens. The comparison modal and floating HTML/Aa panels were removed by user request on September 14. No recurring taps are needed for service XP.

Chơi qua Cài đặt → Ascent Beta → triều đại mới → Anh hùng. Lưu Stable/Beta cũ giữ hành vi cũ. Thao tác anh hùng dùng màn hình Phaser/InkUI hiện có. Hộp so sánh và bảng HTML/Aa nổi đã bỏ theo yêu cầu ngày 14/09. Cống hiến không cần chạm lặp lại.

The code for the separate 5% lethal rule is present but disabled. Physical mobile devices, at least six mobile and six desktop participants, warning comprehension ≥10/12, and any unconsented-death check remain explicit release gates. Do not promote to Stable or enable death from automated results alone.

Nhánh tử vong 5% có mã nhưng đang tắt. Thiết bị di động thật, tối thiểu sáu người điện thoại và sáu người máy tính, hiểu cảnh báo ≥10/12, và kiểm không chết khi chưa xác nhận vẫn là điều kiện phát hành. Không đưa lên Stable hay bật chết chỉ dựa vào kết quả tự động.

Verification entrypoints (set `DEV_URL` to the running development server):

- `node test_scripts/verify/verify-hero-depth.mjs` — preserved numerical-v1 service, lifecycle, combat, policies and persistence.
- `node test_scripts/verify/verify-hero-v2.mjs` — new numerical-v2 rules, actual settlement ties, transaction failures, residency cancellation and 10,000 outcome-table samples per tier.
- `node test_scripts/verify/verify-hero-balance-v2.mjs` — 64 matched seeds, hero-aware agents, perk/card ablations and source-hash provenance (`PLAYTEST_URL`).
- `node test_scripts/verify/verify-hero-consent.mjs` — bilingual canvas consent and inline reign-end archive retry.
- `node test_scripts/verify/verify-hero-interface-v2.mjs` — game-native grouped aftermath, chronicle, absence of DOM popups and desktop preview timing.
- `node test_scripts/shot/shot-hero-depth.mjs` — real-season progression and game-native screenshots at 320/390/1440 widths.
- `node test_scripts/verify/verify-hero-document.mjs` — offline bilingual document and interactive examples.
- `node test_scripts/verify/record-hero-evidence.mjs` — regenerate curated evidence from completed local results.

The original balance comparison predates the review fixes. The v2 continuation adds hero-aware comparisons and separate perk/card ablations; the latest attempt is incomplete, with concurrent source changes detected in later arms. Rerun on fixed source. Physical-device and human validation still remain open.

So sánh cân bằng gốc có trước các sửa rà soát. Lượt V2 thêm so sánh có dùng anh hùng và tắt riêng đặc tính/thẻ; lượt mới nhất chưa hoàn tất và phát hiện mã đổi đồng thời ở các nhánh sau. Cần chạy lại trên mã cố định. Vẫn còn kiểm thiết bị thật và người chơi.

September 14 UI validation: 43/43 game-native interface checks and 72/72 canvas consent/archive checks pass. Earlier DOM-panel, keyboard and 200% game-text evidence is superseded; accessibility work must fit the existing game interface.

Kiểm UI ngày 14/09: đạt 43/43 kiểm giao diện trong game và 72/72 kiểm xác nhận/lưu sử qua canvas. Bằng chứng bảng DOM, bàn phím và chữ game 200% cũ hết hiệu lực; công việc tiếp cận phải khớp giao diện game hiện có.
