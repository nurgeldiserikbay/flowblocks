# Game Spec — “Vessel Match” (working title)

## 0. Tech stack

- Vite + Vue 3 + TypeScript
- PixiJS v8 for rendering
- GSAP for animations (optional but recommended)
- Pinia for app state (menu/progress/settings)
- Pure game logic must be framework-agnostic (no Pixi/Vue imports in core)
- Target: Web + Capacitor (Android)

## 1. Game overview

A tall vessel filled with colored cubes in a grid. Player can scroll vertically to view the entire vessel. The player swaps adjacent cubes. Matches of 3+ same color in a row/column disappear. Cubes above fall down without changing their moves. Two modes: Level Mode and Endless Mode.

## 2. Board / vessel

- Logic board is a rectangular grid: width W, height H.
- Vessel width equals screen width visually, but to support presets across devices we FIX W (recommended W=10 or W=12).
- TileSize adapts so W tiles fit screen width.
- In Level Mode: H depends on level.
- In Endless Mode: H is fixed (e.g., 40–60 rows).
- Player can scroll cameraY to see higher/lower rows.
- Renderer must virtualize rows: render only visible rows + buffer.

## 3. Tiles (cells)

Each cell has:

- id: number
- color: int in [0..C-1]
- moves: int in [0..20]
  A tile is "locked" when moves==0 (it cannot be the START of a move, but can be swapped with by other tiles).

## 4. Input / Swap rules (VERY IMPORTANT)

A move is directed: player starts from tile A and swaps with adjacent tile B (4-neighborhood).
Rules:

1. If A.moves == 0 => cannot start the move (block input).
2. Otherwise swap is ALWAYS allowed (even if no match results).
3. Move cost depends on target B:
   - if B.moves == 0 => cost = 2
   - else cost = 1
4. If A.moves==1 and cost==2 => move is allowed; after paying cost A.moves becomes 0.
5. COST IS ALWAYS PAID after performing the swap (regardless of match outcome).
6. After swap:
   - if there is a match (>=3) involving either swapped position => resolve matches (with cascades)
   - if no match => board remains as swapped; no removals, no cascades.
7. Swap is limited to one step to adjacent tile only.

## 5. Match detection

- A match is 3+ same color in a contiguous line horizontally or vertically.
- Detect matches efficiently:
  - After a swap, you can check matches only around the two swapped positions, then when cascades happen you can scan affected columns/rows.
- When matches exist:
  - All matched tiles are removed simultaneously (union of all match coordinates).
  - Score is awarded for removed tiles.
  - Combo timer is started/updated.

## 6. Gravity

- After removals, tiles above fall down to fill gaps.
- Moves values do NOT change when a tile falls.
- Gravity is per column compaction.
- Must produce an action list for renderer (tile id, from->to).

## 7. Spawning new tiles

- Endless Mode: after gravity, empty cells at top are filled with new random tiles.
- Level Mode: NO spawn; empty spaces stay empty.
- Spawning should avoid immediate forced 3-in-a-row at spawn when possible:
  - choose a color that does not create a 3-match instantly with neighbors (local constraint).
- New tile moves must be <= 20. Moves distribution can depend on difficulty/level (see balancing).

## 8. Combo timer

- When a removal happens:
  - If current time <= comboEndsAt => combo++ else combo=1
  - comboEndsAt = now + comboWindow(combo)
- comboWindow(combo) decreases as combo increases:
  - Example: base=1.8s, min=0.55s, decay=0.92
  - window = max(min, base \* decay^(combo-1))
- Combo affects score multiplier (simple):
  - multiplier = 1 + 0.25\*(combo-1) or multiplier = 1.15^(combo-1)

## 9. Score

Score is awarded on each removal event:

- depends on number of removed tiles n
- depends on their moves values (reward higher moves)
- depends on combo multiplier
  Recommended formula:
- base = n\*n
- energy = sum(removed.moves)
- scoreAdd = round((base + 0.35*energy) * multiplier)

Finish bonus in Level Mode:

- N0 = initial number of tiles (W\*H)
- Nleft = remaining tiles
- clearRatio = (N0 - Nleft) / N0
- finishBonus = round(K \* (clearRatio^P)), P=4
- perfectBonus = (Nleft==0) ? K2 : 0
- finalScore = score + finishBonus + perfectBonus

