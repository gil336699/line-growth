# Line Growth Changelog

## 1.2.1 2026-11-09

- **One closed path up to 32,000 nodes, and DXF opens whole in Illustrator.** Tested in Illustrator 2026: it keeps a path's point count in 16 bits, so a path of 32,767 points or more opens empty or cut short (an 82,406-point line opened as 16,870, an 80,000-point DXF polyline as 14,464), and Join refuses to make one (30,001 points joined, 40,001 didn't). Closed paths of 32,000 points open whole. SVG and DXF now write a line of up to 32,000 nodes as one path, closed if the line is; before, SVG split lines at 10,000. A longer line is pieces of up to 32,000 that meet end to end, now in DXF too, where it had been one polyline that Illustrator cut short. The File tab says when a line exports in pieces, and how to keep it whole. Checked by exporting from the app and opening in Illustrator: a 30,000-node circle opened as one closed path in SVG and DXF, and an 80,000-node line as 3 pieces holding every point, with its fill whole.

## 1.2.0 2026-11-09

- **Fill.** A new Fill switch and colour on the Style tab fill the inside of each closed line, for a two-tone pattern, in the preview, SVG and PNG. In SVG the fill is its own group, `fill`, under the lines, so either can be used or removed in Illustrator. Filling the split pieces of a long line in Illustrator closed each with a straight edge, leaving solid wedges across Gil's ticket design. Line Growth's fill is one compound path per line, of open pieces plus a part whose edges cancel theirs, so it fills exactly like the whole line. Checked in Illustrator 2026 by script: Gil's 82,406-node line opened with all 82,432 points (the line plus its 26 cuts) and filled cleanly. DXF holds the lines only.
- **Checked in Illustrator.** Illustrator 2026 kept only 16,870 of the 82,406 points of Gil's line written as one path, and lines split into pieces of up to 10,000 open whole. Straight and curved test paths of up to 16,871 points opened whole too, but took minutes each, so pieces stay at 10,000.

## 1.1.2 2026-11-08

- **Long lines open whole in Illustrator.** Illustrator cuts a path off at about 32,000 anchor points and closes what's left with a straight line back to the start. Gil's Voronoi ticket design, one line of 83,142 nodes, opened as a patch of coral with a diagonal line across the page. SVG export now writes a line of more than 10,000 nodes as a group of paths of up to 10,000 that meet end to end, with the same curves. Lines of up to 10,000 nodes are written as before.

## 1.1.1 2026-11-08

- **SVGs that are pictures can be imported.** When Illustrator can't write a shape's look as SVG, it saves a picture of the shape, trimmed to its outline by a clipping mask. Such a file has no paths, so importing it said "This SVG has no paths or shapes to use." Line Growth now uses the clipping mask's outline when a file has no shapes of its own, and the status says so. Gil's JHU ICE asset, a page with a ticket-shaped window, now imports, and lines grow around the window. A file that is only a picture, with no clipping mask, says so and how to fix it in Illustrator.

## 1.1.0 2026-11-08

- **Max nodes sets how fine the lines are.** With Auto tune on, raise Max nodes above Auto tune's choice and Auto tune keeps your number and scales the segment length, repel radius, step size and line width to suit it: four times the nodes, lines half as far apart, with the same forces and look. Before, lines filled the shape at the panel's lengths and stopped, so a higher Max nodes did nothing. The default circle at 9,000 nodes now fills to 9,000 in 6.5 s, and Gil's pill with a hole at 20,000 fills to 17,637. It works while lines grow, and a new shape or start keeps your number. Lower than Auto tune's choice, Max nodes only caps the nodes, as before. Turning Auto tune off and on again hands Max nodes back to Auto tune.
- **Detailed drawings grow freely.** Gil's Voronoi Studio export, packed too tightly at Auto tune's lengths, grows without the warning at 12,000 nodes. When lines are packed too tightly with Auto tune on, the status now suggests raising Max nodes.
- **A new icon.** White coral inside a mint ring, like the app's own sheet and boundary, grown by Line Growth's engine. There's also an icon for adding the site to an iPhone or iPad home screen.

## 1.0.2 2026-11-08

