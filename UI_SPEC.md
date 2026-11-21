# Planner UI rebuild: spec

Status: approved by the user on 2026-11-21, ready to build.
Branch: `ui-rebuild` (from `coop-planner-features`). Push only to the `fork` remote.
Mock-up (the reference for every screen below): `C:\Users\Pratham\Downloads\satisfactory-coop-planner\ui-mockups\index.html` (PC) and `phone.html` (phone size). It runs from the file, with the user's real Assembly Director System plan in `plan-data.js`.

## 1. Why

The planner works, but its screen is hard to use, even for a player with 300 to 400 hours in the game. A friend of the user finds it overwhelming. The problems found on 2026-11-21:

- **Four layers of navigation before you reach anything.** There's the orange site bar (Discord, GitHub, donate, version picker), then a rail of 13 unlabelled icons, then panel tabs, then calculator tabs. About a dozen more tabs hide behind "More".
- **Settings in four places:** the site gear, the calculator "Settings" button, the Planner settings panel, and settings inside calculator tabs.
- **Overlapping panels.** Overview, Items, Power and Build cost show overlapping totals.
- **Unreadable tab labels.** When a side panel opens, the calculator tabs shrink to bare numbers ("13/13", "194/276").
- **Lost and accidental plans.** The last plan isn't reopened. "What do you want to make?" quietly starts a new plan, and the rail's + makes "Unnamed plan"s.
- **Shortcuts firing by accident.** Single-letter hotkeys go off while typing, e.g. the Export dialog opening.
- **The flow chart is the main problem.** Lines run all over, bend at random spots and angles, and get unreadable with many belts. A crossing looks like a join. Blocks show only the recipe name.
- **Phone:** it opens to an empty canvas, and the bottom bar shows 5 of 12 panels.

Who it is for: any Satisfactory player, solo or co-op. They use it alt-tabbed on one PC, on a second monitor beside the game, and on a phone propped up while playing. One plan makes one product. Parts made elsewhere go in as Supply.

## 2. Decisions the user made

1. **Keep the flow chart idea.** Blocks with building and item icons, and arrows showing what goes where. Only its look and line routing change. No new kind of view, and no splitting the app into separate pages.
2. **Rates go on the lines** (item icon and rate), not listed inside the blocks.
3. **A top bar that is always shown**, with the tabs the user changes most, one click away.
4. **Tabs open a full-width panel that drops down under the top bar**, not a sidebar. The chart stays in place behind it.
5. **One home for every setting.** Nothing appears in two places.
6. **Game wording and plain words.** No "·" separators, no made-up names, no clever labels.
7. **Look C ("Large") is the default.** Look B ("Game style") is a choice in Settings. Look A is dropped.
8. **Two layouts for the chart:** Free (default) and Grid, chosen in Settings.
9. **Co-op indicator** in the top bar: "Playing solo" or "Co-op: <space name>". Invites go through the Share button.
10. **Every existing feature stays.** If a feature has no home in this spec, that's a bug in the spec. Build it anyway and ask.
11. **This branch isn't tied to the user's private Supabase project.** The co-op server is a setting, with a self-host guide.

Anti-goals, things that make the result wrong even if it works:
- Any feature from today missing or harder to reach.
- Lines that bend for no reason, unlabelled lines, or crossings that look like joins.
- Confirm popups, or settings in two places.
- A screen that overwhelms a new player.

## 3. Screen layout (PC)

```
[logo] [Plan name ▾] | Produce  Recipes  Resources  Supply  Belts(On/Off)  Materials  More ▾ |  [Preview] [▶ Calculate][▾]  (Playing solo)  [Share]  [⚙]
┌─────────────────────── panel of the open tab (full width, under the top bar, up to 44% of the height) ─────────────────────┐
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  flow chart (everything else)
  [undo redo | + − fit | Rearrange]                                                              2.8 GW power  194 buildings  Up to date
```

