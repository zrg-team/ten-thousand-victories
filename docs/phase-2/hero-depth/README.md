# Hero depth · Chiều sâu anh hùng

**Status: Proposed, September 13, 2026.** Design addendum; gameplay is not implemented.

**Trạng thái: Đề xuất, ngày 13/09/2026.** Bổ sung thiết kế; chưa triển khai gameplay.

Open [English](index.html?lang=en) or [Tiếng Việt](index.html?lang=vi). The standalone HTML includes six critique/tuning loops, service levels and specializations, interactive XP and evacuation examples, recoverable losses, resident diplomacy, six policy cards, twelve implementation packages and validation gates.

Mở HTML để đọc sáu vòng phản biện/tinh chỉnh, cấp và chuyên môn, ví dụ KN/sơ tán tương tác, tổn thất có phục hồi, ngoại giao thường trú, sáu thẻ chính sách, mười hai gói triển khai và tiêu chí kiểm chứng.

- [design-data.mjs](design-data.mjs) is the bilingual authoring source and proposed numerical model.
- [build.mjs](build.mjs) validates translations, model invariants and local references, then generates [index.html](index.html).
- Rebuild from the repository root: `node docs/phase-2/hero-depth/build.mjs`.
- The document works without a server or external fonts/libraries. The language switch preserves controls and expanded critiques; explicit `?lang=en` / `?lang=vi` overrides the locally remembered preference.
- Source inspection at `8f8c6e75`; no new hero gameplay was implemented or playtested for this addendum. Numbers are hypotheses for the stated validation loop.
- H01–H12 extend [B23 / R10](../implementation-roadmap.html#R10); they are additional scope, not a renumbering of B01–B48 or an automatic addition inside the old effort envelope. All are Proposed.
- [Document validation](document-validation.json): 69/69 checks passed, covering EN/VI layouts at 1440/390/320px, 200% text, interactive examples, language/expansion persistence, deep links, offline loading and idempotent generation. The builder validates 268 translation pairs and 66 local references. This verifies the artifact, not gameplay balance. Disposable screenshots live under the ignored `test_scripts/scratch/hero-depth-qa/` directory.

Start with H01–H04. Travel, warnings and recovery must pass before deadly outcomes can be enabled. Keep the [dated gameplay review](../gameplay-review-2026-09-12/index.html) unchanged as the baseline.

Bắt đầu H01–H04. Hành trình, cảnh báo và phục hồi phải đạt tiêu chí trước khi mở kết quả tử trận. Giữ bản đánh giá có ngày làm mốc, không sửa ngược kết luận gốc.
