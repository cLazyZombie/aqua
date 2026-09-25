# Codex 원본 생성 프롬프트

`art/`의 PNG는 Codex CLI의 내장 `image_gen`으로 한 장씩 생성한 원본이다. 게임에 들어가는 픽셀은 모두 `scripts/build_sprites.py`와 `scripts/build_fx.py`가 이 원본에서 결정적으로 굽는다.

## 생물 공통 스타일

```text
Style: retro 16-bit SNES-era pixel art game sprite, like a creature from a cozy pixel-art aquarium or JRPG game; cute and charming, slightly chibi/stylized proportions, one big expressive eye with a white highlight; chunky LOW-RESOLUTION pixels (the whole creature is only about 48 pixels wide, every pixel drawn as a large crisp square block of identical size), clean 1-pixel dark colored outline around the whole silhouette, flat cel shading with 3 tones per color plus one small bright highlight, saturated readable palette, no anti-aliasing, no soft gradients, no noise, no dithering.
Composition: exactly one creature, centered, filling about 70% of the image width, generous empty margin on every side, the entire body visible and not cropped.
Background: fully transparent background (alpha). No shadow, no glow halo, no ground, no bubbles, no water, no sparkles, no text, no border, no frame.
```

## 생물별 주제

- `clownfish`: an ocellaris clownfish (bright orange body with three thick white bands edged in black, rounded orange fins with black tips). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail fin on the LEFT, body horizontal.
- `blue-tang`: a regal blue tang surgeonfish (royal blue oval body, black palette-shaped marking, bright yellow tail fin). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal.
- `yellow-tang`: a yellow tang (bright lemon yellow disc-shaped body, tall dorsal and anal fins, small pointed snout, white spine near tail). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal.
- `moorish-idol`: a moorish idol (tall disc body with bold black, white and yellow vertical bands, long trailing white dorsal fin streamer, orange saddle on snout). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal.
- `emperor-angelfish`: an emperor angelfish (deep blue body with many thin horizontal yellow stripes, black eye mask band, yellow tail fin). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal.
- `pufferfish`: a round cute pufferfish (chubby round tan-yellow body with brown spots, small fins, tiny spines, pouty mouth). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal.
- `lionfish`: a red lionfish (red and white striped body, big fan-like striped pectoral fins and spiky dorsal spines spreading out). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal.
- `mandarinfish`: a mandarinfish dragonet (psychedelic bright blue body with orange and green wavy swirl patterns, big orange-edged fins). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal.
- `sardine`: a small silvery sardine (slim torpedo body, blue-green back, shiny silver belly, forked tail). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal.
- `seahorse`: a cute yellow-orange seahorse (upright body, curled tail at the bottom, snout pointing to the RIGHT, small dorsal fin, bumpy ridges). Side view, facing RIGHT, standing upright vertically.
- `moon-jelly`: a moon jellyfish (translucent pale blue-white dome bell with four pink-violet horseshoe rings inside, short frilly oral arms and fine short tentacles hanging below). Front view, bell on top, tentacles hanging straight down. Semi-translucent looking but drawn with solid opaque pixels.
- `sea-nettle`: a pacific sea nettle jellyfish (golden orange bell with darker radial stripes on top, long ruffled cream oral arms and long thin maroon tentacles hanging below). Front view, bell on top, tentacles hanging straight down, tall vertical composition.
- `green-turtle`: a cute green sea turtle swimming (olive green patterned shell, lighter scute pattern, big front flippers, friendly face). Side view (slight 3/4 from above), swimming to the RIGHT, head pointing to the RIGHT edge of the image.
- `hammerhead`: a great hammerhead shark (grey-blue back, white belly, distinctive T-shaped hammer head, tall sickle dorsal fin, long tail). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal. Long horizontal composition.
- `dolphin`: a cheerful bottlenose dolphin (smooth grey-blue back, light belly, curved dorsal fin, smiling beak). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal. Long horizontal composition.
- `octopus`: a cute red-orange octopus (big round head mantle with spots, big eyes, eight curly tentacles hanging below and curling outward). Front-side view, head on top, tentacles below.
- `red-crab`: a cute red crab (wide red shell, two big claws raised, small eye stalks, pointy walking legs on both sides). Front view facing the viewer, symmetric.
- `anglerfish`: a deep-sea anglerfish (dark brown-purple round body, huge underbite mouth with sharp white teeth, a long illicium rod growing from the forehead ending in a glowing bright yellow-cyan lure bulb in front of its face). Strict side view profile, head and face pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal. The lure hangs in front of the face on the RIGHT side.
- `firefly-squid`: a firefly squid (small translucent blue-violet squid body dotted with bright glowing cyan-blue photophores, eight short arms). Side view swimming horizontally: its pointed mantle tip points to the RIGHT edge of the image and its arms trail behind to the LEFT.
- `manta-ray`: a giant manta ray seen from directly above (top-down view), gliding horizontally to the RIGHT: head with two curled cephalic fins at the RIGHT edge, both big triangular wings spread symmetrically toward the TOP and the BOTTOM of the image, thin tail trailing straight to the LEFT. Dark navy-black back with white shoulder patches, symmetric shape, body axis perfectly horizontal.

