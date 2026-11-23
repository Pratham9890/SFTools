// Re-routes one line of the flow chart after one of its blocks moved, live while dragging.
// Pure TypeScript: no imports, no DOM. Works in the 'right' direction; 'down' charts are transposed by the caller.
//
// The layout gave each line a vertical lane in the gap between its blocks (lines of one output share it).
// A moved block keeps that lane while the lane still lies between the two ports, so lines of one output stay on
// one trunk and the chart keeps its shape. When the block passes the lane, the line gets a fresh route: one lane
// just before the target's label, or, when the target now sits behind the source, a loop around both blocks.

export interface RouterPoint
{
	x: number;
	y: number;
}

export interface RouterBox
{
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface LineEnds
{
	source: RouterBox;
	target: RouterBox;
	/** Port offsets from the block's top edge. */
	sourcePortDy: number;
	targetPortDy: number;
}

export interface RouterOptions
{
	/** Room kept clear before the target port for the rate label. */
	labelRoom: number;
	/** Shortest stub out of an output or into an input before a turn. */
	pad: number;
	/** Distance kept from a block when a line loops around it. */
	clearance: number;
	/** Step between candidate lanes when the first choice runs through a block. */
	laneStep: number;
	/** Other blocks the line should not cross (not its own two). */
	obstacles: readonly RouterBox[];
}

/** Inner corners of the re-routed line, from the source end to the target end. */
export function rerouteLine(ends: LineEnds, before: readonly RouterPoint[], sourceMoved: boolean, options: RouterOptions): RouterPoint[]
{
	const start = {x: ends.source.x + ends.source.width, y: ends.source.y + ends.sourcePortDy};
	const end = {x: ends.target.x, y: ends.target.y + ends.targetPortDy};
	const minLane = start.x + options.pad;
	const maxLane = end.x - options.labelRoom;

	const clear = (inner: RouterPoint[]): boolean => !crossesBlock([start, ...inner, end], options.obstacles);

	const kept = keepLane(before, start, end, sourceMoved, minLane, maxLane);
	if (kept !== null && clear(kept)) {
		return kept;
	}
	const lane = (x: number): RouterPoint[] => [{x, y: start.y}, {x, y: end.y}];
	if (maxLane >= minLane) {
		if (Math.abs(start.y - end.y) < 0.5 && clear([])) {
			return [];
		}
		// Just before the target's label, where the layout puts lanes too; further left when a block is in the way.
		for (let x = maxLane; x >= minLane; x -= options.laneStep) {
			if (clear(lane(x))) {
				return lane(x);
			}
		}
	}
	// Blocks close together: a lane in the narrow gap, even if the label then sits on the line.
	const tightMax = end.x - options.pad;
	for (let x = tightMax; x >= minLane; x -= options.laneStep / 2) {
		if (clear(lane(x))) {
			return lane(x);
		}
	}
	return loopAround(ends, start, end, options, clear) ?? kept ?? (maxLane >= minLane ? lane(maxLane) : lane(minLane));
}

/**
 * Target behind (or right against) the source: out to the right, along a channel above, below or between the
 * blocks, and in from the left. The shortest clear choice wins; null when every choice runs through a block.
 */
function loopAround(ends: LineEnds, start: RouterPoint, end: RouterPoint, options: RouterOptions, clear: (inner: RouterPoint[]) => boolean): RouterPoint[] | null
{
	const {source, target} = ends;
	const sourceBottom = source.y + source.height;
	const targetBottom = target.y + target.height;
	const channels: number[] = [];
	if (sourceBottom + 2 * options.clearance <= target.y) {
		channels.push((sourceBottom + target.y) / 2);
	}
	if (targetBottom + 2 * options.clearance <= source.y) {
		channels.push((targetBottom + source.y) / 2);
	}
	const top = Math.min(source.y, target.y) - options.clearance;
	const bottom = Math.max(sourceBottom, targetBottom) + options.clearance;
	for (let k = 0; k < 6; k++) {
		channels.push(bottom + k * options.laneStep, top - k * options.laneStep);
	}
	let best: RouterPoint[] | null = null;
	let bestLength = Infinity;
	for (const channel of channels) {
		for (let k = 0; k < 4; k++) {
			const out = start.x + options.pad + k * options.laneStep;
			const into = end.x - options.labelRoom - k * options.laneStep;
			const route = [{x: out, y: start.y}, {x: out, y: channel}, {x: into, y: channel}, {x: into, y: end.y}];
			const length = Math.abs(channel - start.y) + Math.abs(out - into) + Math.abs(channel - end.y);
			if (length < bestLength && clear(route)) {
				best = route;
				bestLength = length;
			}
		}
	}
	return best;
}

/** Whether any segment of the route runs through one of the blocks. */
function crossesBlock(points: readonly RouterPoint[], obstacles: readonly RouterBox[]): boolean
{
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const x0 = Math.min(a.x, b.x);
		const x1 = Math.max(a.x, b.x);
		const y0 = Math.min(a.y, b.y);
		const y1 = Math.max(a.y, b.y);
		for (const box of obstacles) {
			if (x1 > box.x && x0 < box.x + box.width && y1 > box.y && y0 < box.y + box.height) {
				return true;
			}
		}
	}
	return false;
}

/**
 * The lane next to the moved end, kept with the corner's height moved to the new port. The rest of the route
 * (lanes and channels the layout chose) stays as it was.
 */
function keepLane(before: readonly RouterPoint[], start: RouterPoint, end: RouterPoint, sourceMoved: boolean, minLane: number, maxLane: number): RouterPoint[] | null
{
	if (before.length < 2) {
		return null;
	}
	const points = before.map(point => ({x: point.x, y: point.y}));
	if (sourceMoved) {
		const lane = points[0].x;
		// The first leg must leave the output to the right, and a lone lane must still clear the target's label.
		if (lane < minLane || (points.length === 2 && lane > maxLane) || !isVertical(points[0], points[1])) {
			return null;
		}
		points[0].y = start.y;
		return points;
	}
	const last = points.length - 1;
	const lane = points[last].x;
	if (lane > maxLane || (points.length === 2 && lane < minLane) || !isVertical(points[last - 1], points[last])) {
		return null;
	}
	points[last].y = end.y;
	return points;
}

function isVertical(a: RouterPoint, b: RouterPoint): boolean
{
	return Math.abs(a.x - b.x) < 0.5;
}
