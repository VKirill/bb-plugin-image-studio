STATUS: complete

# Separately drawn side view is cut with an oversized box (w 1052 on a 1068 canvas): crop the single-view sheet to its object

In 0.8.12 the separately drawn view (side-sheet.png, '/Users/vechkasov/Documents/Мои проекты/Roblox/lava-arena/.bb/chats/thr_vgdyg342s5/artifacts/tex-by-uv/release-0.8.12/mop-blueprint/side-sheet.png', one view plus a label on light grey) is cut into side.png with box x 870 w 1052 on a 1068 canvas: the mop sits at the right with a big empty area on the left — the single-view cut keeps background/label or noise columns in the box. Cutting a one-view sheet must give the tight box of the object (labels and specks dropped, same rules as the multi-view cut), then the view is placed on the shared canvas centred like the others. Copy that side-sheet downscaled to 1024 px wide into tests/fixtures/model/blueprint-side-only-0812.png and test that its cut box width is under 45% of the sheet width and the object is horizontally centred on the output canvas (left and right empty margins differ by < 10% of the canvas width). Version 0.8.13.

Attempt 1 accepted by Lane Pilot BB writer.
