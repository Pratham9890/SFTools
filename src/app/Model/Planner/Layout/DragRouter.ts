// Routes the flow chart's lines again while blocks are dragged.
// Pure TypeScript: no imports, no DOM. Works in the 'right' direction; 'down' charts are transposed by the caller.
//
// One router lives for one drag. Every step starts from the lines as they were when the drag began, so routes never
// drift and dragging a block back puts every line back. A line is routed again when one of its blocks moved, or when a
// moved block now sits on it. It keeps its old route while that is clear, then tries a single lane between the two
// blocks, then searches for a path. Routes avoid blocks and rate labels and keep their distance from other lines; lines of
// one output share a trunk exactly or keep their distance too.

export interface DragPoint
{
	x: number;
	y: number;
}

export interface DragBox
{
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface DragLine
{
	id: string;
	/** Lines of one output carrying one item; they may run on top of each other. */
	group: string;
	sourceId: string;
	targetId: string;
	/** Port offsets from the block's top edge. */
	sourcePortDy: number;
	targetPortDy: number;
	/** Inner corners, from the source end to the target end. */
	vertices: readonly DragPoint[];
	/** False for a line the user bent by hand: its bends stay. */
	auto: boolean;
	/** Room kept clear before the target port for the rate label. */
	labelRoom: number;
	/** The rate label on the line's last leg; `gap` from its right edge to the port. */
	label: {width: number; height: number; gap: number};
}

export interface DragRouterOptions
{
	/** Shortest stub out of an output or into an input before a turn. */
	pad: number;
	/** Distance kept from a block a line goes around. */
	clearance: number;
	/** Distance between neighbouring lanes. */
	laneStep: number;
}

interface Segment
{
	line: number;
	group: string;
	vertical: boolean;
	/** x of a vertical segment, y of a horizontal one. */
	c: number;
	lo: number;
	hi: number;
}

interface Ends
{
	start: DragPoint;
	end: DragPoint;
}

interface Region
{
	boxes: DragBox[];
	/** Other lines' rate labels. */
	labels: DragBox[];
	/** Other outputs' lines. */
	segments: Segment[];
	/** Other lines of the same output. */
	siblings: Segment[];
}

/** Everything a line has to keep away from. */
interface Surroundings
{
	boxes: readonly DragBox[];
	labels: readonly LabelBox[];
	segments: readonly Segment[];
}

interface LabelBox extends DragBox
{
	line: number;
}

/** Where the search may run: beside blocks and ports only, or beside every line too (much slower). */
type GridDetail = 'blocks' | 'lines';

/** Parallel lines keep this far apart where there is room. */
const SPACING = 12;
/** Two parallel lines closer than this read as one. */
const TOO_CLOSE = 6;
/** Lines of one output this close count as on the same trunk. */
const SAME_TRUNK = 1;
const OVERLAP_LENGTH = 8;
const BEND_COST = 40;
const CROSSING_COST = 60;
/** Outweighs any detour, so a line only runs over another when nothing else is left. */
const OVERLAP_COST = 20000;
/** Searching time per step while dragging, so the block keeps up with the pointer; lines left over wait for the drop. */
const LIVE_SEARCH_MS = 12;
/** Over 1 the search heads for the goal sooner, for a slightly longer route at most. */
const ESTIMATE_WEIGHT = 1.2;
/** How far around a line's ends the search looks; widened when nothing is found. */
const SEARCH_REACH = [120, 420, 1400];

export class DragRouter
{

	private readonly baseSegments: Segment[] = [];
	private readonly linesByBlock = new Map<string, number[]>();
	private changed = new Set<number>();

	public constructor(
		private readonly boxes: ReadonlyMap<string, DragBox>,
		private readonly lines: readonly DragLine[],
		private readonly options: DragRouterOptions,
	)
	{
		lines.forEach((line, index) => {
			for (const id of new Set([line.sourceId, line.targetId])) {
				const list = this.linesByBlock.get(id);
				if (list) {
					list.push(index);
				} else {
					this.linesByBlock.set(id, [index]);
				}
			}
			const ends = this.endsOf(line, boxes);
			if (ends !== null) {
				this.baseSegments.push(...segmentsOf(index, line.group, [ends.start, ...line.vertices, ends.end]));
			}
		});
	}

