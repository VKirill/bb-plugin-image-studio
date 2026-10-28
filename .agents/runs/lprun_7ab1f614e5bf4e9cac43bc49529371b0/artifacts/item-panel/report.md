STATUS: complete

# Panel: «Предметы» sub-tab in «Текстура по модели» (item cards with a step strip ✓/…/—, thumbnails, selecting a take), item badge on gallery images linking to the card; version 0.9.2

Implement the plan's panel part. (1) Server RPCs: model_items({styleId}) -> item index entries with step statuses and small webp thumbnails of each step's selected entry (read through bb.sdk.files with absolute paths, cached like model_takes thumbs); model_item({styleId, item}) -> the full item.json plus thumbnails of every entry; model_item_select({styleId, item, step, entry}) -> selects with selectedBy 'user'. (2) model-panel.tsx: a sub-tab switch Runs | Items («Прогоны» | «Предметы»); Items lists cards (name, id, updatedAt) each with a horizontal strip of the 7 steps in order: thumbnail of the selected entry, status mark ✓ done / … running / — empty, step label; opening a card shows each step's entries as thumbnails with the selected one outlined; clicking another texture take selects it (model_item_select) and refreshes. (3) Gallery (app.tsx gallery tab): images with itemId show a small badge with the item id; clicking the badge opens the model tab's Items view on that card. (4) i18n ru/en for all labels. Version 0.9.2.

Attempt 1 accepted by Lane Pilot BB writer.
