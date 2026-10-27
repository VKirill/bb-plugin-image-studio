STATUS: complete

# classifyViews misses the real 0.8.10 sheet (absolute 0.72 threshold; copy pair scores 0.66 vs 0.32/0.27): decide by a clear margin, add the real sheet as a test

On the real 0.8.10 Muse sheet ('/Users/vechkasov/Documents/Мои проекты/Roblox/lava-arena/.bb/chats/thr_vgdyg342s5/artifacts/tex-by-uv/release-0.8.10/mop-blueprint/sheet.png': BACK panel is really the edge-on side, SIDE is a copy of FRONT) classifyViews returns pairs front/side 0.66, front/back(mirrored) 0.32, side/back 0.27 and decides relabeled false, drawn 'side', because it requires the best pair >= VIEW_CLASSIFY_SIM 0.72. Decide by margin instead: the best pair is decisive when its similarity >= 0.45 and >= 1.6x the second-best pair; then front/side best with back odd -> relabel back->side, draw 'back'; front/back best with side odd -> keep, draw null; when all three pairs are within that margin of each other (no decisive pair) -> draw 'side' as today. Copy that sheet downscaled to 1024 px wide (sips -Z 1024) to tests/fixtures/model/blueprint-mop-sheet-0810.png and add a test: cutBlueprint + classifyViews on it gives relabeled true, drawn 'back'. Existing synthetic tests and the 0.8.9 sheet fixture keep passing (check what the 0.8.9 sheet decides and assert it). Version 0.8.12.

Attempt 1 accepted by Lane Pilot BB writer.