	/**
	 * Inner corners of every line this step changed, or put back, by line id. While the pointer is still down (`live`)
	 * the slow searches are left out and time is limited; the drop does the rest.
	 */
	public update(moved: ReadonlyMap<string, DragPoint>, live = false): Map<string, DragPoint[]>
	{
		const boxes = new Map<string, DragBox>(this.boxes);
		const shifts = new Map<string, DragPoint>();
		moved.forEach((to, id) => {
			const box = this.boxes.get(id);
			if (box !== undefined && (Math.abs(to.x - box.x) > 0.01 || Math.abs(to.y - box.y) > 0.01)) {
				boxes.set(id, {...box, x: to.x, y: to.y});
				shifts.set(id, {x: to.x - box.x, y: to.y - box.y});
			}
		});

		const searchUntil = live ? performance.now() + LIVE_SEARCH_MS : Infinity;
		const routes = new Map<number, DragPoint[]>();
		const labels = this.lines.map((line, index) => this.labelOf(line, index, boxes)).filter(label => label !== null);
		const movers = this.findMovers(boxes, shifts, labels);
		const occupied = this.baseSegments.filter(segment => !movers.has(segment.line));
		const around: Surroundings = {boxes: [...boxes.values()], labels, segments: occupied};
		const waiting: {index: number; kept: DragPoint[] | null}[] = [];

		movers.forEach(index => {
			const line = this.lines[index];
			const ends = this.endsOf(line, boxes);
			if (ends === null) {
				return;
			}
			const sourceShift = shifts.get(line.sourceId);
			const targetShift = shifts.get(line.targetId);
			if (!line.auto) {
				const route = this.followBends(line, boxes, ends, sourceShift, targetShift);
				routes.set(index, route);
				occupied.push(...segmentsOf(index, line.group, [ends.start, ...route, ends.end]));
				return;
			}
			// The ends of every line are taken before any of them is routed, so an early route never blocks a later port.
			occupied.push(...segmentsOf(index, line.group, [ends.start, this.leave(ends)]));
			occupied.push(...segmentsOf(index, line.group, [this.arrive(ends, this.options.pad), ends.end]));
			waiting.push({index, kept: this.keepRoute(line, ends, sourceShift, targetShift)});
		});

		const settle = (index: number, route: DragPoint[], ends: Ends): void => {
			routes.set(index, route);
			occupied.push(...segmentsOf(index, this.lines[index].group, [ends.start, ...route, ends.end]));
		};
		const rest = waiting.filter(({index, kept}) => {
			const ends = this.endsOf(this.lines[index], boxes) as Ends;
			if (kept === null) {
				return true;
			}
			const region = regionOf([ends.start, ...kept, ends.end], 40, around, index, this.lines[index].group);
			if (!isClear([ends.start, ...kept, ends.end], region, SPACING)) {
				return true;
			}
			settle(index, kept, ends);
			return false;
		});
		// Short lines first: they have the fewest ways to go.
		rest.map(({index, kept}) => {
			const ends = this.endsOf(this.lines[index], boxes) as Ends;
			return {index, kept, ends, length: Math.abs(ends.end.x - ends.start.x) + Math.abs(ends.end.y - ends.start.y)};
		}).sort((a, b) => a.length - b.length || a.index - b.index).forEach(({index, kept, ends}) => {
			settle(index, this.route(index, ends, kept, around, live, searchUntil), ends);
		});

		const result = new Map<string, DragPoint[]>();
		routes.forEach((route, index) => result.set(this.lines[index].id, route));
		this.changed.forEach(index => {
			if (!routes.has(index)) {
				result.set(this.lines[index].id, this.lines[index].vertices.map(point => ({x: point.x, y: point.y})));
			}
		});
		this.changed = new Set(routes.keys());
		return result;
	}