## 배경 (`background.png`)

```text
A pixel art underwater background for a 2D side-view aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole scene were only 320x200 pixels, upscaled with crisp square pixels), limited palette of blues and teals, clean readable shapes, no anti-aliasing.
Content: an EMPTY stage - absolutely no fish, no animals, no creatures, no light rays, no sun beams, no bubbles, no text, no UI.
Layout: the very top has a thin band of rippling bright cyan water surface seen from below; the large middle area is open calm water going from bright turquoise near the top to deep blue near the bottom; distant layered rock pillars and arches silhouetted in blue haze on the far LEFT and far RIGHT sides (lighter and hazier the further away), leaving the center open; the bottom 18% is a pale sandy seabed with gentle dunes, small pebbles and sparse sea grass, slightly darker toward the sides. Keep the lower center sand fairly plain.
```

## 산호 소품 (`reef.png`)

```text
A pixel art foreground reef strip for a 2D side-view aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold dark outlines, cel shading, vivid saturated colors, no anti-aliasing.
Content: a row of separate reef props standing on an invisible flat baseline across the bottom third of the image, spaced apart with gaps between them: a pink branching coral, a purple sea fan, a blue staghorn coral, an orange brain coral, a yellow table coral, a pink sea anemone with wavy tentacles, a big grey-blue rock with moss, a red tube coral cluster, a scallop shell, a small cluster of green sea grass, a teal mushroom coral, a white pillar coral. Each prop about the same height as the others, standing on the bottom edge line.
Background: fully transparent background (alpha) everywhere above and between the props. No water, no fish, no creatures, no text, no sand floor, no shadows.
```

## 다시마·해초 (`kelp.png`)

```text
A pixel art sprite sheet of FOUR separate tall underwater plants for a 2D side-view aquarium game, standing side by side with wide empty gaps between them, each rooted on the bottom edge: 1) a very tall giant kelp stalk with long wavy olive-green leaf blades and small gas bladders, 2) a second tall giant kelp, slightly different, 3) a tall bright green seaweed ribbon cluster, 4) a medium clump of eelgrass blades. Each plant is thin and tall (about 5 times taller than wide) and reaches near the top of the image. 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold dark outline, cel shading with 3 tones, no anti-aliasing. Background: fully transparent background (alpha). No water, no fish, no ground, no text.
```

## 2차 추가 원본

- `species/pufferfish-puffed`: the same cute pufferfish but fully INFLATED into a big round spiky ball (chubby round tan-yellow balloon body with brown spots and many small pointy spines sticking out all around, tiny fins, surprised face with big eye and small round pouty mouth). Strict side view profile, face pointing to the RIGHT edge of the image. (생물 공통 스타일 포함)
- `humpback-whale`: a humpback whale swimming (long dark navy-blue body with lighter knobby head, very long white pectoral flippers, pleated throat grooves, big tail flukes). Strict side view profile, head pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal. Long horizontal composition. (생물 공통 스타일 포함)

### 먼 배경 (`bg-far.png`)

```text
A pixel art FAR BACKGROUND layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), limited palette of blues and teals, no anti-aliasing.
Content: an EMPTY deep-water backdrop - absolutely no fish, no animals, no plants in the foreground, no light rays, no bubbles, no text.
Layout: the very top 8% is a band of rippling bright cyan water surface seen from below with a bright sun glow near the upper left; below it open calm water going from bright turquoise near the top to deep blue at the bottom; very distant, faint, hazy blue silhouettes of rock spires and a sunken arch spread across the whole lower half, very low contrast against the water (they are far away); the bottom 12% is a faint distant sandy seabed. Keep everything soft and low contrast so foreground creatures pop.
```

### 중간 바위 (`bg-mid.png`)

```text
A pixel art MIDGROUND parallax layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, blue-teal rock colors with lighter rim light on the top edges, cel shading, no anti-aliasing.
Content: mid-distance underwater rock formations: tall rugged rock pillars and a natural stone arch on the LEFT side, a big rock cliff with small ledges on the RIGHT side, and a low rocky ridge with a few sponges and sea fans running along the very bottom edge across the whole width. The whole CENTER and TOP of the image must stay EMPTY (open space).
Background: fully transparent background (alpha) everywhere that is not rock. No water color, no fish, no creatures, no light rays, no text.
```

`art/palette/*.png`는 후처리 전 기준 캡처(낮·황혼·밤·새벽·타이틀)로, 팔레트 추출에만 쓴다.

## 4차: 이벤트용 원본

방문자(`art/species/`, 생물 공통 스타일 포함):