- **Top bar:** 54 px, always shown. The orange site bar is removed from the planner page. The logo goes to the site home, where Codex, Map, Mods and Versions stay as they are.
- **Plan name ▾** opens the plan panel (section 6.1). It replaces the Plans rail panel.
- **Tabs:**
  - Clicking a tab opens its panel; clicking the same tab again, or ✕, closes it.
  - The open tab is highlighted.
  - **Belts** shows an On/Off badge for Belt view.
  - **More ▾** lists the rest (section 5.7).
- **Panel behaviour:**
  - Only one panel is open at a time.
  - Opening or closing a panel does not move the chart on screen: the view shifts by the panel's height.
  - The panel scrolls inside itself.
- **Preview:** today's Calculate preview dialog, unchanged.
- **Calculate:** the main button. Its ▾ holds the calculation mode: Automatic (recalculates after every change), Manual (replace), Manual (merge), Manual (add), each with today's description. While calculating, the button becomes Cancel.
- **Co-op indicator, Share and ⚙:** see sections 7 and 8.
- **Chart tools**, bottom left: Undo, Redo, Zoom in, Zoom out, Fit, Rearrange. Add "Find block" (today's Go to node) to this group.
- **Status**, bottom right: power, buildings, and calculation state ("Up to date", "Calculating", "Outdated").
- **Narrower PC windows:**
  - Below 1480 px, Preview and Share become icon-only.
  - Below 1180 px, the logo and the "Playing solo" text hide (its icon stays) and the tabs tighten.
  - ⚙ must always stay on screen. Check at 1440, 1280 and 1024 px.
- **Hotkeys:** keep today's hotkeys, but none may fire while focus is in a text field, select or menu. Each panel and More entry keeps its hotkey.
- **Reopen the last plan:** opening the planner opens the last plan used on this device. The old "What do you want to make?" box is replaced by an empty-plan state inside Produce (section 5.1).

## 4. The flow chart

### 4.1 Blocks

Every block has the same parts in the same places. Content per type:

- **Recipe block:**
  - Product icon.
  - Machine line: machine icon plus "3 Assemblers".
  - Recipe name, with an "Alt" tag for alternates.
  - Clocks: "2 at 100% + 1 at 66.67%" (clock fractions when that setting is on).
  - Output: "Makes 2/min".
- **Resource block:** item icon, name, "531.79/min", "Resource". When resource nodes are set up, it also shows capacity against need.
- **Supplied block:** item icon, name, "80.46 of 180/min", "Supplied".
- **Output block** (the product): item icon, name, rate, "Output", with an accent border.
- **Subplan block:** today's content.
- **Ports:** small coloured dots on the block edge, in the item's line colour. Inputs on the left, one per incoming connection; outputs on the right, one per item made.
- **Badges** on the top edge: Built (green), Locked, and the co-op claim colour.
- **States:** hover, selected (accent outline), faded (another block or line is focused), built (green border).

Look C ("Large"): block width 300, icon 52 px, machine count 19 px bold. Look B ("Game style"): block width 256, chamfered corners, and an orange band on top with the machine count and rate.

### 4.2 Lines: the rules

These rules came from inspecting the chart zoomed in, section by section. Check them the same way while building.

1. **One line per connection**, coloured by item. Each item keeps its colour across the whole chart; fluids use blue. Colour can be turned off in Settings.
2. **Labels on the lines:** each line ends in a label with the item icon and rate ("531.79/min"), right before the block it feeds. All labels in a column gap are right-aligned at the same x. When belt limits are shown and one belt isn't enough, the label adds "2 belts" (or "2 pipes") in amber.
3. **Right angles only**, with one corner radius everywhere. Lines never pass through a block.
4. **One split point per output.** Lines leaving the same output share one vertical line and branch at one point, marked with a dot. Only splits get dots.
5. **Split near the blocks being fed**, like a manifold: the shared part stays one line as long as possible.
6. **Long belts:** a belt feeding blocks several columns away runs as one line along the lane between rows. It drops a branch at each column where a block takes some, and ends at its last block.
7. **Crossings show a gap.** Every line has a dark edge in the chart's background colour, so the line on top visibly breaks the one underneath. Within one split group the edge must not cut the group's own branches: draw each group's edges first, then its lines.
8. **Fewer crossings:**
   - Order blocks in each column by barycentre sweeps, then swap neighbouring blocks whenever that lowers the crossing count.
   - Inputs on a block are ordered by where their lines come from.
   - Within a gap, order the vertical lanes by pairwise crossing cost.
   - When it costs nothing, put split groups on the lanes closest to the blocks they feed.
9. **Resources and supplied parts** sit one column before their first user, not in a far-left column.
10. **Hover and selection:**
    - Hovering a line or its label lights up that whole connection, from start to end, and fades the rest. A tooltip shows: "Item: rate. From X to Y", plus belts needed when limits are shown.
    - Clicking a block lights up all its connections the same way.
    - Escape clears.

### 4.3 Layouts

- **Free** (default): columns by production depth, rows placed as close as possible to straight lines (isotonic placement that keeps the order), lanes packed from the left of each gap.
- **Grid** (Settings, Flow chart, Layout):
  - All blocks are the same height, rounded up to a whole number of grid steps; the step is the port spacing (24 px in Look B, 30 px in Look C).
  - Rows are evenly spaced; the row height is the block height plus three lanes.
  - Every port, lane and bend sits on one shared line grid across the chart.
  - Each input takes the free slot closest to where its line comes from, so most lines arrive straight. When a line changes height, it moves by whole grid steps.
  - Column gaps are all the same width. Lanes are centred in the space left of the labels.
  - Long belts use up to three fixed lanes between rows.
- **Direction:** left to right (default) or top to bottom, from Settings. Top to bottom is today's option; the same rules apply, rotated.
- **Spacing:** the block and column spacing sliders from today's settings still apply.

### 4.4 Editing on the chart

Everything that works on today's chart keeps working, moved onto the new routing:
- dragging blocks, and box selection
- adding blocks (A key, right-click on the empty chart)
- connecting ports by dragging
- undo and redo
- export as image

- **Moving a block** re-routes only its own lines with the same rules. The corner next to the moved block follows it.
- **Bends by clicking a line:** off by default, as today. A line the user has bent keeps its bends (`autoRouted = false`), and "Straighten line" resets it.
- **Rearrange** re-runs the full layout.
- **Saved plans:** they still store `vertices` and `labelDistance` per edge. Plans saved before this branch load and are re-laid out the first time they're opened. Their numbers never change.

### 4.5 How to build it

- **Layout:** the layout and router in the mock-up (`ui-mockups/app.js`, `layout()` and the drawing functions) is the reference. Port it to a TypeScript module, e.g. `Model/Planner/Layout/FlowLayout.ts`, that returns block positions, edge vertices and label positions. Use it in place of the ELK call in `PlannerGraphService` (around line 555 to 620). ELK can be removed once nothing uses it.
- **Drawing:** keep AntV X6 for rendering and interaction:
  - Blocks become HTML or SVG nodes with the new markup.
  - Edges use custom markup: a casing path under the line path. Label pills are X6 edge labels.
  - Junction dots are a small overlay layer.
- **Performance:** plans of 2,000 blocks must stay usable. Today drawing takes about 50 s, and the new layout must not be slower.
  - Count crossings with an accumulator tree, not all pairs.
  - Cap the sweep and swap rounds.
  - Draw only what's in view where X6 allows.
  - Measure on the biggest test plan, and report the timings.

## 5. Panels (what each tab holds)

Every control below exists today. Read the matching template in `Components/Planner/Panels/Calculator/Tabs/*` before building each panel, and carry over every control, message and edge case it has. The mock-up shows each panel with real data.

### 5.1 Produce (today: Request)
- One row per item:
  - item picker
  - mode: Per minute or Maximise
  - rate with unit; the power target uses MW, GW or TW
  - "Made last time" result
  - remove
- "+ Add item". Power (generators) and Sink points (AWESOME Sink) can be targets.
- Today's warnings about somersloops with a maximised item.
- **Empty plan:** a single item picker with a one-line hint. It fills the first row of this plan and never creates a new plan.

### 5.2 Recipes
- Search, filter (All, In this plan), and the resource conversion switch, with today's tooltip.
- **Alternate recipes** and **Standard recipes** sections, each with a count and All/None. "In plan" tags.
- Recipes whose machine is turned off are crossed out, with today's tooltip, and a note pointing to More, Machines.

### 5.3 Resources
- Resource weights mode: Automatic (from map resources), Automatic (from limits), All equal, Manual, with today's descriptions.
- All, None, Select from the map, Set from map limits (when map data exists).
- One row per raw resource:
  - on/off
  - icon and name
  - limit with unit (/min or m³/min)
  - ∞ (unlimited) toggle
  - weight: shown, or editable in Manual
  - how much the plan uses
- **Map area:** when an area was drawn on the map, the rows lock, with the note, Show on the map, and Remove the area.
- **Folder pool:** when the plan is in a folder with a shared resource pool, show today's pool table: folder limit, this plan, weight, share of the pool bar, over-use warning, legend.
- The warning when raw resource weights are off in Optimisation.

### 5.4 Supply (today: Input)
- Rows: item, amount /min, weight (with today's default tooltip), "Using X of Y/min", remove.
- "+ Add part".
- The warning when input weights are off in Optimisation.

### 5.5 Belts (today: Logistics)
- **Show belt and pipe limits** (today's "enabled"): marks connections that need more than one belt or pipe.
- **Belt view:** split over-limit connections into lines, one belt each.
- Fastest belt (Mk.1 to Mk.6) and fastest pipe (Mk.1 to Mk.2).
- **Machines per line:** today's Default machine grouping for new nodes. This is its only home now: it also applies when Belt view is off.
- **Custom: arrange belts myself.** When ticked, Belt management is enabled:
  - Fewest belts
  - Even spread (with the full capacity to as even as possible slider, and "Split a machine's output across belts")
  - Round up to full belts
  - Allow changes to machines and clock speeds, with today's explanation
  - Apply
- The count of connections that need more than one belt or pipe.
- Belt view rules don't change (memory: belt-view-design); this branch only changes how lines are drawn.

### 5.6 Materials (today: Build cost)
- Totals: building counts per type, buildings (and how many built), power shards, somersloops.
- Search, and "Hide what is built".
- Materials list with amount and what's left.
- Clicking a building type lists its blocks, and clicking one goes to the block, as today.
- The note that miners, belts, pipes, splitters and mergers aren't counted.

### 5.7 More ▾
First group, plan settings:
- **Power generators** (today: Power tab):
  - Produce power to run the factory, and excess power.
  - Fuels per generator, with All/None.
  - Geothermal geysers by purity, Alien Power Augmenters and boosted count.
  - All of today's warnings.
- **Clock speed and power shards** (today: Overclocking tab):
  - Default clock speed.
  - Per recipe, per machine type and per power generator lists.
  - Power shard budget, shards available, used, Fit to budget.
- **Somersloops:** available, accuracy, warnings.
- **AWESOME Sink:** search, sort by name or points, All/None, items with points.
- **Byproducts:** search, All/None, items.
- **Machines:** All/None, production machines with recipe counts.
- **Optimisation:** goals (raw resources, input weights, power with cost, machine count with cost and partial or whole machines), custom cost per machine.

Second group, views:
- **Overview:** today's Overview panel (production, consumption, net, artifacts, resource conversion, folder view).
- **Items:** where each item comes from and goes.
- **Power use:** today's Power panel, consumption by building.
- **Codex, Map, Help.**

### 5.8 Block details (today: Inspector)
Opened by double-clicking a block, or with "Block details" in its right-click menu. Uses the same drop-down panel.
- **Recipe:**
  - Machine groups (machines, clock speed, somersloops, remove), "+ Add machine group".
  - Grouping mode, default clock speed, Autofill, Apply.
  - Built count, Locked.
  - Inputs and outputs, with rates and belts needed.
  - Manifold splitters and mergers.
  - Power and shards, efficiency, fuel for generators.
  - Today's suggestions and warnings.
- **Resource:**
  - Resource nodes rows (count, purity, extractor, clock), "+ Add row", Remove setup.
  - Capacity against need, satellites for resource wells.
- **Supplied, output, subplan:** today's editors (amount; open the subplan).
- **Several blocks selected:** "N blocks selected. Select one block to edit it."

## 6. Menus

### 6.1 Plan panel (plan name ▾)
A full-width drop-down panel, like the tabs, containing today's Plans panel. The mock-up shows only a short popover; build the full panel:
- the plan tree with folders and drag and drop
- sections: Your plans, or the co-op space's plans; On this device; Shared with you
- the plan, folder and section right-click menus
- New plan, New folder, Import old plans

**This plan** actions:
- Rename, Duplicate, Move to folder
- Load from a game save
- Factory location on the map (today's Location button)
- **Plan settings:** inherit from the folder, reset to defaults, set default settings for the folder, Fixed groups and Shared pool (today's calculator Settings menu)
- Recalculate plans in the folder, with progress and outdated count
- Import plan file, Delete plan
- Read-only and shared notices, as today: "This plan belongs to someone else…", "Add to my plans"

### 6.2 Right-click menus
- **Recipe block:**
  - Block details, Clock speed and power shards
  - Mark as built / Not built yet, Split into more blocks, Lock / Unlock
  - Claim / Unclaim (co-op only), "Claimed by <name>" when someone else holds it
  - Convert to subplan, Open subplan, Unpack subplan
  - Convert to (today's conversions)
  - Disable this recipe, Disable machine (<machine>), Disable fuel (<fuel>), Disable generator, Disable byproduct
  - Delete block
- **Resource block:** Block details, Set up resource nodes, Disable this resource, Delete block.
- **Supplied block:** Remove from Supply. **Output block:** Remove from Produce.
- **Several blocks:** Convert to subplan, Lock all, Unlock all, Delete N blocks.
- **Line:** Straighten line, Delete connection.
- **Empty chart:** Add block here, Create subplan here.

### 6.3 Share
- **Invite friend to edit:** copies the co-op invite link. When playing solo, it opens the co-op box first.
- **Send a copy:** a link to a copy of the plan; their changes don't touch yours. Today's share links go through the upstream server and are hidden. On this branch, store the copy through the co-op database instead, so self-hosters get it too. If that can't be done cleanly, hide this item and say so.
- **Download plan file:** today's export.
- **Save chart as image:** today's graph export dialog.

## 7. Co-op

- **Top-bar indicator:** "Playing solo" with a person icon; or "Co-op: <space name>" (just "Co-op" if no name), with one dot per player in their colour, faded when offline.
- **Click when solo:** a box with "Name for your co-op space", Start co-op, and "I have an invite link".
- **Click in co-op:**
  - players with online state
  - Parts and claims: today's Co-op panel views (My part, Unclaimed, Claimed, All), materials still to build, Needs attention; shown in the drop-down panel
  - Copy invite link, Change my name and colour, Rename space, Leave co-op
- Claims, built marks and live updates work as today (memory: coop-direction). The join page `/coop/join#…` keeps working.
- **Server is a setting:**
  - Settings has Co-op server address and public key.
  - The build default in `env.ts` is empty on this branch, so a fresh build has no server until one is entered.
  - A deployment may still set a default at build time.
  - Add a self-host section to the README: create a Supabase project, run `supabase/migrations/20261110000001_coop_spaces.sql`, paste the address and key.

## 8. Settings (⚙), the one place for settings

A sheet from the right:
- **Appearance:** Look: Large (default) or Game style.
- **Flow chart:**
  - Layout (Free, Grid), Direction, Block spacing, Column spacing
  - Colour lines by item, Show clock speeds as fractions, Add bends by clicking a line
  - Colour blocks by machine, with the per-machine colours from today
- **Co-op server:** address, public key, link to the guide.
- **Keyboard:** Keyboard shortcuts.
- **App:**
  - Send error reports
  - Game version and custom versions and mods
  - Sign-in and account settings while `AppFeatures.accounts` is on (hidden now, as today)

Nothing else may hold a setting. Machines per line lives in Belts only. Plan-level calculation settings live in the plan panel and the More entries, because they belong to the plan, not the app.

## 9. Phone (under 761 px)

- **Top bar:** plan name ▾, Calculate (icon) with its ▾, co-op icon, Share icon, ⚙.
- **Bottom bar:** the seven tabs (Produce, Recipes, Resources, Supply, Belts, Materials, More), all visible at 390 px.
- **Panels** open as a sheet from the bottom, up to 66% of the height, over the chart.
- **Chart:** pinch zoom, drag to pan, tap selects, long-press opens the right-click menu.
- **Settings** is full width.
- Check at 390 by 844 (the mock-up's `phone.html`) and on the user's Android phone.

## 10. Looks

Both looks are dark (a brand commitment). The tokens are in `ui-mockups/style.css` under `body[data-look="c"]` and `body[data-look="b"]`.

- **Large (C):** Archivo, warm near-black grounds (#0f1012 to #24272b), accent #ffb347, radius 14, lines 2.6 px.
- **Game style (B):** Roboto Condensed, neutral greys (#161616 to #2e2e2e), FICSIT orange #fa9549, uppercase tabs, chamfered blocks with an orange band, radius 2, lines 1.8 px.
- **Fonts:** self-host them (the desktop app runs offline); no Google Fonts at runtime.
- **Item colours:** 14 colours plus fluid blue, in `COLOURS` in the mock-up.
- **Theme the browser surfaces too:** selection colour, focus rings, scrollbars, range inputs.

## 11. Wording

- Tab names: Produce, Recipes, Resources, Supply, Belts, Materials, More.
- Renames: "Mark as done" → "Mark as built"; "Default machine grouping" → "Machines per line"; "Build cost" → "Materials"; "Inspector" → "Block details"; "Input" → "Supply"; "node" → "block" in the interface.
- Use the game's names for items, buildings, belts ("Conveyor Belt Mk.5"), pipes ("Pipeline Mk.2"), Somersloops, Power Shards, the AWESOME Sink.
- No "·" separators, no invented example names or claims, sentence case. Controls say what they do.

## 12. How to build and check

1. Work on `ui-rebuild`. Commit after each screen or part.
2. Order:
   1. top bar and panel shell
   2. Produce, Recipes, Resources, Supply, Belts, Materials
   3. More entries and Block details
   4. plan panel
   5. menus, Share, co-op indicator, Settings
   6. the new layout and line routing
   7. Grid layout and looks
   8. phone
   9. co-op server setting and README
3. **Keep every feature.** Before removing a component, list each control it had and point to its new home. A small checklist per old component goes in the final report.
4. **Check in the browser** at 1440, 1280, 1024 and 390 px, in both looks. Use an incognito preview profile so the user's saved plans are never touched.
5. **Test plan:** one product with parts supplied, e.g. Assembly Director System at 2/min with plastic and rubber in Supply and the common alternates. Add one big plan for timing.
6. **Inspect the lines zoomed in:** capture tiles of the whole chart at about 75% zoom in Free and Grid, read every tile, and fix what looks wrong before calling it done.
7. `npx ng build` must pass. There are no unit tests; add small tests for the layout module where cheap.
8. Never install Rust. Desktop builds happen on GitHub.
9. **When done:** merge into `coop-planner-features` (or allow `ui-rebuild` in the `github-pages` environment), push to `fork`, and check the live site, on the phone too.

## 13. Not decided, or left to the builder

- **"Main line" drawing:** for belts that feed blocks in 3 or more columns, draw one thicker line along a lane with short drops. Suggested, not agreed. Don't build it unless asked.
- Exact pixel sizes, spacing and animation are the builder's call, within the mock-up's look.
- If a feature turns out to have no home in this spec, give it the closest sensible home, note it in the report, and ask.

## 14. References

- Mock-up: `ui-mockups/index.html`, `phone.html`; layout reference `ui-mockups/app.js`; styles `ui-mockups/style.css`.
- Screenshots: `ui-mockups/screenshots/` (look-a/b/c, grid, grid-left, grid-middle, free-middle, belts-panel).
- Product record: `SFTools/PRODUCT.md`.
- Project state and earlier decisions: `HANDOFF.md`, `PROMPT.md`, and the memory notes belt-view-design, coop-direction, user-build-style.