	private labelOf(line: DragLine, index: number, boxes: ReadonlyMap<string, DragBox>): LabelBox | null
	{
		const ends = this.endsOf(line, boxes);
		return ends === null ? null : {
			line: index,
			x: ends.end.x - line.label.gap - line.label.width,
			y: ends.end.y - line.label.height / 2,
			width: line.label.width,
			height: line.label.height,
		};
	}

	/** Lines of moved blocks, and layout lines a moved block, one of its ports or one of its rate labels now sits on. */
	private findMovers(boxes: ReadonlyMap<string, DragBox>, shifts: ReadonlyMap<string, DragPoint>, labels: readonly LabelBox[]): Set<number>
	{
		const movers = new Set<number>();
		const movedBoxes: DragBox[] = [];
		const stubs: Segment[] = [];
		shifts.forEach((_, id) => {
			movedBoxes.push(boxes.get(id) as DragBox);
			(this.linesByBlock.get(id) ?? []).forEach(index => {
				movers.add(index);
				const line = this.lines[index];
				const ends = this.endsOf(line, boxes);
				if (ends !== null) {
					stubs.push(...segmentsOf(index, line.group, [ends.start, this.leave(ends)]));
					stubs.push(...segmentsOf(index, line.group, [this.arrive(ends, this.options.pad), ends.end]));
				}
			});
		});
		const movedLabels = labels.filter(label => shifts.has(this.lines[label.line].targetId));
		for (const segment of this.baseSegments) {
			if (!movers.has(segment.line) && this.lines[segment.line].auto
				&& (movedBoxes.some(box => hitsBox(segment, box)) || stubs.some(stub => overlaps(segment, stub, SPACING))
					|| movedLabels.some(label => label.line !== segment.line && hitsBox(segment, label)))) {
				movers.add(segment.line);
			}
		}
		return movers;
	}

	private endsOf(line: DragLine, boxes: ReadonlyMap<string, DragBox>): Ends | null
	{
		const source = boxes.get(line.sourceId);
		const target = boxes.get(line.targetId);
		if (source === undefined || target === undefined) {
			return null;
		}
		return {
			start: {x: source.x + source.width, y: source.y + line.sourcePortDy},
			end: {x: target.x, y: target.y + line.targetPortDy},
		};
	}

	private leave(ends: Ends): DragPoint
	{
		return {x: ends.start.x + this.options.pad, y: ends.start.y};
	}

	private arrive(ends: Ends, room: number): DragPoint
	{
		return {x: ends.end.x - room, y: ends.end.y};
	}

	/**
	 * The old route with the corners next to the moved ends brought to the new port height; null when it no longer
	 * leaves to the right and arrives from the left. Both blocks moved by the same amount: the same shape.
	 */
	private keepRoute(line: DragLine, ends: Ends, sourceShift: DragPoint | undefined, targetShift: DragPoint | undefined): DragPoint[] | null
	{
		const together = sourceShift !== undefined && targetShift !== undefined
			&& Math.abs(sourceShift.x - targetShift.x) < 0.01 && Math.abs(sourceShift.y - targetShift.y) < 0.01;
		const points = line.vertices.map(point => together
			? {x: point.x + sourceShift.x, y: point.y + sourceShift.y}
			: {x: point.x, y: point.y});
		if (points.length === 0) {
			return Math.abs(ends.start.y - ends.end.y) < 0.5 && ends.start.x < ends.end.x ? [] : null;
		}
		const last = points.length - 1;
		if (!together && sourceShift !== undefined) {
			if (points.length < 2 || !sameX(points[0], points[1])) {
				return null;
			}
			points[0].y = ends.start.y;
		}
		if (!together && targetShift !== undefined) {
			if (points.length < 2 || !sameX(points[last - 1], points[last])) {
				return null;
			}
			points[last].y = ends.end.y;
		}
		const roomNow = Math.min(line.labelRoom, this.endRoom(line));
		return points[0].x >= ends.start.x + Math.min(this.options.pad, this.startRoom(line)) - 0.5
			&& points[last].x <= ends.end.x - roomNow + 0.5 ? points : null;
	}

