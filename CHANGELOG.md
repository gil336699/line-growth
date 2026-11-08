# Line Growth Changelog

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