- `whale-shark`: a gentle whale shark (huge dark blue-grey body covered with white spots and pale stripes, very wide flat head with a broad mouth, small eye, tall tail fin, pale belly). Strict side view profile, head pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal. Long horizontal composition.
- `sunfish`: a funny ocean sunfish mola (tall flat silver-grey disc body, huge pointy dorsal fin on top and anal fin on the bottom, stubby clipped tail, small round mouth, big dopey eye, looks goofy and cute). Side view facing RIGHT.
- `baby-turtle`: a tiny cute hatchling green sea turtle swimming (small dark green shell with light edges, big head, big eyes, four little flippers spread out). Side view swimming to the RIGHT, head pointing to the RIGHT edge.
- `oarfish`: a legendary giant oarfish (extremely long ribbon-like shiny silver body with faint blue dashes, a bright red crest of long dorsal fin rays running along the whole back and a tall red crest on the head, small face). Strict side view profile, head pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal. Very long thin horizontal composition, the body is about 10 times longer than tall.
- `giant-squid`: a giant squid (big dark red-maroon squid with a long pointed mantle, big eye, eight arms and two very long feeding tentacles trailing behind). Side view swimming horizontally: the pointed mantle tip points to the RIGHT edge of the image and all arms trail to the LEFT. Long horizontal composition.
- `diver`: a scuba diver swimming (black wetsuit with orange stripes, yellow air tank on the back, diving mask, black fins on the feet, holding a flashlight forward in the right hand, bubbles NOT included). Side view swimming horizontally: head and flashlight point to the RIGHT edge of the image, fins trail to the LEFT, body horizontal.
- `submarine`: a small cute yellow research submarine (rounded hull, big round glass porthole window on the front, small propeller at the back, a headlight lamp on the nose, little conning tower on top). Side view facing RIGHT: the nose and window point to the RIGHT edge.

물건(`art/events/`):

```text
Style: retro 16-bit SNES-era pixel art game item sprite, like an object in a cozy pixel-art aquarium or JRPG game; chunky LOW-RESOLUTION pixels (the whole object is only about 48 pixels wide, every pixel drawn as a large crisp square block of identical size), clean 1-pixel dark colored outline, flat cel shading with 3 tones per color plus one small bright highlight, saturated readable palette, no anti-aliasing, no soft gradients.
Composition: exactly one object, centered, filling about 60% of the image, generous empty margin on every side, fully visible.
Background: fully transparent background (alpha). No shadow, no ground, no water, no bubbles, no sparkles, no text, no border.
```

- `anchor`: a rusty old iron ship anchor standing upright with a short piece of chain attached to its top ring.
- `chest-closed`: a closed wooden pirate treasure chest with iron bands and a golden lock, slightly mossy.
- `chest-open`: an OPEN wooden pirate treasure chest with iron bands, the lid tilted open, overflowing with shiny gold coins, a red ruby and a blue sapphire, glowing golden.
- `bottle`: a green glass message bottle with a cork, a rolled parchment letter visible inside, lying diagonally.
- `hook`: a single silver fishing hook hanging from a short thin line at the top, with a wriggly pink worm bait on the hook. Vertical composition.

## 7차: 초기 목록 206종

종마다의 주제 문장은 `scripts/species_table.py`의 `prompt()`가 만든다(영문명 + 생김새 힌트 + 구도). 옆모습·위에서 본 구도는 위의 생물 공통 스타일을, 정면·해파리·바닥 구도는 공통 스타일에서 "one big expressive eye" 구절을 빼고 다음을 덧붙였다.

- 해파리: `The jellyfish has NO eyes and NO face at all.`
- 바닥 생물(조개·불가사리·관벌레 등): `It has NO eyes and NO face (it is not a cartoon character).`
- 정면(문어·게): `It has TWO small cute eyes side by side (never a single central eye).`

간식 바구니(`art/events/basket.png`): `a small cute wicker basket full of round golden fish-food cookies and star-shaped treats, hanging from a short rope at the top. Vertical composition.` (물건 공통 스타일 포함)

먼 층 배경 두 장(`bg-deep.png` 먼 해저 산맥, `bg-kelp.png` 먼 다시마 숲)도 같은 방식으로 투명 배경 실루엣으로 그렸다.

## 11차: 배경 컨셉·산호·해초·조개

배경 컨셉마다 원본 6장을 `art/scenes/<컨셉>/`에 둔다: `far`(먼 배경, 불투명), `deep`(먼 산맥 실루엣), `back`(먼 숲·기둥), `mid`(중간 바위, 가운데 비움), `floor`(아래 30%만 땅인 바닥 띠), `props`(컨셉 소품 8개). 산호초(`reef`)는 처음 그린 `bg-*.png`를 쓴다. 새 산호·해초·조개는 `art/props/`에 있다. 조개는 한 장에 닫힘·반쯤 열림·활짝 열림 세 단계를 그려 3프레임 시트로 굽는다.

### `props/reef2.png`

