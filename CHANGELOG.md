# Line Growth Changelog

## 1.0.0 2026-11-08

First release of Line Growth, rebuilt from Gil's Differential Growth panel for Illustrator as a browser app. The panel's growth rules, Auto tune, multiple growth paths, settling at the node limit, the boundary guide and its controls are all here, and:

- **Runs in the browser.** No Illustrator or install needed. Import an SVG instead of Capture: the largest closed path is the boundary and every other path grows, as before. Export SVG instead of Insert: the page matches the imported artboard, so the result lines up with your artwork.
- **Holes.** Closed paths drawn into the boundary as a compound path are holes the lines keep out of.
- **30× faster per step.** At the panel's 2,600-node cap a step takes 1 ms instead of 29 ms, and growth runs off the page, so the view stays smooth. Max nodes now goes to 100,000.
- **Start shapes.** Circle, Line, Circles and Outline, or lines you draw on the sheet, even while they grow. Click to add a small circle; Erase removes a line.
- **Lines never cross.** With a small segment length the panel's rules let lines cross during fast folding. Any move that would cross another line is now held back, so files are safe to plot and cut. Moves that cross nothing are unchanged.
- **Randomness and seed.** New nodes can be nudged sideways so even shapes break into organic folds; at 0 % growth follows the panel's rules. The same seed always grows the same lines.
- **Real sizes.** Sheets in mm, inches, points or pixels, with presets. SVG, DXF and PNG export at real size, with smooth curves in SVG. Exports hold what the view shows, including the boundary and nodes when they're shown.
- **Changing the segment length no longer restarts the growth.** It applies to the lines as they are; Reset starts again.
- **Turning Auto tune on** tunes straight away and keeps the lines grown so far.
- **Projects.** Save and open `.linegrowth.json` files with every node, and keep growing exactly where you left off. The current design also comes back after a reload.
- **Undo and redo** for every change, including each growth run.
- **Help in the app.** Every control describes itself on hover or keyboard focus, unavailable controls say why, a quick start greets first visits, and **?** lists every shortcut.
- Works at desktop, tablet and phone sizes, in light and dark mode, in the style of Apple's Liquid Glass. On touch screens one finger draws and two fingers pan and zoom.
