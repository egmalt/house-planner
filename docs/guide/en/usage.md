# Using the planner

**English** | [Русский](../ru/usage.md)

The interface is in English and Russian; the language follows the browser and can be switched in "⋯" → Language. Labels below are the English ones.

## Layout

The header switches sections: "Plan", "3D", "Map", "Estimate" and "Plot & house" (site and house notes). The address is a hash (`#/plan`, `#/3d`, `#/map`, `#/estimate`, `#/info`), so each section can be bookmarked. On the right of the header: the save indicator and the "⋯" menu with JSON export/import and versions.

Every finished edit is sent to the server immediately. If the save fails, the edit is rolled back to the server copy; if someone else changed the plan in the meantime, the app reloads the server plan and reapplies your edit on top.

## Plan editor

| Tool | Key | What it does |
|---|---|---|
| "Select" | `V` | select, drag wall ends, openings, furniture, zones |
| "Wall" | `W` | click start, click end; walls chain until `Enter` or `Esc` |
| "Door" | `D` | click on a wall; default 960×2070 entrance or 800×2000 interior door |
| "Window" | `O` | click on a wall; default 1200×1400 with an 800 mm sill |
| "Zone" | | click polygon vertices, `Enter` to finish: fill, lawn, paving |
| "Building" | `B` | select the whole building to move or rotate it |
| Ruler | `M` | click A, click B; hold `⌘`/`Ctrl` to chain segments |

Other keys: `⌘Z` / `⌘⇧Z` (or `Ctrl`) undo and redo, `⌘A` select all on unlocked layers, `Delete` removes the selection, `Shift` snaps the angle to 45° steps while drawing, `F` flips a door or gate to the other side, `H` moves the door hinge, `R` rotates selected furniture, `Esc` cancels.

Snapping works to wall ends and a 100 mm grid. Wall length, thickness, height and material are edited in the inspector on the right; lengths can be typed directly. Right-click inside a room and choose "Label room" to add a room label; the room outline and net area are found from the walls.

**Furniture.** The "Furniture" button opens a catalog of items with real sizes: drag one onto the plan. Plumbing fixtures from it (toilet, sink, shower, washer, boiler) become endpoints for the sewer and water networks.

**View.** Rotate the view in 15° steps, switch between "Plan up" and "North up", show the whole plot, show wall lengths permanently, and put the satellite image under the plan.

**Summary.** "Summary" shows total and living area, number of rooms, bedrooms and bathrooms, footprint, height, plot coverage and wall cost.

## Layers and networks

"Layers" lists walls, furniture, zones and the four networks. Each layer can be hidden, dimmed or locked against accidental edits. The pencil next to a network enters its editor; `Esc` or the cross leaves it.

**Sewer.** Modes: select, route, cleanout, riser, outlet, septic. Start a route on a fixture, click to add nodes, finish on a node. Where the route leaves the house the outlet is placed on the wall. Diameters and slopes get defaults (110 from the toilet down, 50 for the rest; 2 % inside, 1 % outside). The panel shows invert levels, the depth at the septic tank, fittings and warnings: slopes below СП 30.13330 minimums, shallow outside pipes, a septic tank closer than 5 m to the foundation or 1 m to the boundary.

**Electrical.** Place the panel, sockets, switches and lights on walls, group them into circuits with breaker type, rating and cable. "Auto-route" routes cables from the panel along the walls. The calculation gives cable lengths per type, conduit, boxes, breakers, RCDs and panel size, and warns about oversized breakers, overloads, voltage drop over 5 %, wet zones without RCD, sockets in bathroom zones 0–2.

**Water supply.** Draw cold, hot and recirculation lines; place a source, pump, filter, boiler and manifolds. Clicking a fixture runs a separate 16 mm PEX line from the nearest manifold. Checks cover burial depth without heating cable, distance to the sewer and from the well to the septic tank.

**Underfloor heating.** "Lay out by rooms" lays out loops room by room: step by room type, fixed furniture cut out, edge loops at outside walls, loops over 80 m split, small loops merged when there are more than 12. The panel compares floor heat output with heat loss, gives loop lengths, flow settings and the mixing unit pump, and fills the estimate.

## 3D

"Mock-up" shows clean massing, "Materials" shows textures by wall material and facade finish. Cameras: 3/4, top, front. Wall cut: full height, 1 m, or floor only, to see the layout from above. Wall and accent colours are picked from the RAL palette and saved in the plan.

## Map

The plan is drawn over satellite imagery using `site.geo`. "Boundary from GeoJSON" takes a parcel polygon in longitude/latitude, computes the geo-reference and replaces the boundary. If the imagery is offset from the cadastral data, align it with the shift and rotation controls; only the imagery correction is stored, the plan does not move. Neighbouring parcels are drawn from `data/parcel.geojson` if that file exists. More in the [FAQ](faq.md#how-do-i-load-my-own-plot).

## Estimate

One A4 sheet: wall materials, doors, windows and gates, network groups, and manual lines. Prices come from `data/catalog.json` or from the plan's own materials. Tick "Purchased" to mark a line as bought and record the actual price. "Download CSV" exports a semicolon-separated file that opens in Excel. Print with the browser (`⌘P` / `Ctrl+P`): the sheet is laid out for A4. "Build Petrovich cart" builds carts on petrovich.ru, see the [FAQ](faq.md#how-does-the-petrovich-cart-work).

## Versions and snapshots

Every save is a numbered revision on the server. "⋯" → "Versions" shows two lists: "Saved" (named snapshots) and "All changes" (every revision with author and time). Create a snapshot with a name, restore any snapshot or revision: the restore is written as a new revision, nothing is lost.

## Phone and tablet

On screens narrower than 700 px or touch-only devices the app is read-only: you can view the plan, 3D, map and estimate, but nothing is written to the server.

Next: [editing the plan as JSON](plan-via-chat.md).
