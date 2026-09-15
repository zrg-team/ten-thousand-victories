# Connected Đông Hồ ground

The terrain should read as one printed landscape. The first meadow atlas produced isolated grass islands; a denser repeat texture also moved away from the game's established Đông Hồ drawing style. Both drafts are excluded from runtime. The user subsequently selected grass v1 as the default surface; these connected pigment blocks remain above it. The pigment-only variant is available with `?groundart=paper`. See [dongho-grass-comparison.md](dongho-grass-comparison.md).

## Drawing rules

- Keep the existing điệp paper and project pigment palette. Open land is a quiet, continuous paper-colored plane.
- Join neighboring cultivated fields, woodland and hills into broad flat color blocks across province boundaries. Use ochre for fields, pale green for woodland and warm earth for hills.
- Let plains between two field cells connect their cultivated ground. This is visual grouping only; gameplay terrain and ownership are unchanged.
- Keep isolated small cells on the common ground. Their rice, tree and mountain artwork already identifies them.
- Use sparse broken contour marks along lower banks, beneath existing roads, buildings and relief. Grass detail remains the existing printed flora, without a separate carpet texture.
- Keep enclosed ponds and other holes open in the color geometry. Preserve the existing seasonal palettes, ink, roads, fog and ownership lines.

## Implementation

`src/ui/ink/printedGround.ts` draws into the existing cached terrain Graphics. Contiguous groups use merged boundaries and triangulated holes. The ground has no additional texture files, live objects, or per-frame masking. The diagnostic query `naturalground=0` bypasses the new connected pigment layer.

The abandoned meadow images and packing scripts are retained locally under `output/connected-ground/`. The earlier `natural-ground-v1.json` records the first generated draft, not the active rendering.

## Review

Visual evidence and the browser report are under `output/connected-ground/`: desktop, phone, all four seasons, a revealed farmland area, and the installed web-game client's gameplay screenshot/state. The separate farmland fixture assigns ownership in an isolated test state to show the art without foreign haze. Geometry checks cover an enclosed pond and fully opaque internal cell joins; RGB permits one 8-bit level of canvas rounding.
