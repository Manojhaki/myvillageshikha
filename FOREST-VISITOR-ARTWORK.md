# Red panda forest visitor

Assets: `docs/assets/cardboard-red-panda.png` and `docs/assets/cardboard-red-panda-body.png` (1536 × 1024 PNGs with alpha transparency).

Created with the built-in ImageGen tool for My Village Shikha. The red panda is a decorative forest visitor that crosses a layered cardboard path as the reader scrolls. It is not an addition to the story's named cast.

## Final generation prompt

Use case: stylized-concept. Asset type: a transparent website animation sprite for My Village Shikha, a tactile cardboard storybook forest. Create one adorable baby red panda forest animal, full body including bushy ringed tail, in a clear walking pose toward the RIGHT. Three-quarter side profile, head slightly turned toward viewer, happy curious expression, large dark glossy toy eyes with little highlights, cream cheeks and eyebrows, tiny dark nose, rounded cream-lined ears, terracotta/rust body, dark warm-brown paws, generous fluffy ringed tail curling upward behind it on the LEFT. The animal must be a handmade flat layered corrugated cardboard puppet photographed in a studio: exposed thick corrugated cut edges around every shape, rough torn kraft fibers, visible matte painted paper grain, separate stacked cut-paper layers for muzzle, ears, paws and tail bands, slightly uneven hand-cut contours. Soft warm upper-left light with small shadows BETWEEN cardboard layers. Cute rounded proportions, big head and short legs. Full animal centered and contained with 6 percent transparent margin, landscape canvas, facing right, four paws clearly readable. Real alpha transparency surrounding the animal and between legs. No scenery, no bush, no ground platform, no background glow, no shadow outside the silhouette, no text, no watermarks, no additional animals. This asset will move horizontally across a layered cardboard woodland scene; its silhouette must read at 160-240px wide.

## Walking rig

Four leg layers are clipped from the original artwork in the page's SVG. Their cardboard hip and shoulder joints rotate in diagonal pairs, with the phase determined by horizontal distance traveled. The legs stop when scrolling stops and retrace their poses when scrolling reverses. Reduced motion leaves a still pose.

The built-in ImageGen edit created a separate body layer so the moving legs do not leave stationary paws behind.

### Body layer edit prompt

Precise object edit for animation rig. The input is the existing red panda character for My Village Shikha. Create ONLY the STATIC BODY LAYER for this exact cardboard puppet. Remove all FOUR LEGS AND ALL PAWS completely, including the orange shoulder/haunch leg panels and dark lower legs, leaving a clean continuous rounded torso/belly underneath the head and tail. Fill areas of torso revealed behind the removed limbs with the exact matching rust-orange/brown painted corrugated cardboard. This legless torso will be placed ABOVE separate animated leg cutouts from the original image. Critical registration: preserve the original 1536x1024 canvas, exact pixel placement, scale and rotation of the head, face, eyes, ears, tail and torso. Do NOT recenter, resize, crop or change the character identity/expression. Keep the full ringed tail, round torso, complete head and cream muzzle exactly where they already are. Remove all legs/feet beneath and in front of the torso, with a soft round belly edge around original y700-755. Do not produce a sprite sheet, extra parts, detached legs, new character, text or scenery. True transparent alpha background including every erased leg area. Preserve the original layered rough corrugated cardboard texture and warm light. No ground shadow or background glow. Output just one legless body in its original frame, ready to composite with the original legs.