Fixes from three rounds of QA (functionality, UI/UX, and real use with Gil's files).

- **Lines that start out touching can grow.** In an imported drawing whose lines meet, such as the edges of a Voronoi pattern meeting at its corners, the crossing check held every touching node still, so the lines froze there. Before growth starts, a closed line that touches another is now set in by a quarter of the segment length, and an open line's touching end is drawn back by as much. In Gil's Voronoi Studio export, nodes held back per step fell from 611 to 168. In a honeycomb of separate edges, they fell from all of them to none.
- **The status says when lines have filled the shape.** Below Max nodes, lines stop adding nodes once they fill the boundary at the segment length. The status kept saying "Growing" while nothing grew. It now says "Filled at this segment length, settling", and the Max nodes and Nodes descriptions say a smaller segment length makes room for more.
- **Growth survives a reload.** The design was kept only while paused, so reloading or closing the tab mid-run lost the run (479 steps back to 0 in a test). It's now kept every 5 seconds while lines grow, and whenever the page is hidden or closed.
- **Better advice when lines are packed too tightly.** For a detailed drawing the status suggested a lower Repulsion, which made it worse with Gil's Voronoi export: 281 nodes held per step against 198. It now suggests a smaller segment length, repel radius and step size with a higher Max nodes, which brought it to 14.
- **A cut-off SVG** says it's cut short or damaged, rather than that it has no paths.
- **Measurements fit narrow windows.** A value that doesn't fit beside its label moves to its own line instead of breaking up.
- **A clearer README demo.** Its captions are larger and stay up long enough to read, and the mint boundary keeps its colour in the GIF.

## 1.0.1 2026-11-08

- **Drawn lines never cross other lines.** A line you draw stops where it meets another line, or itself, and the status says why. A clicked circle shrinks to fit between the lines round it, and a click on a line says there's no room. Before, a line drawn across grown lines crossed them.
- **Lines that cross no longer freeze.** The crossing check held back every node of two edges that already crossed, as lines drawn over each other or crossing in an imported drawing do, so those lines stopped moving there for good and the status wrongly said lines were packed too tightly. Now only moves that would make a new crossing are held back. Ordinary growth is unchanged, and so is its speed.
- **The "packed too tightly" warning** names the repel radius only when it's more than 4 segment lengths, and suggests Auto tune only when it's off. Before, it could say a repel radius of 2.6 segment lengths should be kept under 5.
- **A demo** at the top of the README, also as an MP4 video with the release.

## 1.0.0 2026-11-08

First release of Line Growth, rebuilt from Gil's Differential Growth panel for Illustrator as a browser app. The panel's growth rules, Auto tune, multiple growth paths, settling at the node limit, the boundary guide and its controls are all here, and:

- **Runs in the browser.** No Illustrator or install needed. Import an SVG instead of Capture: the largest closed path is the boundary and every other path grows, as before. Export SVG instead of Insert: the page matches the imported artboard, so the result lines up with your artwork.
- **Holes.** Closed paths drawn into the boundary as a compound path are holes the lines keep out of.
- **23× faster per step.** At the panel's 2,600-node cap a step takes 1.25 ms instead of 28 ms, and growth runs off the page, so the view stays smooth. Max nodes now goes to 100,000.
- **Start shapes.** Circle, Line, Circles and Outline, or lines you draw on the sheet, even while they grow. Click to add a small circle; Erase removes a line.
- **Lines never cross.** With a small segment length the panel's rules let lines cross during fast folding. Any move that would cross another line is now held back, so files are safe to plot and cut. Moves that cross nothing are unchanged. When settings are so out of balance that lines can barely move, the status says so.
- **Randomness and seed.** New nodes can be nudged sideways so even shapes break into organic folds; at 0 % growth follows the panel's rules. The same seed always grows the same lines.
- **Real sizes.** Sheets in mm, inches, points or pixels, with presets. SVG, DXF and PNG export at real size, with smooth curves in SVG. Exports hold what the view shows, including the boundary and nodes when they're shown.
- **Changing the segment length no longer restarts the growth.** It applies to the lines as they are; Reset starts again.
- **Turning Auto tune on** tunes straight away and keeps the lines grown so far.
- **Projects.** Save and open `.linegrowth.json` files with every node, and keep growing exactly where you left off. The current design also comes back after a reload.
- **Undo and redo** for every change, including each growth run.
- **Help in the app.** Every control describes itself on hover or keyboard focus, unavailable controls say why, a quick start greets first visits, and **?** lists every shortcut.
- Works at desktop, tablet and phone sizes, in light and dark mode, in the style of Apple's Liquid Glass. On touch screens one finger draws and two fingers pan and zoom.
