# Main-menu title, revision 2

The user rejected the first red, outlined slab-serif wordmark as too modern. The replacement uses an illustrated, handwritten Quốc ngữ name with broad dark strokes, open lowercase forms and restrained dry edges. It is a contemporary folk-inspired adaptation, not a reproduction of historical Đông Hồ lettering.

The [UNESCO craft description](https://ich.unesco.org/en/USL/craft-of-making-ong-h-folk-woodblock-printings-01737?USL=01737) describes hand-drawn designs, carved blocks, natural pigments and a final black outline pass. These informed the material direction; they do not establish a particular historical Latin typeface.

## Asset and integration

- Runtime asset: `public/art/menu-wordmark-dongho-v2.png`.
- Selected built-in ImageGen output: `exec-cb24eefa-093e-47aa-8715-f3bce17ada03.png`.
- Original selected master retained under `output/dongho-wordmark-v2/master.png`.
- Landscape reference: `public/art/menu-layer-ground-v6.png`.
- Built-in ImageGen was used, not CLI/API generation. First draft remained too typeset and was rejected.
- The second output contained a baked checkerboard despite the transparency request. A built-in edit replaced it with pure white. The runtime uses multiply blending to print the dark strokes onto the existing paper. No checkerboard or white panel appears in the game.
- Asset preparation only trims the white margin, adds 12px safety padding, and resamples for a small runtime image. No letterforms were redrawn by this step.
- Exact display name is “Vạn Thắng”; semantic heading metadata remains “VẠN THẮNG”.
- Earlier game icon remains absent.

## Generation prompts

### Initial draft (rejected)

Use case: logo-brand.
Create a NEW illustrated lettering asset for the Vietnamese historical game, replacing a rejected modern varsity/slab-serif logo.
Input image: reference for the existing game's Đông Hồ-inspired natural black ink, coarse printed contours and quiet handmade spirit ONLY. Do not reproduce the landscape.
Exact text on ONE horizontal line: "Vạn Thắng". Vietnamese Quốc ngữ, capital V and T, lowercase other letters. The first a has a dot below (ạ); the second a has a breve AND acute above (ắ). Spell exactly, preserve both words.
Art direction: a modest inscription belonging inside a Vietnamese Đông Hồ folk woodblock print. Draw the letters originally by hand: slow, upright, broad bamboo-brush ink strokes subsequently carved and printed from wood; gently bowed stems, asymmetrical rounded bowls, softly pinched terminals, slight natural differences in weight and baseline. Solid soot-black ink with a warm brown undertone. Organic rhythm, quiet authority, village folk craft. Small authentic dry-print gaps and fibrous broken edges, yet strong solid silhouettes readable at a displayed width of 270 pixels. Balanced 2-word composition with an obvious word space. Capitals fuller but not towering, lower case open and readable. This is a respectful contemporary Latin adaptation, not Han or Nôm characters.
Transparent alpha background, no paper rectangle. Wide 3:1 canvas, text centered with clear margin for all accents and descenders. The two words together should occupy most of the width; do not crop any ink.
Avoid: western slab serifs, varsity letters, cowboy letters, typographic outlines, coloured letter interiors, gold edging, shadows, bevels, vector polygons, sports logos, modern branding, brush-script wedding calligraphy, italics, big swooshes, flourishes, generic East Asian pseudo-characters, red seals, emblems, icons, ornaments, animals, scenery, additional text or subtitle. Only the hand-printed black name, with actual transparency.

### Letterform correction (selected forms)

Create a replacement wordmark illustration, not a font sample. The supplied title is a REJECTED draft: it still looks typeset with large Western serifs. Replace its letterforms completely.
Only the exact Vietnamese words "Vạn Thắng", on one horizontal line. Keep every accent correct: dot below ạ, breve plus acute above ắ.
Desired artwork: old Vietnamese hand-brushed Quốc ngữ inscription adapted to a Đông Hồ folk print. Broad expressive ink calligraphy with strong variation of stroke width, organically bent stems, asymmetric handwritten shapes, lively irregular height, and short tapering brush ends. Draw each letter as a few individual loaded bamboo-brush gestures, carved into a woodblock and printed in warm soot-black. More handwritten than typographic. Upright to very slightly inclined, graceful but sturdy, letters separately legible. Use an open single-storey handwritten a and a handwritten g. Capital V and T must be fluid gestural strokes WITHOUT horizontal serif feet. Folk manuscript character, not a book typeface. Crisp solid dark ink masses with a few subtle dry edges, never a stone or gritty surface texture.
Transparent alpha background. Wide 3:1 canvas with only the lettering and generous padding around all accents. Balanced word spacing. Show the full name without cropping.
ABSOLUTELY NO typeset serifs, slab serifs, Times New Roman, Cooper, varsity letters, geometric capitals, outlined text, colored fill, logos, icons, seals, frame, ribbon, extra symbols, background paper, additional text, oversized swashes, wedding script or glossy texture. The earlier generated shapes are a negative example, do not preserve them.

### Background correction (selected master)

Edit ONLY the background of this Vietnamese title illustration. Preserve the precise handwritten "Vạn Thắng" letter shapes, all diacritics, black ink texture, placement and proportions exactly. Replace the entire grey-and-white checkerboard with solid uniform pure white (#FFFFFF), including inside every letter counter and around the dot and accents. No checkerboard, no paper grain, no grey rectangle, no shadow or gradient. Keep the ink dark. Output a wide PNG with the entire name and margins intact. Do not redraw, retype, restyle, or add anything to the lettering.