```text
A pixel art foreground reef strip for a 2D side-view aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold dark outlines, cel shading with 3 tones per color plus one small highlight, vivid saturated colors, no anti-aliasing, no soft gradients.
Content: a row of EIGHT separate NEW reef props standing on an invisible flat baseline across the bottom third of the image, spaced apart with wide empty gaps between them: a green brain coral dome, a bundle of thin red sea whips, a cluster of yellow tube sponges, an orange cup coral cluster, a purple lettuce coral with ruffled plates, a blue finger coral, a pink fluffy soft tree coral, a white-and-cream elkhorn coral. Each prop about the same height, standing on the bottom edge line, none touching another.
Background: fully transparent background (alpha) everywhere above and between the props. No water, no fish, no creatures, no text, no sand floor, no shadows.
```

### `props/weed2.png`

```text
A pixel art sprite sheet of FOUR separate underwater plants for a 2D side-view aquarium game, standing side by side with wide empty gaps between them, each rooted on the bottom edge: 1) a tall clump of deep red branching seaweed fronds, 2) a medium clump of bright green ruffled sea lettuce sheets, 3) a tall bushy golden-brown sargassum weed with many tiny round berry-like air bladders, 4) a low wide clump of feathery green caulerpa sea grapes. The first and third plants reach about two thirds of the image height, the others about half. 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold dark outlines, cel shading with 3 tones per color plus one small highlight, vivid saturated colors, no anti-aliasing, no soft gradients.
Background: fully transparent background (alpha). No water, no fish, no ground, no text.
```

### `props/clam-hard.png`

```text
A pixel art sprite sheet for a 2D aquarium game showing THREE copies of the SAME bivalve shellfish lying flat on the ground, side by side from left to right with wide empty gaps between them: 1) shell fully CLOSED, 2) shell SLIGHTLY OPEN, 3) shell WIDE OPEN. Camera looks at the shellfish from the FRONT and a little above: the hinge is at the BACK, so when it opens the top shell lifts up toward the back and the opening faces the viewer, letting us look straight into the inside of the shell. The bottom shell stays on the ground in the same place in all three. It has NO eyes and NO face (it is not a cartoon character). 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold dark outlines, cel shading with 3 tones per color plus one small highlight, vivid saturated colors, no anti-aliasing, no soft gradients. Background: fully transparent background (alpha). No water, no sand, no bubbles, no shadow, no text. The shellfish: a plump hard clam with a smooth cream and tan shell with brown growth rings; the inside is pale pink-cream soft flesh with a pearly white rim.
```

### `props/clam-venus.png`

```text
A pixel art sprite sheet for a 2D aquarium game showing THREE copies of the SAME bivalve shellfish lying flat on the ground, side by side from left to right with wide empty gaps between them: 1) shell fully CLOSED, 2) shell SLIGHTLY OPEN, 3) shell WIDE OPEN. Camera looks at the shellfish from the FRONT and a little above: the hinge is at the BACK, so when it opens the top shell lifts up toward the back and the opening faces the viewer, letting us look straight into the inside of the shell. The bottom shell stays on the ground in the same place in all three. It has NO eyes and NO face (it is not a cartoon character). 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold dark outlines, cel shading with 3 tones per color plus one small highlight, vivid saturated colors, no anti-aliasing, no soft gradients. Background: fully transparent background (alpha). No water, no sand, no bubbles, no shadow, no text. The shellfish: a venus clam with a glossy white shell covered in brown zigzag patterns; the inside is soft orange-pink flesh with a glossy nacre rim.
```

### `props/clam-oyster.png`

```text
A pixel art sprite sheet for a 2D aquarium game showing THREE copies of the SAME bivalve shellfish lying flat on the ground, side by side from left to right with wide empty gaps between them: 1) shell fully CLOSED, 2) shell SLIGHTLY OPEN, 3) shell WIDE OPEN. Camera looks at the shellfish from the FRONT and a little above: the hinge is at the BACK, so when it opens the top shell lifts up toward the back and the opening faces the viewer, letting us look straight into the inside of the shell. The bottom shell stays on the ground in the same place in all three. It has NO eyes and NO face (it is not a cartoon character). 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold dark outlines, cel shading with 3 tones per color plus one small highlight, vivid saturated colors, no anti-aliasing, no soft gradients. Background: fully transparent background (alpha). No water, no sand, no bubbles, no shadow, no text. The shellfish: a rough grey-green oyster with a craggy layered shell; the inside is pearly iridescent silver-white with a soft cream oyster.
```

### `props/clam-scallop.png`