	/** How far the line ran straight into its target before the drag. */
	private endRoom(line: DragLine): number
	{
		const target = this.boxes.get(line.targetId) as DragBox;
		return target.x - line.vertices[line.vertices.length - 1].x;
	}

	private startRoom(line: DragLine): number
	{
		const source = this.boxes.get(line.sourceId) as DragBox;
		return line.vertices[0].x - source.x - source.width;
	}

	/** A hand-bent line keeps every bend; a corner is added next to a moved end where its leg was straight before. */
	private followBends(line: DragLine, boxes: ReadonlyMap<string, DragBox>, ends: Ends, sourceShift: DragPoint | undefined, targetShift: DragPoint | undefined): DragPoint[]
	{
		if (sourceShift !== undefined && targetShift !== undefined) {
			return line.vertices.map(point => ({x: point.x + sourceShift.x, y: point.y + sourceShift.y}));
		}
		const points = line.vertices.map(point => ({x: point.x, y: point.y}));
		const before = this.endsOf(line, this.boxes);
		if (points.length === 0 || before === null) {
			return points;
		}
		const first = points[0];
		const last = points[points.length - 1];
		if (sourceShift !== undefined && Math.abs(before.start.y - first.y) < 1) {
			points.unshift({x: first.x, y: ends.start.y});
		}
		if (targetShift !== undefined && Math.abs(before.end.y - last.y) < 1) {
			points.push({x: last.x, y: ends.end.y});
		}
		return points;
	}

	private route(index: number, ends: Ends, kept: DragPoint[] | null, around: Surroundings, live: boolean, searchUntil: number): DragPoint[]
	{
		const line = this.lines[index];
		const lane = this.singleLane(index, ends, around);
		if (lane !== null) {
			return lane;
		}
		if (performance.now() > searchUntil) {
			return kept ?? this.straightAcross(ends);
		}
		const look = (room: number, reach: number, grid: GridDetail, spacing: number, allowOverlap = false): DragPoint[] | null =>
			this.search(index, ends, room, reach, grid, spacing, allowOverlap, around);
		const [near, far, farthest] = SEARCH_REACH;
		const {labelRoom} = line;
		const quick = look(labelRoom, near, 'blocks', SPACING);
		if (quick !== null) {
			return quick;
		}
		if (live) {
			return look(labelRoom, near, 'blocks', TOO_CLOSE)
				?? look(this.options.pad, near, 'blocks', TOO_CLOSE, true)
				?? kept
				?? this.straightAcross(ends);
		}
		return look(labelRoom, far, 'blocks', SPACING)
			?? look(labelRoom, near, 'lines', SPACING)
			?? look(labelRoom, farthest, 'blocks', SPACING)
			?? look(labelRoom, far, 'lines', SPACING)
			// No room for the full distance: closer together, then under the label.
			?? look(labelRoom, near, 'lines', TOO_CLOSE)
			?? look(labelRoom, far, 'blocks', TOO_CLOSE)
			?? look(this.options.pad, far, 'blocks', SPACING)
			?? look(this.options.pad, near, 'lines', TOO_CLOSE)
			?? look(this.options.pad, farthest, 'blocks', TOO_CLOSE)
			// Nothing free in the end: run along another line rather than through a block.
			?? look(this.options.pad, far, 'blocks', TOO_CLOSE, true)
			?? look(this.options.pad, farthest, 'blocks', TOO_CLOSE, true)
			?? kept
			?? this.straightAcross(ends);
	}

	private straightAcross(ends: Ends): DragPoint[]
	{
		const x = ends.start.x + this.options.pad;
		return [{x, y: ends.start.y}, {x, y: ends.end.y}];
	}

