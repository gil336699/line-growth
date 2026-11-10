# Line Growth

Line Growth is a browser app for differential line growth: a line that keeps lengthening, folding and pushing itself apart until it fills a shape with organic, brain-coral and fingerprint patterns. Pick a boundary, or import one from Illustrator, start from a circle, a line, Voronoi cells or lines you draw, and change the forces while it grows. Give each line its own colour from a gradient, and each cell grows into a coloured piece of its own. Export the result at real size as SVG or DXF for Illustrator, plotters and lasers, or as a PNG. It rebuilds Gil's Differential Growth panel for Illustrator as a web app.

**Use it online:** https://gil336699.github.io/line-growth/

![Line Growth in use: a circle grows and folds to fill a 200 mm disc while a wavy line and a small circle are drawn beside it and grow too, never crossing, an Illustrator SVG with a hole is dropped in and its two start lines fill the shape around the hole, and the result is exported as a real-size SVG.](docs/demo.gif)

[Watch the demo as a video](https://github.com/gil336699/line-growth/releases/download/v1.0.2/line-growth-demo.mp4) (MP4, 1920 × 1200, 25 seconds).

![Coloured cells: 30 Voronoi cells fill a 200 mm disc in a rainbow from purple on the left to red on the right; the same cells grown into branching pieces that pack the disc, each keeping its colour; and cells started in the bottom-left 60 % of a square, grown, packed against the left and bottom and bursting out at the top and right.](docs/cells.jpg)

Everything runs in your browser. Files you open and the lines you grow stay on your computer.

## Run

Needs Node 22 or newer.

```bash
npm install
npm run dev
```

Then open the address Vite prints, usually http://localhost:5173/.

## Publish

Every push to `main` is built and published to GitHub Pages by `.github/workflows/pages.yml`. To host it anywhere else, run `npm run build` and serve the `dist` folder; asset paths are relative, so any folder or domain works.

## Layout

- **Sheet.** The sheet fills the window, with a soft shadow. The boundary shows as a dashed mint guide, as in the Illustrator panel.
- **Left panel.** Four tabs: **Grow** (node limit, speed and the forces), **Shape** (sheet size, boundary, start lines), **Style** (line width, colours and fill) and **File** (project and exports). A dot on File means unsaved changes.
- **Above the sheet.** The Draw, Erase and Pan tools on the left; Boundary, Nodes and zoom on the right. A caption explains the current tool.
- **Below the sheet.** Grow or Pause, Step and Reset, the status, and Undo and Redo.
- **Right.** Measurements: nodes, lines, steps, line length, average segment, the boundary and the growing speed.

On a narrow window the secondary buttons show icons only; on a tablet the panels move below the sheet; on a phone everything is one column.

## Help in the app

Every control describes itself on hover or keyboard focus, with its shortcut. Unavailable controls say why, for example "There are no lines to grow. Draw one, or choose a start shape on the Shape tab." A three-step quick start greets first visits, and **?** lists every shortcut. Discarding unsaved growth, by starting again, opening a file or importing, asks first.

## Workflow

1. **Grow.** Press **Grow** or Space. The default circle fills a 200 mm disc in a few seconds. Change any force while it grows; Pause when you like the look.
2. **Shape.** Choose a sheet size, a Rectangle or Ellipse boundary and a margin, or press **Import SVG…** (or drop an SVG on the window). Pick a start: Circle, Line, Circles, Cells, Outline, or Drawn lines. **Cells** fills the boundary with Voronoi cells, each a closed line that grows into its own piece; **Colour the cells** fills each one in its own colour from a rainbow.
3. **Style.** Choose **Colours: Gradient** on the Style tab to give each line its own colour, by where it starts: Rainbow, Sunset, Ocean, Viridis or your two colours, in any direction. With Fill on, each closed line is filled in its own colour too.
4. **Draw.** Drag on the sheet to draw a line to grow, end where you began to close it, or click between lines for a small circle. A drawn line stops where it meets another, and a circle shrinks to fit, so drawing never makes lines cross. Erase removes a line. Both work while lines grow.
5. **Export.** **SVG** and **DXF** are real size for Illustrator, plotters and lasers. **PNG** is an image at the sheet's pixels per inch, which places at real size too. **Save** writes a `.linegrowth.json` project you can reopen and keep growing.

### Working with Illustrator

The Illustrator panel captured a selection and inserted the result back into the document. Line Growth does the same through SVG:

1. In Illustrator, draw the boundary as a closed path, holes included as a compound path, and draw the lines to grow inside it. Save as SVG, or File › Export › Export As › SVG.
2. Import it. As with Capture, **the largest closed path is the boundary and every other path grows.** Lines wholly outside the boundary are left out, and the status says so. Hidden layers and other hidden elements are left out too, as Illustrator doesn't draw them.
3. Grow, then export SVG. The exported page is the same size as the imported file's artboard, so placing it at the artboard's corner (or opening it and pasting in place) lines it up with your original artwork.

Illustrator writes SVG without a size, in points, so Line Growth reads such files at 72 points per inch and switches the units to points.

**One closed path, up to 32,000 nodes.** Illustrator can't hold a path of 32,767 points or more: its point count wraps around, so such a path opens empty or cut short and closed with a straight line (Gil's 82,406-node line opened as 16,870 points), and Join refuses to make one. A line of up to 32,000 nodes exports as one path, closed if the line is, in SVG and DXF; a longer one comes as a group of paths that meet end to end, and the File tab says so. For one closed path, keep each line at 32,000 nodes or fewer with Max nodes. Don't fill the pieces of a longer line in Illustrator: it fills an open path by closing it with a straight edge, which leaves solid wedges across the pattern. Turn on **Fill** on the Style tab instead. The fill is then its own group, `fill`, with one shape per closed line that fills exactly like the whole line, even when the line is in pieces: it's one compound path whose hidden edges cancel. Zoomed in, those edges can show as a faint hairline. When opening a DXF, choose Original Size in Illustrator's DXF dialog; by default it scales the drawing to fit the artboard.