```text
A pixel art sprite sheet for a 2D aquarium game showing THREE copies of the SAME bivalve shellfish lying flat on the ground, side by side from left to right with wide empty gaps between them: 1) shell fully CLOSED, 2) shell SLIGHTLY OPEN, 3) shell WIDE OPEN. Camera looks at the shellfish from the FRONT and a little above: the hinge is at the BACK, so when it opens the top shell lifts up toward the back and the opening faces the viewer, letting us look straight into the inside of the shell. The bottom shell stays on the ground in the same place in all three. It has NO eyes and NO face (it is not a cartoon character). 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold dark outlines, cel shading with 3 tones per color plus one small highlight, vivid saturated colors, no anti-aliasing, no soft gradients. Background: fully transparent background (alpha). No water, no sand, no bubbles, no shadow, no text. The shellfish: a round orange and red scallop with a ribbed fan-shaped shell and two small ear wings at the hinge; the inside is soft cream flesh with a bright orange roe and a thin frilly mantle edge.
```

### `props/clam-pearl.png`

```text
A pixel art sprite sheet for a 2D aquarium game showing THREE copies of the SAME bivalve shellfish lying flat on the ground, side by side from left to right with wide empty gaps between them: 1) shell fully CLOSED, 2) shell SLIGHTLY OPEN, 3) shell WIDE OPEN. Camera looks at the shellfish from the FRONT and a little above: the hinge is at the BACK, so when it opens the top shell lifts up toward the back and the opening faces the viewer, letting us look straight into the inside of the shell. The bottom shell stays on the ground in the same place in all three. It has NO eyes and NO face (it is not a cartoon character). 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold dark outlines, cel shading with 3 tones per color plus one small highlight, vivid saturated colors, no anti-aliasing, no soft gradients. Background: fully transparent background (alpha). No water, no sand, no bubbles, no shadow, no text. The shellfish: a black-lipped pearl oyster with a flat dark shell; the inside is shiny rainbow mother-of-pearl, and when open a big round glossy white pearl sits in the middle.
```

### `scenes/kelp/far.png`

```text
A pixel art FAR BACKGROUND layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Content: an EMPTY deep-water backdrop - absolutely no fish, no animals, no creatures, no light rays, no bubbles, no text. Keep everything soft and low contrast so foreground creatures pop. Layout: the very top 8% is a band of rippling bright water surface seen from below with a warm golden-green sun glow near the upper left; below it open calm water going from bright jade-teal near the top to deep green-blue at the bottom; very distant, faint, hazy silhouettes of tall giant kelp stalks rising all the way to the surface spread across the whole width; the bottom 12% is a faint distant rocky seabed.
```

### `scenes/kelp/deep.png`

```text
A pixel art DISTANT SILHOUETTE layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Only the LOWER HALF of the image has shapes; the upper half is empty. Very low contrast flat muted colors. Content: a distant rocky reef ridge with rounded boulders and a few tiny kelp stalks, muted grey-green. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/kelp/back.png`

```text
A pixel art DISTANT parallax layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Shapes rise from the bottom edge; flat muted colors, low contrast. Content: a dense distant forest of tall giant kelp stalks with wavy leaf blades rising from the bottom edge up to near the top edge, evenly spread across the whole width with gaps between stalks, muted olive and teal. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/kelp/mid.png`

```text
A pixel art MIDGROUND parallax layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. The whole CENTER and TOP-CENTER of the image must stay EMPTY (open space). Content: huge golden-brown giant kelp stalks with long wavy leaf blades and small round gas bladders rising from big dark rocky boulders on the LEFT side and on the RIGHT side, reaching the top edge; a low rocky reef with purple sea urchins and pink coralline algae running along the very bottom edge across the whole width. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/kelp/floor.png`

```text
A pixel art SEABED ground strip for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. The ground fills only the BOTTOM 30% of the image across the FULL WIDTH with a flat top edge; seen from the side, close to the camera. Content: a dark grey-brown rocky reef floor with smooth pebbles, a few small purple sea urchins, pink coralline algae patches and small green surfgrass tufts. Above the ground the image is fully transparent (alpha). No water, no fish, no text.
```

### `scenes/kelp/props.png`

```text
A pixel art foreground prop strip for a 2D side-view aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. vivid saturated colors. Content: a row of EIGHT separate props standing on an invisible flat baseline across the bottom third of the image, spaced apart with wide empty gaps between them, none touching another. The props: a mossy boulder with three purple sea urchins, a pink coralline algae rock, an orange cup sponge, a clump of bright green surfgrass, a small feather boa kelp, a red gorgonian sea fan, a rock with a bright orange bat star, a yellow encrusting sponge mound. Background: fully transparent background (alpha) everywhere above and between the props. No water, no fish, no creatures, no text, no sand floor, no shadows.
```

### `scenes/wreck/far.png`

```text
A pixel art FAR BACKGROUND layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Content: an EMPTY deep-water backdrop - absolutely no fish, no animals, no creatures, no light rays, no bubbles, no text. Keep everything soft and low contrast so foreground creatures pop. Layout: the very top 8% is a band of rippling bright water surface seen from below with a pale sun glow near the upper left; below it open water going from turquoise near the top to deep navy blue at the bottom (a little deeper and darker than a coral reef); very distant, faint, hazy silhouettes of a far sunken ship hull with a broken mast and a few rock outcrops across the lower half; the bottom 12% is a faint distant sandy seabed.
```