Time:

- Track elapsed time as a separate stat (does NOT affect score).

## 10. Game end conditions

- Game ends if there are no possible directed moves.
- A directed move exists if there is any tile A with A.moves>0 and any neighbor B such that swap(A->B) is legal (always) BUT we define "possible moves" as "any legal swap" OR "any swap that can create match"?
  IMPORTANT: For ending, use: "no legal swaps from any A.moves>0" is NEVER true unless all moves==0.
  So end condition should be:
- Game ends when no moves that can create a match exist (otherwise game never ends even if swaps do nothing).
  Therefore define:
- "possible move" = directed swap A->B (A.moves>0) that WOULD create a match after swap.
  Also must respect costs: cost is 1 or 2; if A.moves==1 and cost==2 it's still allowed.
  So possibleMove(A->B) if:
  - A.moves > 0
  - (A.moves >= cost) OR (A.moves==1 && cost==2) // allowed to go to 0
  - swap would create any match
    If none exist => end.

End reasons:

- Level Mode: end when Nleft==0 (cleared) OR no possible moves
- Endless: end when no possible moves

## 11. Difficulty & balancing

Difficulty defines number of colors C:

- Easy: C=4 or 5
- Normal: C=6
- Hard: C=7 or 8
  Moves distribution:
- New tile moves range depends on difficulty and level (max always 20).
  Example:
- Easy: 6..12
- Normal: 4..10
- Hard: 3..8
  Optional: small chance for high moves 15..20.

## 12. Preset levels

For Level Mode, for harder levels use prepared presets:

- Store presets per W, difficulty, level.
- Preset contains two arrays length W\*H:
  - colors (uint8)
  - moves (uint8)
- Serialize as base64 or RLE to keep size small.
- LevelRepo picks a preset randomly among available for that level+difficulty+W.
- If no preset, fallback to runtime generator.

## 13. Project structure (required)

src/
app/ (router, main, global styles)
shared/ (utils, types, constants)
entities/level/ (LevelRepo + presets)
features/game/
core/ # pure logic
types.ts
state.ts (GameState, create initial state)
rules/ (swap, match, gravity, spawn, hasMoves, scoring, combo, finishBonus)
generator/ (generateGrid, validateGrid)
render/ # pixi rendering + animations + camera
PixiGameView.ts
camera.ts
pool.ts
tiles/
animations/
ui/ # Vue UI (HUD, modals)
pages/ # Vue pages (menu flow + game page)

## 14. Implementation plan (Cursor must follow)

Phase 1: Pure core logic

- Implement GameState, grid representation, swap rules (always pay cost), match detection, removal, gravity, spawn, cascades.
- Implement hasAnyPossibleMove() according to end condition (match-creating swaps).
- Write unit tests or a simple node playground to validate core.

Phase 2: Pixi renderer

- Implement PixiGameView with virtualization (visible rows only).
- Render tiles as rounded rectangles with color and moves text.
- Implement input: drag from tile A to neighbor B, call core.applyMove().
- Apply returned action list with animations (swap/remove/fall/spawn).
- Implement camera scroll.

Phase 3: Vue UI

- Pages: Home -> Mode -> Difficulty -> Level -> Game
- HUD: score, combo bar, elapsed time (stat), pause
- GameOver modal: show final score, finish bonuses (Level), tiles left, elapsed time.

Phase 4: Polish

- Add particles on removal, better easing, sound hooks, haptics hooks.
- Optimize pooling and incremental updates.

## 15. Action list contract (core -> renderer)

Core must return a structured list of actions, e.g.:

- swap: {type:'swap', aId, bId, aFrom, aTo, bFrom, bTo, cost, aMovesAfter}
- remove: {type:'remove', ids: number[], positions: Vec2[]}
- fall: {type:'fall', moves: Array<{id, from:Vec2, to:Vec2}>}
- spawn: {type:'spawn', items: Array<{id, to:Vec2, color, moves}>}
- score: {type:'score', add:number, total:number, combo:number}
- combo: {type:'combo', combo:number, endsAt:number}
- end: {type:'end', reason:'cleared'|'no_moves', finalScore:number, stats:{timeMs, leftTiles}}

Renderer plays animations in order:
swap -> remove -> fall -> spawn -> (repeat cascades) -> update HUD.