Pictures have no lines to grow. When Illustrator can't write a shape's look as SVG, such as a freeform gradient, a mesh or an effect, it saves a picture of the shape, trimmed to its outline by a clipping mask. Line Growth then uses the clipping masks' outlines, and the status says so. A file that is only a picture, with no clipping mask, can't be used: select the shape in Illustrator, click Clear Appearance in the Appearance panel, add a stroke and export again.

## Feature reference

### Boundary and start

| Choice | What it does |
| --- | --- |
| Rectangle, Ellipse | The sheet, or the oval that fits it, inset by the margin. |
| Imported | The largest closed path of an imported SVG. Other closed paths in the same compound path are holes the lines keep out of. |
| Circle | A circle in the roomiest part of the boundary, so a hole in the middle is avoided. |
| Line | A straight line across the middle. |
| Circles | Several circles scattered by the seed. |
| Cells | Voronoi cells that fill the boundary, holes and all, each a closed line. Count sets how many, Gap how far apart neighbours start (a share of a cell's width). Size below 100 % fills a smaller copy of the outline, so cells can burst out of it, up to the boundary. Position puts that copy in the middle or against a side or corner, so they burst out only the other way: bottom left packs them against the left and bottom, bursting out at the top and right. The seed places them. |
| Outline | The boundary set in from every edge, holes and all, as an offset path is: a closed line for each ring of the set-in shape, which grows inward from the outline and outward from the holes. Where the shape is narrower than twice the inset, as at a narrow fissure or between close holes, it drops out or parts in two, so the start lines never cross the boundary, a hole or each other. |
| Drawn | Lines you drew or imported. Drawing on any start turns it into Drawn lines. |

### Exports

Every export holds what the view shows: the lines, plus the boundary and the nodes when those are shown.

| Export | Contents | Units |
| --- | --- | --- |
| SVG | One path per line, as smooth curves through every node (or straight segments with Smooth curves off), stroked at the line width. A line of more than 32,000 nodes is a group of paths of up to 32,000 that meet end to end. With Fill on, group `fill`, under the lines, holds one filled shape per closed line. With Colours set to Gradient, each line's path (or the group of its pieces) has its own stroke colour, and each fill its own fill colour. The boundary is a solid mint path in group `boundary`; nodes are dots in group `nodes`. No background. | mm, in, pt or px, as the sheet's units |
| DXF | AutoCAD R12 text. One polyline per line on layer `LINES` (past 32,000 nodes, polylines that meet end to end), the boundary on `BOUNDARY`, nodes as points on `NODES`. Lines only, without colours or fill. | mm, or in for inch sheets |
| PNG | The design at the sheet's pixels per inch, in its colours, with the fill when it's on, optionally with a transparent background. The file records its pixels per inch, so Illustrator, InDesign and Photoshop place it at real size. | px |
| Project | Settings, the imported boundary, the start lines and every grown node, as `.linegrowth.json` (schema `line-growth/project`, version 1). | mm |

## Controls

| Control | Effect |
| --- | --- |
| Auto tune | Chooses the growth settings and line width from the boundary and start lines, now and whenever either changes, using the Illustrator panel's Capture rules. Max nodes then sets how fine the lines are. Off keeps your own. |
| Max nodes | Most points the lines can have (40–100,000), and with Auto tune on, how fine they are. Auto tune picks it as the panel did. Set it higher yourself and Auto tune keeps your number and scales the segment length, repel radius, step size and line width to suit it: four times the nodes, lines half as far apart, with the same forces. Lower than Auto tune's choice, it only caps the nodes. At the limit, lines keep settling. When lines fill the boundary before the limit, the status says so. |
| Speed | Growth steps per screen update (1–30). |
| Segment length | Ideal distance between neighbouring nodes, and the spacing of the fixed boundary points. |
| Repel radius | How far nodes push each other, and the boundary pushes nodes, away. |
| Repulsion | How hard they push. The boundary pushes twice as hard. |
| Attraction | How strongly neighbours pull toward the segment length. |
| Alignment | How much each node moves toward the middle of its neighbours, smoothing the line. |
| Step size | How far nodes move per step. |
| Randomness | How far new nodes are nudged sideways (0–100 %). At 0 % growth follows the Illustrator panel's rules exactly, except that lines never cross. |
| Seed | The same seed and settings always grow the same lines. |
| Preset, Units, Width, Height | Sheet size. Units are mm, in, pt or px; switching converts the numbers. Grown lines stretch with the sheet. |
| Margin | Gap between the sheet edge and a Rectangle or Ellipse boundary. |
| Start from, Size, Count | The start lines, their size as a share of the boundary, and the number of circles. |
| Count, Size, Position, Gap (Cells) | How many cells, how much of the boundary they fill (10–100 %), where a smaller area sits (the middle, a side or a corner, picked on a grid of nine points), and how far apart neighbours start (0–50 % of a cell's width). |
| Line width, colours | Line width and colour, and the sheet colour for the preview and PNG. |
| Colours | One colour for every line, or Gradient: each line, its fill and its nodes take the gradient's colour at the middle of where the line started, so a line keeps its colour as it grows. The gradient runs from the line furthest back along the direction to the one furthest forward. |
| Gradient, Direction | Rainbow, Sunset, Ocean, Viridis, or your two colours (From and To); Direction 0° runs left to right, 90° top to bottom. |
| Fill | Fills the inside of each closed line with the fill colour, or with each line's own colour when Colours is Gradient. Open lines have no inside, so they stay lines. The boundary's holes stay clear: in SVG each hole is cut out of the fill's compound path. In the preview, SVG and PNG; DXF holds the lines only. |
| Boundary, Nodes | Show the boundary guide and the nodes, in the view and in exports. |
| Smooth curves | SVG lines as curves through the nodes, or straight segments. |

Lengths that scale with the sheet (segment length, repel radius, step size) use the Illustrator panel's slider ranges, which were in a space where the larger side is 1,200 units, scaled to the sheet.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Space | Grow or pause (hold Space and drag to pan) |
| S | Grow one step |
| R | Reset to the start lines |
| D, E, H | Draw, Erase and Pan tools |
| Scroll, pinch | Zoom |
| +, −, F | Zoom in, out, fit |
| 1, 2 | Boundary, nodes |
| ⌘Z, ⇧⌘Z | Undo, redo |
| ⌘S, ⌘O | Save, open project |
| Esc | Close a dialog, or go back to Draw |
| ? | Shortcuts and quick start |

## How it works

Each line is a chain of nodes. On every step, as in the Illustrator panel:

- **Splitting.** Edges longer than 1.25 segment lengths are split at their middle, depth first along each line, until the node budget is spent. When the budget runs short it is shared out one node at a time, line by line.
- **Repulsion.** Every node is pushed away from every node within the repel radius, on any line, by (1 − distance / radius) × repulsion.
- **The boundary.** Fixed points one segment length apart along the boundary push nodes away twice as hard, and a node that still crosses the boundary is put back on its nearest edge.
- **Attraction and alignment.** Each node is pulled toward the ideal spacing from its two neighbours, and toward the point midway between them.
- **Open ends** move at 15 % of the force, so open lines grow from their middles.
- **Movement.** All nodes move at once, by the total force times the step size.

What's new in the engine:

- **A spatial grid** finds the nodes within the repel radius, so a step costs about the same per node at any count. The panel compared every node with every other node.
- **A Web Worker** runs the growth, so drawing, editing and zooming stay smooth however slow a step gets. It sends the page one frame at a time, only after the page has drawn the last one.
- **Lines never cross.** Repulsion keeps lines apart, but a fast fold or a dense, stiff packing can carry one edge across another between steps, which the panel allowed: with a small segment length, its rules crossed lines within 100 steps. Now any node whose move would make two edges cross stays where it was, checked again until nothing crosses. Edges that already crossed before the move, as lines in an imported drawing can, aren't held back, so they never freeze in place. Moves that cross nothing are untouched, so ordinary growth is exactly the panel's.
- **Randomness** nudges each new node sideways by up to randomness × a quarter of its edge, using a hash of the seed, step and node, so even shapes break into organic folds and every run is repeatable. The nudge is part of the node's first move, so it is checked for crossings too.
- **Determinism.** The same lines, settings and step count always give the same result, bit for bit. A test checks that a run saved half way, reopened and continued ends exactly where an uninterrupted run does, and another checks the engine against a copy of the panel's step.

**Cells.** The seed scatters a point for each cell inside the outline, two rounds of Lloyd's relaxation move each point to the middle of its cell, and each cell is the part of the outline nearer its own point than any other. [Clipper2](https://github.com/PolyClipping/Clipper2) clips each cell to the outline, as in Voronoi Studio, so the cells fill a circle, a rectangle or any imported shape to its edges. Each cell is set in by half the gap from its neighbours and from the outline. A smaller area is the outline's outer shape scaled down, trimmed to the outline so its holes stay out. Position slides it toward a corner until it meets the outline, then along each side, so it ends flush with both sides of a rectangle and touches a circle at the corner's angle. A cell the outline cuts in two becomes two lines, and a cell with a hole wholly inside it is first cut in two through the hole, since one line can't go round a hole and hold it out. Auto tune tunes the cells as one cell's line: tuned on all of them together, the panel's rules picked a 6.7 mm segment length for the default circle, so long that 30 cells grew from 361 nodes to 492 and stopped. Small cells are tuned finer, at least 7 segment lengths across, with more nodes to keep the look.

**Limits of the method.** Some settings are unstable: a repel radius of more than about five segment lengths (for example after halving only the segment length) packs so many nodes within reach that their pushes overwhelm the step, and lines judder in place, held back from crossing. The status warns when that happens. Scale the segment length, repel radius and step size together, or turn on Auto tune. Lines that cross in an imported drawing keep growing, but the check can't uncross them, so they may stay crossed. Lines that touch at the start, such as Voronoi edges meeting at a corner, would be held still where they touch, so before growth begins a closed line that touches another is set in by a quarter of the segment length, and an open line's touching end is drawn back by as much. A drawing with many short lines, such as a Voronoi export, can be packed closer than Auto tune's lengths suit; the status says so, and a higher Max nodes makes the lines finer, with room to move. Nodes are only added, never removed, so a line can't shorten. The boundary and imported curves are short straight segments, within 0.02 mm of the drawn curve. Auto tune's own choice follows the panel's rules, made for a node cap of 2,600; a higher Max nodes gives larger or more detailed designs finer lines. Lines that fill a shape use roughly its area divided by the square of the segment length, so the fill can land a little under Max nodes: Gil's pill with a hole filled at 17,637 of 20,000.

## Known limits

Measured on an Apple-silicon Mac, in Node 26 for the engine alone and in the app (Chrome, Code tab preview, 1280 × 800):

| Task | 2,600 nodes | 20,000 nodes | 50,000 nodes |
| --- | --- | --- | --- |
| One growth step, with the crossing check (Node) | 1.25 ms (the Illustrator panel's step: 28.3 ms) | 5.2 ms at 10,000 | 25.8 ms |
| Growing speed (app) | about 102 steps/s, Speed 2 | 83 steps/s, Speed 4 | 34–35 steps/s, Speed 4 |
| Time to fill (app) | about 5 s for the default 200 mm circle | 7 s | 21 s |
| Page delay while growing (a 50 ms timer, app) | — | at most 10.8 ms late | at most 3.5 ms late |
| Pause (app) | 8 ms | 12 ms | 54 ms |
| SVG, DXF, project save (app) | — | — | 58 ms, 42 ms, 10 ms; 2.2, 2.3 and 1.8 MB |

The crossing check costs about 10 % in ordinary growth. When settings are out of balance and thousands of nodes are held back each step, a step at 20,000 nodes takes about 46 ms, and the status says the lines are packed too tightly.

- Up to 100,000 nodes can be set. Beyond about 50,000, growth is slow and files are large.
- PNG export is limited to 16,384 px a side and 120 megapixels, which browsers can draw. Use SVG for larger work.
- The live design is kept in the browser's local storage, every 5 seconds while lines grow and whenever the page is hidden or closed. Local storage holds about 5 MB. Designs above roughly 100,000 nodes may not fit, so save a project file to keep work.
- Browsers slow a hidden tab's timers, even a worker's, to a few a second. Growth catches up by running longer batches, so it keeps going at about 90 steps per second at the default size in a background tab, but Pause can then take up to a quarter of a second.
- The Cells start takes 15 ms for 30 cells in the default circle and 60 ms for 200, and 109 ms for 200 in a 4,096-point outline (Node); at Size 60 % and a corner Position, 42 ms for 30 and 116 ms for 200 there. 30 cells in the default circle grow from 917 nodes to 2,160 in under a second, at 120 steps/s in the app.
- Colours follow the start lines. Cells are made the same way for the same settings, so a reopened project keeps its colours; a project whose grown lines don't match its start lines, made by hand or by a different version, gives the extra lines the gradient's middle colour.
- Frame rate in the browser wasn't measured, as the preview pane wasn't on screen during the long runs.

## Development

```bash
npm run dev         # development server
npm run lint        # ESLint, zero warnings expected
npm test            # Vitest
npm run build       # typecheck and production build
npm run preview     # serve the production build
```

```
src/
  App.tsx              layout, files, import and export, shortcuts
  useGrowth.ts         the design, undo history and the growth worker
  components/          panels, bars, stage, tooltip layer, dialogs
  growth/              the engine: growth step, boundary, start shapes, Voronoi cells, auto tune, geometry
  lib/                 settings, units, design rules, line colours, drawing by hand, project files, SVG import, SVG, DXF and PNG export
  worker/              the growth worker and its messages
docs/                  the demo GIF
test-fixtures/         small SVGs the tests use, including Gil's pill outlines
local/                 QA and timing scripts, not committed
```

The engine is plain TypeScript with no React, and every module has tests beside it.

## Credits

Rebuilt from Gil's Differential Growth panel for Adobe Illustrator. The UI components and SVG reader come from [Voronoi Studio](https://github.com/gil336699/voronoi-studio), and the worker pattern from [Growth Studio](https://github.com/gil336699/growth-studio). The Cells start clips cells with [clipper2-ts](https://github.com/countertype/clipper2-ts), a port of Angus Johnson's Clipper2 (Boost Software License 1.0). The Viridis gradient is the colour map by Stéfan van der Walt and Nathaniel Smith (CC0).

## License

MIT. See [LICENSE](LICENSE).