### `scenes/wreck/deep.png`

```text
A pixel art DISTANT SILHOUETTE layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Only the LOWER HALF of the image has shapes; the upper half is empty. Very low contrast flat muted colors. Content: distant low sand dunes, scattered rocks and the faint broken hull of a far away shipwreck, muted blue-grey. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/wreck/back.png`

```text
A pixel art DISTANT parallax layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Shapes rise from the bottom edge; flat muted colors, low contrast. Content: distant scattered shipwreck debris rising from the bottom edge: two broken masts sticking up at angles, a tilted hull section with ribs showing, hanging ropes, tall seaweed between them, muted dark teal. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/wreck/mid.png`

```text
A pixel art MIDGROUND parallax layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. The whole CENTER and TOP-CENTER of the image must stay EMPTY (open space). Content: on the LEFT side the big broken wooden hull of a sunken old sailing ship lying tilted, with round portholes, dark planks, a torn opening, and pink corals and purple sea fans growing on it; on the RIGHT side a broken wooden mast with a torn sail and rigging ropes leaning diagonally from the bottom edge up toward the right edge; a low sandy ridge with rocks along the very bottom edge across the whole width. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/wreck/floor.png`

```text
A pixel art SEABED ground strip for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. The ground fills only the BOTTOM 30% of the image across the FULL WIDTH with a flat top edge; seen from the side, close to the camera. Content: a pale sandy seabed with scattered broken wooden planks, a coil of old rope, small shells, pebbles and a few tufts of seagrass. Above the ground the image is fully transparent (alpha). No water, no fish, no text.
```

### `scenes/wreck/props.png`

```text
A pixel art foreground prop strip for a 2D side-view aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. vivid saturated colors. Content: a row of EIGHT separate props standing on an invisible flat baseline across the bottom third of the image, spaced apart with wide empty gaps between them, none touching another. The props: a wooden barrel lying on its side, a rusty old iron cannon, a broken wooden crate, a coil of rusty anchor chain, a ship steering wheel half buried standing upright, a tall clay amphora jug, an old brass ship lantern, a pile of mossy broken planks. Background: fully transparent background (alpha) everywhere above and between the props. No water, no fish, no creatures, no text, no sand floor, no shadows.
```

### `scenes/ruins/far.png`

```text
A pixel art FAR BACKGROUND layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Content: an EMPTY deep-water backdrop - absolutely no fish, no animals, no creatures, no light rays, no bubbles, no text. Keep everything soft and low contrast so foreground creatures pop. Layout: the very top 8% is a band of rippling bright water surface seen from below with a soft sun glow near the upper left; below it open water going from bright emerald-turquoise near the top to deep teal at the bottom; very distant, faint, hazy silhouettes of an ancient sunken city with temple columns, domes and a stepped pyramid across the lower half; the bottom 12% is a faint distant sandy seabed.
```

### `scenes/ruins/deep.png`

```text
A pixel art DISTANT SILHOUETTE layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Only the LOWER HALF of the image has shapes; the upper half is empty. Very low contrast flat muted colors. Content: distant silhouettes of a ruined ancient city: broken columns, collapsed arches and domes, muted grey-teal. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/ruins/back.png`

```text
A pixel art DISTANT parallax layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Shapes rise from the bottom edge; flat muted colors, low contrast. Content: a distant row of tall ancient carved stone columns and archways, some broken and collapsed, rising from the bottom edge across the whole width, with gaps, muted teal-grey. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/ruins/mid.png`

```text
A pixel art MIDGROUND parallax layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. The whole CENTER and TOP-CENTER of the image must stay EMPTY (open space). Content: ancient sunken stone ruins: on the LEFT side tall broken pale marble columns and a crumbling carved stone arch overgrown with coral and seaweed; on the RIGHT side a huge ancient stone statue head (calm closed eyes, weathered, overgrown with coral and moss) resting on a broken stone staircase; low stone rubble along the very bottom edge across the whole width. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/ruins/floor.png`

```text
A pixel art SEABED ground strip for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. The ground fills only the BOTTOM 30% of the image across the FULL WIDTH with a flat top edge; seen from the side, close to the camera. Content: a sandy seabed with scattered carved stone floor tiles, small stone rubble, broken pottery pieces and small shells. Above the ground the image is fully transparent (alpha). No water, no fish, no text.
```

### `scenes/ruins/props.png`

```text
A pixel art foreground prop strip for a 2D side-view aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. vivid saturated colors. Content: a row of EIGHT separate props standing on an invisible flat baseline across the bottom third of the image, spaced apart with wide empty gaps between them, none touching another. The props: a broken carved column stump, a fallen column segment lying on its side, a small weathered stone lion statue, a stone tablet with carved runes, a tipped over clay amphora, a stone urn with seaweed, a mossy stone block with glyphs, a small broken stone arch fragment. Background: fully transparent background (alpha) everywhere above and between the props. No water, no fish, no creatures, no text, no sand floor, no shadows.
```