	/** Straight, or one lane between the blocks, when the target is in front; the cheapest clear one. */
	private singleLane(index: number, ends: Ends, around: Surroundings): DragPoint[] | null
	{
		const line = this.lines[index];
		const region = regionOf([ends.start, ends.end], 40, around, index, line.group);
		if (Math.abs(ends.start.y - ends.end.y) < 0.5 && ends.start.x < ends.end.x) {
			return isClear([ends.start, ends.end], region, SPACING) ? [] : null;
		}
		let best: DragPoint[] | null = null;
		let bestCost = Infinity;
		const minLane = ends.start.x + this.options.pad;
		const lanes = region.siblings.filter(sibling => sibling.vertical).map(sibling => sibling.c);
		for (let x = ends.end.x - line.labelRoom; x >= minLane; x -= this.options.laneStep) {
			lanes.push(x);
		}
		for (const x of lanes) {
			if (x < minLane || x > ends.end.x - line.labelRoom) {
				continue;
			}
			const route = [{x, y: ends.start.y}, {x, y: ends.end.y}];
			const points = [ends.start, ...route, ends.end];
			// Clear first: it stops at the first block or line in the way, counting crossings never stops early.
			if (!isClear(points, region, SPACING)) {
				continue;
			}
			const cost = crossings(points, region);
			if (cost < bestCost) {
				best = route;
				bestCost = cost;
			}
		}
		return best;
	}

	/** Cheapest right-angled path (A*) over the gaps beside blocks and the lanes beside other lines. */
	private search(index: number, ends: Ends, room: number, reach: number, detail: GridDetail, spacing: number, allowOverlap: boolean, around: Surroundings): DragPoint[] | null
	{
		const line = this.lines[index];
		const from = this.leave(ends);
		const to = this.arrive(ends, room);
		const region = regionOf([from, to], reach, around, index, line.group);
		if (!isBoxFree([ends.start, from], region) || !isBoxFree([to, ends.end], region)
			|| !allowOverlap && !isClear([to, ends.end], region, TOO_CLOSE)) {
			return null;
		}
		const minX = Math.min(from.x, to.x) - reach;
		const maxX = Math.max(from.x, to.x) + reach;
		const minY = Math.min(from.y, to.y) - reach;
		const maxY = Math.max(from.y, to.y) + reach;
		const {clearance, laneStep} = this.options;
		const xs = [from.x, to.x];
		const ys = [from.y, to.y];
		for (let k = 1; k <= 4; k++) {
			xs.push(from.x + k * laneStep, to.x - k * laneStep);
		}
		for (const box of region.boxes) {
			for (let k = 0; k < 4; k++) {
				const gap = clearance + k * laneStep;
				xs.push(box.x - gap, box.x + box.width + gap);
			}
			ys.push(box.y - clearance, box.y + box.height + clearance, box.y - clearance / 2, box.y + box.height + clearance / 2);
		}
		for (const label of region.labels) {
			xs.push(label.x - laneStep);
			ys.push(label.y - clearance / 2, label.y + label.height + clearance / 2);
		}
		if (detail === 'lines') {
			for (const segment of [...region.segments, ...region.siblings]) {
				(segment.vertical ? xs : ys).push(segment.c - spacing - 0.5, segment.c + spacing + 0.5);
			}
		}
		// Exactly on the lines of the same output, so a trunk is shared or left alone.
		const fixedX = [from.x, to.x];
		const fixedY = [from.y, to.y];
		for (const sibling of region.siblings) {
			(sibling.vertical ? fixedX : fixedY).push(sibling.c);
		}
		const gx = axis(xs, fixedX, minX, maxX);
		const gy = axis(ys, fixedY, minY, maxY);
		const w = gx.length;
		const h = gy.length;

		// Cost of each grid step: from (x, y) to the right in `right`, downwards in `down`; -1 where a block is.
		const right = new Float32Array(w * h);
		const down = new Float32Array(w * h);
		for (let x = 0; x + 1 < w; x++) {
			for (let y = 0; y < h; y++) {
				right[y * w + x] = gx[x + 1] - gx[x];
			}
		}
		for (let y = 0; y + 1 < h; y++) {
			down.fill(gy[y + 1] - gy[y], y * w, (y + 1) * w);
		}
		for (const box of region.boxes) {
			markBox(box, gx, gy, right, down, w);
		}
		// Its own label too: the path may not overshoot under it and come back.
		if (room >= line.labelRoom) {
			const own = around.labels.find(label => label.line === index);
			if (own !== undefined) {
				markBox(own, gx, gy, right, down, w);
			}
		}
		for (const label of region.labels) {
			markBox(label, gx, gy, right, down, w, allowOverlap ? OVERLAP_COST : -1);
		}
		for (const segment of region.segments) {
			markSegment(segment, gx, gy, right, down, w, spacing, allowOverlap ? OVERLAP_COST : -1);
			markCrossings(segment, gx, gy, right, down, w);
		}
		for (const sibling of region.siblings) {
			markSegment(sibling, gx, gy, right, down, w, spacing, allowOverlap ? OVERLAP_COST : -1, SAME_TRUNK);
		}
		const path = cheapestPath(gx, gy, right, down, gx.indexOf(from.x), gy.indexOf(from.y), gx.indexOf(to.x), gy.indexOf(to.y));
		return path === null ? null : corners([ends.start, ...path, ends.end]);
	}

}

function sameX(a: DragPoint, b: DragPoint): boolean
{
	return Math.abs(a.x - b.x) < 0.5;
}

function segmentsOf(line: number, group: string, points: readonly DragPoint[]): Segment[]
{
	const result: Segment[] = [];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const dx = Math.abs(a.x - b.x);
		const dy = Math.abs(a.y - b.y);
		if (dx < 1 && dy >= 0.5) {
			result.push({line, group, vertical: true, c: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y)});
		} else if (dy < 1 && dx >= 0.5) {
			result.push({line, group, vertical: false, c: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x)});
		}
	}
	return result;
}