### `scenes/ice/far.png`

```text
A pixel art FAR BACKGROUND layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Content: an EMPTY deep-water backdrop - absolutely no fish, no animals, no creatures, no light rays, no bubbles, no text. Keep everything soft and low contrast so foreground creatures pop. Layout: the very top 12% is a band of white and pale blue floating sea ice seen from below, with bright cracks and gaps letting light through; below it cold clear water going from pale icy cyan near the top to deep steel blue at the bottom; very distant, faint, hazy silhouettes of the underwater bottoms of icebergs hanging down from the top and rounded rocky hills across the lower half; the bottom 12% is a faint distant grey gravel seabed.
```

### `scenes/ice/deep.png`

```text
A pixel art DISTANT SILHOUETTE layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Only the LOWER HALF of the image has shapes; the upper half is empty. Very low contrast flat muted colors. Content: distant rounded rocky hills with patches of white ice on top, muted blue-grey. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/ice/back.png`

```text
A pixel art DISTANT parallax layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (as if the whole image were only 320x200 pixels upscaled with crisp square pixels), clean readable shapes, no anti-aliasing, no dithering. Shapes rise from the bottom edge; flat muted colors, low contrast. Content: a distant field of tall rocky pinnacles and white soft coral trees rising from the bottom edge across the whole width, with gaps, muted pale blue-grey. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/ice/mid.png`

```text
A pixel art MIDGROUND parallax layer for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. The whole CENTER and TOP-CENTER of the image must stay EMPTY (open space). Content: on the LEFT side a huge pale blue-white iceberg underside with smooth faceted ice hanging down from the top edge to mid height, and dark rocks below it; on the RIGHT side a dark rocky cliff with white ice and snow on its ledges; a low rocky ridge with white soft corals and orange sea stars along the very bottom edge across the whole width. Background: fully transparent background (alpha) everywhere that is not part of the drawn shapes. No water color, no fish, no creatures, no light rays, no bubbles, no text.
```

### `scenes/ice/floor.png`

```text
A pixel art SEABED ground strip for a 2D side-view underwater aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. The ground fills only the BOTTOM 30% of the image across the FULL WIDTH with a flat top edge; seen from the side, close to the camera. Content: a grey pebble and gravel seabed with a few small orange sea stars, white sea anemones and pale rocks. Above the ground the image is fully transparent (alpha). No water, no fish, no text.
```

### `scenes/ice/props.png`

```text
A pixel art foreground prop strip for a 2D side-view aquarium game, 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold readable shapes, cel shading, lighter rim light on top edges, no anti-aliasing, no dithering. vivid saturated colors. Content: a row of EIGHT separate props standing on an invisible flat baseline across the bottom third of the image, spaced apart with wide empty gaps between them, none touching another. The props: a white strawberry soft coral tree, a tall pink sea anemone, a big grey boulder with two orange sea stars, a chunk of blue-white ice resting on the ground, a tall orange sea pen, a yellow barrel sponge, a red feather star on a rock, a clump of red kelp. Background: fully transparent background (alpha) everywhere above and between the props. No water, no fish, no creatures, no text, no sand floor, no shadows.
```


## 12차: 사건 2부·해녀·인어공주

방문자(`art/species/`, 생물 공통 스타일 포함):

- `adelie-penguin`: an Adélie penguin swimming fast underwater (sleek black back and head, clean white belly, white ring around the eye, short black beak, two flippers swept back, small pink feet trailing behind, streamlined torpedo body). Strict side view profile, head pointing to the RIGHT edge of the image, tail and feet on the LEFT, body horizontal.
- `haenyeo`: a cheerful Korean haenyeo (traditional female free diver) swimming underwater: black rubber diving suit covering the body, round old-fashioned diving goggles on her face, a black hood cap, a mesh net bag (mangsari) hanging at her hip, bare hands, legs stretched behind with small black fins. Friendly and cute chibi proportions. Strict side view profile, head pointing to the RIGHT edge of the image, legs on the LEFT, body horizontal.
- `mermaid`: an original friendly mermaid girl swimming (long lavender hair in a loose braid with a small pearl hairpin, a simple teal top made of fish scales, a coral-pink fish tail with golden fins, a gentle smile). Original character design for a cozy aquarium game. Strict side view profile, head pointing to the RIGHT edge of the image, tail on the LEFT, body horizontal.

인어공주는 처음에 붉은 머리와 보라 조개 상의로 요청했더니 기존 작품 캐릭터와 닮았다는 이유로 생성이 막혔다. 라벤더 땋은 머리·진주 핀·청록 비늘 상의·산호빛 꼬리의 독창적인 디자인으로 바꿔 만들었다.

물건(`art/events/`, 물건 공통 스타일 포함):

- `shell`: an EMPTY spiral sea snail shell (cream with orange-brown stripes and a pearly pink opening) lying on its side on the ground, the round opening facing the viewer and a little to the right, nothing inside the shell, no creature, no eyes.
- `duck`: a classic yellow rubber duck bath toy with an orange beak and a small black dot eye, floating upright, strict side view facing RIGHT.

해녀의 테왁(주황 부표)과 줄, 흰동가리 알, 문어의 조개껍데기, 오로라·불꽃·햇살 커튼 같은 빛은 그림 없이 코드로 그린다(`src/render/setpieces.ts`).

## 13차: 헤엄 자세로 다시 그리기

바다사자 무리가 앉거나 누운 뭍 자세여서 헤엄 자세로 다시 그렸다(생물 공통 스타일 포함). 공통 뒷말: `It is NOT sitting, NOT standing, NOT lying down and NOT resting: there is no ground, no rock and no shore, it is swimming in open water. Strict side view profile, head and face pointing to the RIGHT edge of the image, hind flippers and tail on the LEFT, body horizontal and stretched out.`

- `california-sea-lion`: a cute California sea lion SWIMMING underwater (sleek brown streamlined torpedo-shaped body, small head with tiny ear flaps and whiskers stretched forward, long front flippers held out and swept back like wings, hind flippers pressed together trailing straight behind).
- `steller-sea-lion`: a cute Steller sea lion SWIMMING underwater (large tan-golden streamlined body with a thick neck and a little mane, head stretched forward, broad front flippers held out and swept back, hind flippers pressed together trailing straight behind).
- `walrus`: a cute walrus SWIMMING underwater (big plump brown wrinkly body stretched out horizontally, long white tusks pointing down and forward, bushy whiskers, front flippers paddling at its sides, hind flippers pressed together trailing straight behind).
- `harbor-seal`: a cute harbor seal SWIMMING underwater (plump spotted grey streamlined body stretched out horizontally, round head with big dark eyes and whiskers, small front flippers tucked against the belly, hind flippers pressed together trailing behind like a fish tail).
- `marine-iguana`: a cute marine iguana SWIMMING underwater (black-grey lizard with a row of small spikes along its back, body stretched out horizontally, all four legs folded back flat against its sides, long flattened tail waving behind to push it forward). It is NOT walking: its legs do not touch any ground.

날치는 원래 그림(날개처럼 편 가슴지느러미)을 점프 자세(`flying-fish-pose.png`)로 옮기고, 물속 기본 그림은 원래 그림을 `codex exec -i <원본> -- "<프롬프트>"`로 고쳐 만들었다:

```text
Use the built-in image_gen tool exactly once to EDIT the attached image. Keep the exact same flying fish: the same retro 16-bit SNES-era pixel art style with chunky square pixels of identical size, the same blue and silver colors, the same clean dark outline, the same head, big eye, body, forked tail, size and framing, and a fully transparent background. Only change its two huge wing-like pectoral fins: the fish is now SWIMMING UNDERWATER, so both wing fins are FOLDED back tightly along the sides of its body, lying flat against the body and pointing toward the tail, with only a slim streamlined edge of the folded fin visible along the middle of the body. No fin sticks up above the back or down below the belly except the small normal dorsal and pelvic fins. Strict side view profile, head pointing to the RIGHT edge, tail on the LEFT, body horizontal.
```

## 15차: 바다 쓰레기

`art/events/trash.png`(가로 1536×1024, 두 줄 네 칸). `scripts/build_fx.py`의 `trash()`가 연결 요소로 나눠 위 줄 왼쪽부터 캔·페트병·비닐봉지·장화·타이어·유리병·마스크·폐그물 순으로 굽는다.

```text
A pixel art sprite sheet for a 2D side-view aquarium game showing EIGHT separate pieces of ocean trash, side by side in two rows of four with wide empty gaps between them (none touching another), each lying on an invisible flat baseline: 1) a dented red soda can lying on its side, 2) a clear plastic PET water bottle with a blue cap lying on its side, 3) a crumpled white plastic shopping bag, 4) an old worn brown rubber boot lying on its side, 5) a small black rubber tire standing upright seen from the side, 6) a green glass bottle lying on its side, 7) a disposable light blue face mask with white ear loops, 8) a tangled clump of orange fishing net with a small white float. Each item is about the same size. They are objects with NO eyes and NO faces. 16-bit SNES era style, chunky LOW-RESOLUTION pixels (every pixel a crisp large square block), bold dark outlines, cel shading with 3 tones per color plus one small highlight, vivid saturated colors, no anti-aliasing, no soft gradients, no dithering.
Background: fully transparent background (alpha) everywhere. No water, no fish, no creatures, no sand, no ground, no text, no shadows, no labels.
```

낚싯줄·찌·미끼·게이지와 낚시 버튼 아이콘은 그림 없이 코드로 그린다(`src/render/fishing.ts`, `src/main.ts`).