function hitsBox(segment: Segment, box: DragBox): boolean
{
	return segment.vertical
		? segment.c > box.x && segment.c < box.x + box.width && segment.hi > box.y && segment.lo < box.y + box.height
		: segment.c > box.y && segment.c < box.y + box.height && segment.hi > box.x && segment.lo < box.x + box.width;
}

/** Parallel, side by side for a stretch, and closer than the spacing. Lines of one output may lie exactly on each other. */
function overlaps(a: Segment, b: Segment, spacing: number): boolean
{
	if (a.vertical !== b.vertical) {
		return false;
	}
	const gap = Math.abs(a.c - b.c);
	return gap < spacing && (a.group !== b.group || gap > SAME_TRUNK)
		&& Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > OVERLAP_LENGTH;
}

/** The blocks, rate labels and other lines around the points. */
function regionOf(points: readonly DragPoint[], reach: number, around: Surroundings, line: number, group: string): Region
{
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const point of points) {
		minX = Math.min(minX, point.x);
		maxX = Math.max(maxX, point.x);
		minY = Math.min(minY, point.y);
		maxY = Math.max(maxY, point.y);
	}
	minX -= reach;
	maxX += reach;
	minY -= reach;
	maxY += reach;
	const inside = (box: DragBox): boolean => box.x < maxX && box.x + box.width > minX && box.y < maxY && box.y + box.height > minY;
	const region: Region = {boxes: around.boxes.filter(inside), labels: around.labels.filter(label => label.line !== line && inside(label)), segments: [], siblings: []};
	for (const segment of around.segments) {
		if (segment.line !== line && (segment.vertical
			? segment.c > minX && segment.c < maxX && segment.hi > minY && segment.lo < maxY
			: segment.c > minY && segment.c < maxY && segment.hi > minX && segment.lo < maxX)) {
			(segment.group === group ? region.siblings : region.segments).push(segment);
		}
	}
	return region;
}

function isBoxFree(points: readonly DragPoint[], region: Region): boolean
{
	return segmentsOf(-1, '', points).every(segment => region.boxes.every(box => !hitsBox(segment, box)));
}

function isClear(points: readonly DragPoint[], region: Region, spacing: number): boolean
{
	return segmentsOf(-1, '', points).every(segment => region.boxes.every(box => !hitsBox(segment, box))
		&& region.labels.every(label => !hitsBox(segment, label))
		&& region.segments.every(other => !overlaps(segment, other, spacing))
		&& region.siblings.every(other => !overlaps(segment, {...other, group: ''}, spacing)));
}

function crossings(points: readonly DragPoint[], region: Region): number
{
	let count = 0;
	for (const segment of segmentsOf(-1, '', points)) {
		for (const other of region.segments) {
			if (segment.vertical !== other.vertical && other.c > segment.lo && other.c < segment.hi && segment.c > other.lo && segment.c < other.hi) {
				count++;
			}
		}
	}
	return count;
}

/** Sorted grid coordinates inside the range, at least 2 px apart; the required ones stay exact. */
function axis(values: readonly number[], required: readonly number[], min: number, max: number): number[]
{
	const sorted = values.filter(value => value >= min && value <= max).sort((a, b) => a - b);
	const result = [...new Set(required)];
	let previous = -Infinity;
	for (const value of sorted) {
		if (value - previous >= 2 && required.every(fixed => Math.abs(fixed - value) >= 2)) {
			result.push(value);
			previous = value;
		}
	}
	return result.sort((a, b) => a - b);
}

/** First index whose value is greater than the limit. */
function above(values: readonly number[], limit: number): number
{
	let lo = 0;
	let hi = values.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (values[mid] > limit) {
			hi = mid;
		} else {
			lo = mid + 1;
		}
	}
	return lo;
}

function markBox(box: DragBox, gx: readonly number[], gy: readonly number[], right: Float32Array, down: Float32Array, w: number, cost = -1): void
{
	const mark = (steps: Float32Array, at: number): void => {
		if (steps[at] >= 0) {
			steps[at] = cost < 0 ? -1 : steps[at] + cost;
		}
	};
	const x1 = box.x + box.width;
	const y1 = box.y + box.height;
	const firstX = Math.max(0, above(gx, box.x) - 1);
	const firstY = Math.max(0, above(gy, box.y) - 1);
	for (let y = firstY; y < gy.length && gy[y] < y1; y++) {
		for (let x = firstX; x < gx.length && gx[x] < x1; x++) {
			if (gy[y] > box.y && x + 1 < gx.length && gx[x + 1] > box.x) {
				mark(right, y * w + x);
			}
			if (gx[x] > box.x && y + 1 < gy.length && gy[y + 1] > box.y) {
				mark(down, y * w + x);
			}
		}
	}
}

/** Along another line, or too close beside it, costs `overlapCost` (-1: not allowed); within `shared` of it is free. */
function markSegment(segment: Segment, gx: readonly number[], gy: readonly number[], right: Float32Array, down: Float32Array, w: number, spacing: number, overlapCost: number, shared = -1): void
{
	const along = segment.vertical ? gy : gx;
	const across = segment.vertical ? gx : gy;
	const cost = segment.vertical ? down : right;
	const first = Math.max(0, above(along, segment.lo) - 1);
	for (let c = above(across, segment.c - spacing); c < across.length && across[c] < segment.c + spacing; c++) {
		if (Math.abs(across[c] - segment.c) <= shared) {
			continue;
		}
		for (let a = first; a + 1 < along.length && along[a] < segment.hi; a++) {
			const at = segment.vertical ? a * w + c : c * w + a;
			if (along[a + 1] > segment.lo && cost[at] >= 0) {
				cost[at] = overlapCost < 0 ? -1 : cost[at] + overlapCost;
			}
		}
	}
}

function markCrossings(segment: Segment, gx: readonly number[], gy: readonly number[], right: Float32Array, down: Float32Array, w: number): void
{
	const along = segment.vertical ? gy : gx;
	const across = segment.vertical ? gx : gy;
	const cost = segment.vertical ? right : down;
	const c = above(across, segment.c) - 1;
	if (c >= 0 && c + 1 < across.length) {
		for (let a = above(along, segment.lo); a < along.length && along[a] < segment.hi; a++) {
			const at = segment.vertical ? a * w + c : c * w + a;
			if (cost[at] >= 0) {
				cost[at] += CROSSING_COST;
			}
		}
	}
}

/** A* with a price on bends. Leaves the start to the right or sideways and reaches the goal from the left or sideways. */
function cheapestPath(gx: readonly number[], gy: readonly number[], right: Float32Array, down: Float32Array, sx: number, sy: number, tx: number, ty: number): DragPoint[] | null
{
	const w = gx.length;
	const h = gy.length;
	const size = w * h;
	// Two states per grid point: reached sideways (0) or up/down (1).
	const cost = new Float32Array(size * 2).fill(Infinity);
	const parent = new Int32Array(size * 2).fill(-1);
	const heap = new Heap();
	const estimate = (x: number, y: number): number => (Math.abs(gx[x] - gx[tx]) + Math.abs(gy[y] - gy[ty])) * ESTIMATE_WEIGHT;
	const start = (sy * w + sx) * 2;
	const goal = ty * w + tx;
	cost[start] = 0;
	heap.push(start, estimate(sx, sy));
	for (let state = heap.pop(); state >= 0; state = heap.pop()) {
		const at = state >> 1;
		const vertical = state & 1;
		const x = at % w;
		const y = (at - x) / w;
		if (at === goal) {
			const path: DragPoint[] = [];
			for (let s = state; s >= 0; s = parent[s]) {
				const p = s >> 1;
				path.push({x: gx[p % w], y: gy[(p - p % w) / w]});
			}
			return path.reverse();
		}
		const step = (nx: number, ny: number, price: number, side: number): void => {
			if (price < 0) {
				return;
			}
			const next = (ny * w + nx) * 2 + side;
			const total = cost[state] + price + (side === vertical ? 0 : BEND_COST);
			if (total < cost[next] - 0.001) {
				cost[next] = total;
				parent[next] = state;
				heap.push(next, total + estimate(nx, ny));
			}
		};
		if (x + 1 < w) {
			step(x + 1, y, right[at], 0);
		}
		// Straight back over the port's own stub is no way out, and no way in either.
		if (x > 0 && state !== start && !(y === ty && x - 1 === tx)) {
			step(x - 1, y, right[at - 1], 0);
		}
		if (y + 1 < h) {
			step(x, y + 1, down[at], 1);
		}
		if (y > 0) {
			step(x, y - 1, down[at - w], 1);
		}
	}
	return null;
}

/** Binary heap of path states by cost. */
class Heap
{

	private readonly states: number[] = [];
	private readonly costs: number[] = [];

	public push(state: number, cost: number): void
	{
		let i = this.states.length;
		this.states.push(state);
		this.costs.push(cost);
		while (i > 0) {
			const up = (i - 1) >> 1;
			if (this.costs[up] <= cost) {
				break;
			}
			this.states[i] = this.states[up];
			this.costs[i] = this.costs[up];
			i = up;
		}
		this.states[i] = state;
		this.costs[i] = cost;
	}

	/** The cheapest state, or -1 when empty. */
	public pop(): number
	{
		if (this.states.length === 0) {
			return -1;
		}
		const top = this.states[0];
		const state = this.states.pop() as number;
		const cost = this.costs.pop() as number;
		const n = this.states.length;
		if (n > 0) {
			let i = 0;
			for (;;) {
				let child = 2 * i + 1;
				if (child >= n) {
					break;
				}
				if (child + 1 < n && this.costs[child + 1] < this.costs[child]) {
					child++;
				}
				if (this.costs[child] >= cost) {
					break;
				}
				this.states[i] = this.states[child];
				this.costs[i] = this.costs[child];
				i = child;
			}
			this.states[i] = state;
			this.costs[i] = cost;
		}
		return top;
	}

}

/** The inner points where the path really turns. */
function corners(points: readonly DragPoint[]): DragPoint[]
{
	const result: DragPoint[] = [];
	for (let i = 1; i + 1 < points.length; i++) {
		const a = result[result.length - 1] ?? points[0];
		const b = points[i];
		const c = points[i + 1];
		const straight = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01 || Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01;
		if (!straight) {
			result.push(b);
		}
	}
	return result;
}
