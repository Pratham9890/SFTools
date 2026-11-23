// Port of the approved mock-up's flow-chart layout (ui-mockups/app.js, layout()).
// Pure TypeScript: no imports, no DOM, no randomness, no clock.
//
// Coordinates are the top-left corner of each block. Every edge route starts on
// the source's right edge and ends on the target's left edge (bottom/top for the
// 'down' direction). Lines are orthogonal, share one vertical lane per source
// output, and never pass through a block.

export type FlowNodeKind = 'source' | 'product' | 'normal';

export interface FlowLayoutNode {
	id: string;
	kind: FlowNodeKind;
	width: number;
	minHeight: number;
	orderHint: number;
}

export interface FlowLayoutEdge {
	id: string;
	sourceId: string;
	targetId: string;
	itemKey: string;
	labelWidth: number;
	/** Not what its block is there to make; loops are closed over these first. */
	byproduct?: boolean;
	amount?: number;
}

export interface FlowLayoutOptions {
	grid: boolean;
	direction: 'right' | 'down';
	portGap: number;
	laneGap: number;
	nodeGap: number;
	minGapWidth: number;
}

export interface FlowPoint {
	x: number;
	y: number;
}

export interface FlowNodePlacement {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface FlowEdgeRoute {
	points: FlowPoint[];
	label: FlowPoint | null;
}

export interface FlowJunction {
	x: number;
	y: number;
	itemKey: string;
}

export interface FlowLayoutResult {
	nodes: Map<string, FlowNodePlacement>;
	edges: Map<string, FlowEdgeRoute>;
	junctions: FlowJunction[];
	width: number;
	height: number;
}

interface WorkPort {
	itemKey: string;
	dy: number;
}

interface WorkNode {
	id: string;
	kind: FlowNodeKind;
	width: number;
	minHeight: number;
	orderHint: number;
	index: number;
	x: number;
	y: number;
	height: number;
	layer: number;
	ins: WorkEdge[];
	outs: WorkEdge[];
	outPorts: WorkPort[];
}

interface WorkEdge {
	id: string;
	sourceId: string;
	targetId: string;
	itemKey: string;
	labelWidth: number;
	byproduct: boolean;
	amount: number;
	index: number;
	source: WorkNode;
	target: WorkNode;
	outPort: WorkPort;
	inDy: number;
	segs: WorkSeg[];
	/** Lines that go back: the lane out of the block and the lane into the target. */
	exit: LaneGroup | null;
	entry: LaneGroup | null;
}

interface WorkItem {
	kind: 'node' | 'dummy';
	id: string;
	layer: number;
	order: number;
	h: number;
	y: number;
	pos: number;
	bc: number;
	node: WorkNode | null;
	itemKey: string | null;
}

interface WorkSeg {
	a: WorkItem;
	b: WorkItem;
	itemKey: string;
	edges: WorkEdge[];
	y0: number;
	y1: number;
	laneX: number | null;
}

interface LaneGroup {
	segs: WorkSeg[];
	itemKey: string;
	y0: number;
	rawTargets: number[];
	sortedTargets: number[];
	min: number;
	max: number;
	bends: boolean;
	/** The lane also runs to a row below the chart. Its lane in from such a row has y0 = Infinity. */
	down: boolean;
	laneX: number | null;
}

interface GapInfo {
	groups: LaneGroup[];
	tracks: LaneGroup[];
	labelCol: number;
	width: number;
}

const GEOM_EPS = 0.011;
const SIDE_PAD = 26;
const END_PAD = 16;
const LABEL_ROOM = 22;
// The distance DragRouter keeps between lines too.
const ROW_CLEAR = 12;
// Outweighs any crossing count, so the same-row rule always wins.
const ROW_PENALTY = 1000;

export function layoutFlow(nodes: readonly FlowLayoutNode[], edges: readonly FlowLayoutEdge[], options: FlowLayoutOptions): FlowLayoutResult {
	if (options.direction === 'down') {
		// Same algorithm as 'right' with width and height swapped, then transpose.
		const swapped: FlowLayoutNode[] = nodes.map(n => ({id: n.id, kind: n.kind, width: n.minHeight, minHeight: n.width, orderHint: n.orderHint}));
		return transposeResult(layoutRight(swapped, edges, options));
	}
	return layoutRight(nodes, edges, options);
}

function transposeResult(r: FlowLayoutResult): FlowLayoutResult {
	const nodes = new Map<string, FlowNodePlacement>();
	for (const [id, p] of r.nodes) nodes.set(id, {x: p.y, y: p.x, width: p.height, height: p.width});
	const edges = new Map<string, FlowEdgeRoute>();
	for (const [id, g] of r.edges) {
		edges.set(id, {
			points: g.points.map(p => ({x: p.y, y: p.x})),
			label: g.label ? {x: g.label.y, y: g.label.x} : null,
		});
	}
	const junctions = r.junctions.map(j => ({x: j.y, y: j.x, itemKey: j.itemKey}));
	return {nodes, edges, junctions, width: r.height, height: r.width};
}

function cleanPoints(pts: readonly FlowPoint[]): FlowPoint[] {
	const out: FlowPoint[] = [];
	for (const p of pts) {
		if (!out.length) {
			out.push({x: p.x, y: p.y});
			continue;
		}
		const last = out[out.length - 1];
		if (Math.abs(last.x - p.x) < GEOM_EPS && Math.abs(last.y - p.y) < GEOM_EPS) continue;
		out.push({x: p.x, y: p.y});
	}
	for (let i = 1; i + 1 < out.length;) {
		const a = out[i - 1];
		const b = out[i];
		const c = out[i + 1];
		const vertical = Math.abs(a.x - b.x) < GEOM_EPS && Math.abs(b.x - c.x) < GEOM_EPS;
		const horizontal = Math.abs(a.y - b.y) < GEOM_EPS && Math.abs(b.y - c.y) < GEOM_EPS;
		if (vertical || horizontal) out.splice(i, 1);
		else i++;
	}
	return out;
}

// Number of pairs (a in as, b in bs) with a > b.
function pairsGreater(as: readonly number[], bs: readonly number[]): number {
	if (!as.length || !bs.length) return 0;
	const sorted = bs.slice().sort((x, y) => x - y);
	let total = 0;
	for (const v of as) {
		let lo = 0;
		let hi = sorted.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (sorted[mid] < v) lo = mid + 1;
			else hi = mid;
		}
		total += lo;
	}
	return total;
}

// The lines that have to go back so the rest has no loops. Lines carrying what
// a block is there to make keep running forward, larger ones first.
function loopClosers(nodes: readonly WorkNode[], edges: readonly WorkEdge[]): Set<WorkEdge> {
	const back = new Set<WorkEdge>();
	const core = new Set(nodes.filter(n => n.kind !== 'source'));
	// Blocks that nothing in the core feeds, or that feed nothing in it, are in no loop.
	const counts = (next: 'ins' | 'outs'): Map<WorkNode, number> => new Map([...core].map(n => [n, n[next].length]));
	for (const [from, to] of [['ins', 'outs'], ['outs', 'ins']] as const) {
		const left = counts(from);
		for (const n of core) {
			for (const e of n[from]) {
				const other = from === 'ins' ? e.source : e.target;
				if (!core.has(other)) left.set(n, (left.get(n) as number) - 1);
			}
		}
		const queue = [...core].filter(n => left.get(n) === 0);
		for (let i = 0; i < queue.length; i++) {
			core.delete(queue[i]);
			for (const e of queue[i][to]) {
				const other = to === 'outs' ? e.target : e.source;
				if (!core.has(other)) continue;
				const d = (left.get(other) as number) - 1;
				left.set(other, d);
				if (d === 0) queue.push(other);
			}
		}
	}
	const kept = new Map<WorkNode, WorkNode[]>();
	for (const n of core) kept.set(n, []);
	const reaches = (from: WorkNode, goal: WorkNode): boolean => {
		const seen = new Set([from]);
		const stack = [from];
		while (stack.length) {
			const n = stack.pop() as WorkNode;
			if (n === goal) return true;
			for (const t of kept.get(n) as WorkNode[]) {
				if (!seen.has(t)) {
					seen.add(t);
					stack.push(t);
				}
			}
		}
		return false;
	};
	const inCore = edges.filter(e => core.has(e.source) && core.has(e.target));
	inCore.sort((a, b) => Number(a.byproduct) - Number(b.byproduct) || b.amount - a.amount || a.index - b.index);
	for (const e of inCore) {
		if (reaches(e.target, e.source)) back.add(e);
		else (kept.get(e.source) as WorkNode[]).push(e.target);
	}
	return back;
}

function layoutRight(nodes: readonly FlowLayoutNode[], edges: readonly FlowLayoutEdge[], options: FlowLayoutOptions): FlowLayoutResult {
	const portGap = Number.isFinite(options.portGap) && options.portGap > 0 ? options.portGap : 1;
	const laneGap = Number.isFinite(options.laneGap) && options.laneGap > 0 ? options.laneGap : 1;
	const nodeGap = Number.isFinite(options.nodeGap) && options.nodeGap > 0 ? options.nodeGap : 0;
	const minGapWidth = Number.isFinite(options.minGapWidth) ? Math.max(0, options.minGapWidth) : 80;
	const grid = options.grid;
	const GRID_LANES = 3;
	const DUMMY_GAP = 18;

	// ---------- model ----------
	const workNodes: WorkNode[] = [];
	const byId = new Map<string, WorkNode>();
	for (const n of nodes) {
		if (byId.has(n.id)) continue;
		const w: WorkNode = {
			id: n.id, kind: n.kind, width: Number.isFinite(n.width) ? n.width : 0,
			minHeight: Number.isFinite(n.minHeight) ? n.minHeight : 0, orderHint: Number.isFinite(n.orderHint) ? n.orderHint : 0,
			index: workNodes.length, x: 0, y: 0, height: 0, layer: 0, ins: [], outs: [], outPorts: [],
		};
		workNodes.push(w);
		byId.set(w.id, w);
	}
	if (!workNodes.length) return {nodes: new Map(), edges: new Map(), junctions: [], width: 0, height: 0};

	const workEdges: WorkEdge[] = [];
	for (const e of edges) {
		const s = byId.get(e.sourceId);
		const t = byId.get(e.targetId);
		if (!s || !t) continue;
		let port: WorkPort | undefined;
		for (const p of s.outPorts) {
			if (p.itemKey === e.itemKey) {
				port = p;
				break;
			}
		}
		if (!port) {
			port = {itemKey: e.itemKey, dy: 0};
			s.outPorts.push(port);
		}
		const w: WorkEdge = {
			id: e.id, sourceId: e.sourceId, targetId: e.targetId, itemKey: e.itemKey,
			labelWidth: Number.isFinite(e.labelWidth) ? Math.max(0, e.labelWidth) : 0,
			byproduct: e.byproduct === true, amount: Number.isFinite(e.amount) ? e.amount as number : 0,
			index: workEdges.length, source: s, target: t, outPort: port, inDy: 0, segs: [], exit: null, entry: null,
		};
		s.outs.push(w);
		t.ins.push(w);
		workEdges.push(w);
	}

	const resize = (n: WorkNode, fixedH?: number): void => {
		const k = Math.max(n.ins.length, n.outPorts.length, 1);
		n.height = fixedH === undefined ? Math.max(n.minHeight, k * portGap + 18) : fixedH;
		for (let i = 0; i < n.ins.length; i++) n.ins[i].inDy = n.height / 2 + (i - (n.ins.length - 1) / 2) * portGap;
		for (let i = 0; i < n.outPorts.length; i++) n.outPorts[i].dy = n.height / 2 + (i - (n.outPorts.length - 1) / 2) * portGap;
	};
	for (const n of workNodes) resize(n);

	// ---------- columns ----------
	// Longest path over non-source predecessors, with the lines that close a loop
	// left out; sources go one column before their first user.
	const goesBack = loopClosers(workNodes, workEdges);
	const nonSources = workNodes.filter(n => n.kind !== 'source');
	const indeg = new Map<WorkNode, number>();
	const succ = new Map<WorkNode, WorkNode[]>();
	for (const n of nonSources) {
		indeg.set(n, 0);
		succ.set(n, []);
		n.layer = 1;
	}
	for (const n of nonSources) {
		const list = succ.get(n) as WorkNode[];
		for (const e of n.outs) {
			const t = e.target;
			if (t.kind === 'source' || goesBack.has(e)) continue;
			list.push(t);
			indeg.set(t, (indeg.get(t) as number) + 1);
		}
	}
	let maxL = 0;
	if (nonSources.length) {
		const queue: WorkNode[] = [];
		for (const n of nonSources) if (indeg.get(n) === 0) queue.push(n);
		for (let qi = 0; qi < queue.length; qi++) {
			const u = queue[qi];
			for (const t of succ.get(u) as WorkNode[]) {
				if (t.layer < u.layer + 1) t.layer = u.layer + 1;
				const d = (indeg.get(t) as number) - 1;
				indeg.set(t, d);
				if (d === 0) queue.push(t);
			}
		}
		for (const n of nonSources) if (n.layer > maxL) maxL = n.layer;
	}
	// What leaves the factory closes the chart: products, byproducts, sinks and generators.
	for (const n of workNodes) {
		if (n.kind !== 'source' && !n.outs.length && (n.ins.length || n.kind === 'product')) n.layer = maxL;
	}
	for (const n of workNodes) {
		if (n.kind !== 'source') continue;
		let first = Infinity;
		for (const e of n.outs) if (e.target.layer < first) first = e.target.layer;
		n.layer = Number.isFinite(first) ? Math.max(0, first - 1) : 0;
	}
	let maxCol = 0;
	for (const n of workNodes) if (n.layer > maxCol) maxCol = n.layer;

	// ---------- lane items and shared segments ----------
	const layers: WorkItem[][] = [];
	for (let l = 0; l <= maxCol; l++) layers.push([]);
	const nodeItems = new Map<string, WorkItem>();
	for (const n of workNodes) {
		const it: WorkItem = {
			kind: 'node', id: n.id, layer: n.layer, order: n.orderHint,
			h: n.height, y: 0, pos: 0, bc: 0, node: n, itemKey: null,
		};
		nodeItems.set(n.id, it);
		layers[n.layer].push(it);
	}
	const dummyByKey = new Map<string, WorkItem>();
	const segsByKey = new Map<string, WorkSeg>();
	const segList: WorkSeg[] = [];
	const segsByLayer: WorkSeg[][] = [];
	for (let l = 0; l <= maxCol; l++) segsByLayer.push([]);

	const addSeg = (a: WorkItem, b: WorkItem, e: WorkEdge): WorkSeg => {
		const key = `${a.id}>${b.id}>${e.itemKey}>${b.kind === 'node' ? e.index : ''}`;
		let seg = segsByKey.get(key);
		if (!seg) {
			seg = {a, b, itemKey: e.itemKey, edges: [], y0: 0, y1: 0, laneX: null};
			segsByKey.set(key, seg);
			segList.push(seg);
			segsByLayer[a.layer].push(seg);
		}
		seg.edges.push(e);
		return seg;
	};

	for (const e of workEdges) {
		const s = e.source;
		const t = e.target;
		e.segs = [];
		if (t.layer <= s.layer || goesBack.has(e)) {
			goesBack.add(e);
			continue;
		}
		let prev = nodeItems.get(s.id) as WorkItem;
		for (let l = s.layer + 1; l < t.layer; l++) {
			const key = `d|${s.id}|${e.itemKey}|${l}`;
			let d = dummyByKey.get(key);
			if (!d) {
				d = {kind: 'dummy', id: key, layer: l, order: s.orderHint, h: 4, y: 0, pos: 0, bc: 0, node: null, itemKey: e.itemKey};
				dummyByKey.set(key, d);
				layers[l].push(d);
			}
			e.segs.push(addSeg(prev, d, e));
			prev = d;
		}
		e.segs.push(addSeg(prev, nodeItems.get(t.id) as WorkItem, e));
	}

	const leftOf = new Map<WorkItem, WorkSeg[]>();
	const rightOf = new Map<WorkItem, WorkSeg[]>();
	for (const seg of segList) {
		let l = leftOf.get(seg.b);
		if (!l) {
			l = [];
			leftOf.set(seg.b, l);
		}
		l.push(seg);
		let r = rightOf.get(seg.a);
		if (!r) {
			r = [];
			rightOf.set(seg.a, r);
		}
		r.push(seg);
	}

	// Lines that go back run below the chart, so their outputs sit under the others.
	for (const n of workNodes) {
		const ahead = new Set<WorkPort>();
		for (const e of n.outs) if (!goesBack.has(e)) ahead.add(e.outPort);
		n.outPorts = [...n.outPorts.filter(p => ahead.has(p)), ...n.outPorts.filter(p => !ahead.has(p))];
		resize(n);
	}

	// Initial order per column, then barycentre sweeps.
	for (const ly of layers) {
		ly.sort((a, b) => a.order - b.order);
		ly.forEach((it, i) => {
			it.pos = i;
		});
	}
	for (let iter = 0; iter < 16; iter++) {
		const down = iter % 2 === 0;
		const order = down ? layers.slice(1) : layers.slice(0, -1).reverse();
		for (const ly of order) {
			for (const it of ly) {
				const nb = down ? (leftOf.get(it) || []).map(s => s.a) : (rightOf.get(it) || []).map(s => s.b);
				it.bc = nb.length ? nb.reduce((sum, x) => sum + x.pos, 0) / nb.length : it.pos;
			}
			ly.sort((a, b) => a.bc - b.bc);
			ly.forEach((it, i) => it.pos = i);
		}
	}

	// Fewer crossings: swap neighbouring blocks while that lowers the crossing
	// count. Only the swapped pair's order changes, so the delta is computed
	// from the two items' own segments instead of rescanning the gap.
	const swapForCrossings = (x: WorkItem, y: WorkItem): boolean => {
		const xTargets = (rightOf.get(x) || []).map(s => s.b.pos);
		const yTargets = (rightOf.get(y) || []).map(s => s.b.pos);
		const xSources = (leftOf.get(x) || []).map(s => s.a.pos);
		const ySources = (leftOf.get(y) || []).map(s => s.a.pos);
		const before = pairsGreater(xTargets, yTargets) + pairsGreater(xSources, ySources);
		const after = pairsGreater(yTargets, xTargets) + pairsGreater(ySources, xSources);
		return after < before;
	};
	for (let round = 0; round < 8; round++) {
		let improved = false;
		for (const ly of layers) {
			for (let i = 0; i + 1 < ly.length; i++) {
				const x = ly[i];
				const y = ly[i + 1];
				if (!swapForCrossings(x, y)) continue;
				ly[i] = y;
				ly[i + 1] = x;
				x.pos = i + 1;
				y.pos = i;
				improved = true;
			}
		}
		if (!improved) break;
	}

	// Input ports follow the order of what feeds them.
	for (const n of workNodes) {
		n.ins.sort((a, b) => {
			const pa = a.segs.length ? a.segs[a.segs.length - 1].a.pos : Number.MAX_SAFE_INTEGER;
			const pb = b.segs.length ? b.segs[b.segs.length - 1].a.pos : Number.MAX_SAFE_INTEGER;
			return pa - pb || a.index - b.index;
		});
		resize(n);
	}

	// ---------- vertical placement ----------
	const gapAfter = (it: WorkItem): number => it.kind === 'node' ? nodeGap : DUMMY_GAP;
	for (const ly of layers) {
		let total = 0;
		for (const it of ly) {
			it.y = total;
			total += it.h + gapAfter(it);
		}
		for (const it of ly) it.y -= total / 2;
	}
	const place = (ly: WorkItem[], wish: readonly number[]): void => {
		let cum = 0;
		const off: number[] = [];
		for (const it of ly) {
			off.push(cum);
			cum += it.h + gapAfter(it);
		}
		const blocks: {sum: number; n: number; start: number}[] = [];
		ly.forEach((_, i) => {
			blocks.push({sum: wish[i] - off[i], n: 1, start: i});
			while (blocks.length > 1) {
				const b = blocks[blocks.length - 1];
				const a = blocks[blocks.length - 2];
				if (a.sum / a.n <= b.sum / b.n) break;
				a.sum += b.sum;
				a.n += b.n;
				blocks.pop();
			}
		});
		blocks.forEach((b, bi) => {
			const end = bi + 1 < blocks.length ? blocks[bi + 1].start : ly.length;
			for (let i = b.start; i < end; i++) {
				const it = ly[i];
				it.y = b.sum / b.n + off[i];
				if (it.node) it.node.y = it.y;
			}
		});
	};
	const wishFor = (it: WorkItem, side: 'L' | 'R'): number | null => {
		const ss = (side === 'L' ? leftOf : rightOf).get(it) || [];
		if (!ss.length) return null;
		let sum = 0;
		for (const s of ss) {
			const e = s.edges[0];
			const srcY = s.a.kind === 'node' ? s.a.y + e.outPort.dy : s.a.y + s.a.h / 2;
			const tgtY = s.b.kind === 'node' ? s.b.y + e.inDy : s.b.y + s.b.h / 2;
			if (side === 'L') sum += srcY - (tgtY - s.b.y);
			else sum += tgtY - (srcY - s.a.y);
		}
		return sum / ss.length;
	};
	for (let iter = 0; iter < 20; iter++) {
		const mode = iter < 4 ? (iter % 2 ? 'R' : 'L') : (iter % 2 ? 'R' : 'B');
		const order = mode === 'R' ? layers.slice().reverse() : layers;
		for (const ly of order) {
			const wish = ly.map(it => {
				const a = mode !== 'R' ? wishFor(it, 'L') : null;
				const b = mode !== 'L' ? wishFor(it, 'R') : null;
				return a !== null && b !== null ? (a + b) / 2 : (a !== null ? a : (b !== null ? b : it.y));
			});
			place(ly, wish);
		}
	}
	for (const ly of layers) {
		for (const it of ly) {
			if (it.kind === 'dummy') it.h = 4;
			if (it.node) it.node.y = it.y;
		}
	}

	// ---------- Grid: equal rows, lanes and ports on one line grid ----------
	if (grid) {
		let most = 1;
		let maxMin = 0;
		for (const n of workNodes) {
			most = Math.max(most, n.ins.length, n.outPorts.length);
			maxMin = Math.max(maxMin, n.minHeight);
		}
		const steps = Math.max(1, Math.ceil(Math.max(maxMin, most * portGap) / portGap));
		const blockH = steps * portGap;
		const mid = Math.floor((steps - 1) / 2);
		for (const n of workNodes) {
			resize(n, blockH);
			for (let i = 0; i < n.outPorts.length; i++) {
				n.outPorts[i].dy = portGap / 2 + (mid - Math.floor((n.outPorts.length - 1) / 2) + i) * portGap;
			}
		}
		const rowH = blockH + GRID_LANES * portGap;
		for (const ly of layers) {
			let prev = -Infinity;
			for (const it of ly) {
				if (it.kind !== 'node') continue;
				const row = Math.max(Math.round((it.y + it.h / 2) / rowH), prev + 1);
				prev = row;
				it.h = blockH;
				it.y = row * rowH - blockH / 2;
				if (it.node) it.node.y = it.y;
			}
			// Belts that skip a column run in fixed lanes between rows.
			const used = new Map<number, number>();
			for (const it of ly) {
				if (it.kind !== 'dummy') continue;
				let c = Math.round((it.y - rowH / 2) / rowH);
				for (let tries = 0; (used.get(c) || 0) >= GRID_LANES && tries < 6; tries++) {
					c += tries % 2 ? -tries : tries;
				}
				const k = used.get(c) || 0;
				used.set(c, k + 1);
				it.h = 0;
				it.y = c * rowH + blockH / 2 + portGap / 2 + Math.min(k, GRID_LANES - 1) * portGap;
			}
		}
		// Each input takes the free slot closest to where its line comes from.
		for (const n of workNodes) {
			if (!n.ins.length) continue;
			const it = nodeItems.get(n.id) as WorkItem;
			const src = n.ins.map(e => {
				let y: number;
				if (e.segs.length) {
					const sg = e.segs[e.segs.length - 1];
					y = sg.a.kind === 'node' ? sg.a.y + e.outPort.dy : sg.a.y + sg.a.h / 2;
				} else {
					// Comes up from below the chart.
					y = Number.MAX_SAFE_INTEGER;
				}
				return {e, y};
			}).sort((a, b) => a.y - b.y || a.e.index - b.e.index);
			const want = src.map(x => Math.round((x.y - it.y - portGap / 2) / portGap));
			const slot: number[] = [];
			want.forEach((w, i) => {
				const lowest = i ? slot[i - 1] + 1 : 0;
				slot.push(Math.min(Math.max(w, lowest), steps - src.length + i));
			});
			for (let i = src.length - 2; i >= 0; i--) slot[i] = Math.min(slot[i], slot[i + 1] - 1);
			src.forEach((x, i) => x.e.inDy = portGap / 2 + slot[i] * portGap);
			n.ins = src.map(x => x.e);
		}
	}

	// ---------- routing: one lane per output, split there ----------
	const exitsByGap = new Map<number, WorkEdge[]>();
	const entriesByGap = new Map<number, WorkEdge[]>();
	for (const e of goesBack) {
		for (const [map, l] of [[exitsByGap, e.source.layer], [entriesByGap, e.target.layer - 1]] as const) {
			const list = map.get(l);
			if (list) list.push(e);
			else map.set(l, [e]);
		}
	}
	const planGap = (l: number): GapInfo => {
		const ss = l >= 0 && l < maxCol ? segsByLayer[l] : [];
		let labelCol = 0;
		const groups = new Map<string, LaneGroup>();
		for (const s of ss) {
			const e = s.edges[0];
			s.y0 = s.a.kind === 'node' ? s.a.y + e.outPort.dy : s.a.y + s.a.h / 2;
			s.y1 = s.b.kind === 'node' ? s.b.y + e.inDy : s.b.y + s.b.h / 2;
			if (s.b.kind === 'node') labelCol = Math.max(labelCol, e.labelWidth);
			const key = `${s.a.id}|${Math.round(s.y0)}`;
			let g = groups.get(key);
			if (!g) {
				g = {segs: [], itemKey: s.itemKey, y0: s.y0, rawTargets: [], sortedTargets: [], min: s.y0, max: s.y0, bends: false, down: false, laneX: null};
				groups.set(key, g);
			}
			g.segs.push(s);
			g.rawTargets.push(s.y1);
			g.min = Math.min(g.min, s.y1);
			g.max = Math.max(g.max, s.y1);
			if (Math.abs(s.y1 - s.y0) >= 1) g.bends = true;
		}
		for (const e of exitsByGap.get(l) || []) {
			const y0 = e.source.y + e.outPort.dy;
			const key = `${e.source.id}|${Math.round(y0)}`;
			let g = groups.get(key);
			if (!g) {
				g = {segs: [], itemKey: e.itemKey, y0, rawTargets: [], sortedTargets: [], min: y0, max: y0, bends: false, down: false, laneX: null};
				groups.set(key, g);
			}
			g.bends = true;
			g.down = true;
			g.max = Infinity;
			e.exit = g;
		}
		for (const e of entriesByGap.get(l) || []) {
			const y = e.target.y + e.inDy;
			labelCol = Math.max(labelCol, e.labelWidth);
			e.entry = {segs: [], itemKey: e.itemKey, y0: Infinity, rawTargets: [y], sortedTargets: [], min: y, max: Infinity, bends: true, down: true, laneX: null};
			groups.set(`back|${e.index}`, e.entry);
		}
		const groupList = [...groups.values()];
		for (const g of groupList) {
			g.sortedTargets = g.rawTargets.slice().sort((a, b) => a - b);
			g.min = Math.min(g.min, g.y0);
			g.max = Math.max(g.max, g.y0);
		}
		// Same-row rule. In a gap a lane's run in spans from the gap's left edge
		// to its lane, and each run out spans from the lane to the right edge.
		// With i left of j the only pairing that stays apart is i leaving at a
		// height j arrives at, so i's run ends before j's begins. Every other
		// shared height lays two runs on one row.
		const near = (a: number, b: number): boolean => Math.abs(a - b) < ROW_CLEAR;
		const clashesIfLeft = (i: LaneGroup, j: LaneGroup): boolean => {
			if (near(i.y0, j.y0)) return true;
			for (const a of i.rawTargets) {
				if (near(a, j.y0)) return true;
				for (const b of j.rawTargets) if (near(a, b)) return true;
			}
			return false;
		};
		const inside = (y: number, g: LaneGroup): boolean => y > g.min + 0.5 && y < g.max - 0.5;
		// Crossings a lane pair adds when i sits left of j: j's run in crosses
		// i's lane, and i's runs out cross j's lane.
		const crossings = (i: LaneGroup, j: LaneGroup): number => {
			let n = inside(j.y0, i) ? 1 : 0;
			for (const y of i.sortedTargets) if (inside(y, j)) n++;
			return n;
		};
		const score = (i: LaneGroup, j: LaneGroup): number =>
			crossings(i, j) + (clashesIfLeft(i, j) ? ROW_PENALTY : 0);
		let tracks = groupList.filter(g => g.bends);
		const FAR = 1e9;
		const slope = (g: LaneGroup): number => g.y0 === Infinity ? g.rawTargets[0] - FAR : g.down ? FAR : g.rawTargets[0] - g.y0;
		tracks.sort((a, b) => ((a.segs.length > 1 ? 1 : 0) - (b.segs.length > 1 ? 1 : 0))
			|| (slope(a) - slope(b)));
		const mustLeft = (i: LaneGroup, j: LaneGroup): boolean => !clashesIfLeft(i, j) && clashesIfLeft(j, i);
		// A shared height pins some lanes to a side, and those pins chain up, so
		// lane-by-lane moves alone can stall. Order by the pins first, keeping
		// the working order for everything the pins leave free.
		const n = tracks.length;
		const fans: number[][] = [];
		const blocked: number[] = [];
		for (let i = 0; i < n; i++) {
			fans.push([]);
			blocked.push(0);
		}
		for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
			if (i === j || !mustLeft(tracks[i], tracks[j])) continue;
			fans[i].push(j);
			blocked[j]++;
		}
		const ordered: LaneGroup[] = [];
		const done: boolean[] = [];
		const ready: number[] = [];
		for (let i = 0; i < n; i++) {
			done.push(false);
			if (blocked[i] === 0) ready.push(i);
		}
		while (ordered.length < n) {
			// A cycle means two shared heights want both sides; take the first
			// unpinned lane so every lane still gets placed.
			if (!ready.length) {
				for (let i = 0; i < n; i++) if (!done[i]) {
					ready.push(i);
					break;
				}
			}
			const k = ready.shift() as number;
			if (done[k]) continue;
			done[k] = true;
			ordered.push(tracks[k]);
			for (const j of fans[k]) {
				blocked[j]--;
				if (blocked[j] === 0) ready.push(j);
			}
		}
		tracks = ordered;
		// Fewer crossings: move one lane past its neighbours while that lowers
		// the pair sum. Adjacent swaps stall when two lanes each clash with the
		// other's partner, a longer move does not.
		for (let pass = 0; pass < 8; pass++) {
			let bestDelta = -0.5;
			let bestFrom = -1;
			let bestTo = -1;
			for (let i = 0; i < tracks.length; i++) {
				const t = tracks[i];
				let delta = 0;
				for (let j = i + 1; j < tracks.length; j++) {
					const x = tracks[j];
					delta += score(x, t) - score(t, x);
					if (delta < bestDelta) {
						bestDelta = delta;
						bestFrom = i;
						bestTo = j;
					}
				}
				delta = 0;
				for (let j = i - 1; j >= 0; j--) {
					const x = tracks[j];
					delta += score(t, x) - score(x, t);
					if (delta < bestDelta) {
						bestDelta = delta;
						bestFrom = i;
						bestTo = j;
					}
				}
			}
			if (bestFrom < 0) break;
			const t = tracks[bestFrom];
			tracks.splice(bestFrom, 1);
			tracks.splice(bestTo, 0, t);
		}
		const lanes = Math.max(0, tracks.length - 1) * laneGap;
		const width = Math.max(minGapWidth, SIDE_PAD + lanes + LABEL_ROOM + labelCol + END_PAD);
		return {groups: groupList, tracks, labelCol, width};
	};
	const gaps: GapInfo[] = [];
	for (let l = 0; l < maxCol; l++) gaps.push(planGap(l));
	// Lines going back can also leave the last column or enter the first.
	const gapBefore = planGap(-1);
	const gapAfterLast = planGap(maxCol);

	// Column widths and x positions.
	const layerW: number[] = [];
	for (const ly of layers) {
		let w = 0;
		for (const it of ly) if (it.node && it.node.width > w) w = it.node.width;
		layerW.push(w || 60);
	}
	if (grid && gaps.length) {
		let wMax = 0;
		for (const g of gaps) if (g.width > wMax) wMax = g.width;
		const even = Math.ceil(wMax / laneGap) * laneGap;
		for (const g of gaps) g.width = even;
		// Equal block columns too, so the columns stay evenly spaced.
		let blockW = 0;
		for (const w of layerW) if (w > blockW) blockW = w;
		for (let l = 0; l < layerW.length; l++) layerW[l] = blockW;
	}
	const layerX: number[] = [];
	let totalWidth = 0;
	for (let l = 0; l <= maxCol; l++) {
		layerX.push(totalWidth);
		totalWidth += layerW[l] + (l < gaps.length ? gaps[l].width : 0);
	}
	for (const ly of layers) for (const it of ly) {
		if (it.node) {
			it.node.x = layerX[it.layer];
			it.node.y = it.y;
		}
	}

	gapBefore.tracks.forEach((t, k) => t.laneX = layerX[0] - gapBefore.width + SIDE_PAD + k * laneGap);
	gapAfterLast.tracks.forEach((t, k) => t.laneX = totalWidth + SIDE_PAD + k * laneGap);

	const junctions: FlowJunction[] = [];
	for (let l = 0; l < gaps.length; l++) {
		const gap = gaps[l];
		const x0 = layerX[l] + layerW[l];
		const x1 = layerX[l + 1];
		const m = Math.max(0, gap.tracks.length - 1);
		let laneStart: number;
		if (grid) {
			const span = (x1 - 12 - gap.labelCol - LABEL_ROOM - x0 - m * laneGap) / 2 / laneGap;
			const centered = x0 + Math.max(SIDE_PAD, Math.round(span) * laneGap);
			const last = x1 - 12 - gap.labelCol - 8 - m * laneGap;
			laneStart = Math.max(x0 + SIDE_PAD, Math.min(centered, last));
		} else {
			laneStart = x0 + SIDE_PAD;
		}
		gap.tracks.forEach((t, k) => t.laneX = laneStart + k * laneGap);
		for (const g of gap.groups) {
			for (const s of g.segs) s.laneX = g.laneX;
			// One dot per real split: at least two lines leave this output and
			// bend at the shared lane. With a single bending branch there is no
			// shared trunk drawn, so a dot there would float beside the line.
			let bending = 0;
			for (const s of g.segs) if (Math.abs(s.y1 - s.y0) >= 1) bending++;
			if (bending >= 2 && g.laneX !== null) {
				junctions.push({x: g.laneX, y: g.y0, itemKey: g.itemKey});
			}
		}
	}

	// ---------- per-edge routes ----------
	// Lines that go back: one row per output below the blocks and lanes they pass,
	// shorter rows nearer the chart so they nest instead of crossing.
	const rows = new Map<LaneGroup, {from: number; to: number; first: number; last: number; y: number}>();
	for (const e of goesBack) {
		const g = e.exit as LaneGroup;
		const from = (e.entry as LaneGroup).laneX as number;
		const to = g.laneX as number;
		const row = rows.get(g);
		if (row) {
			row.from = Math.min(row.from, from);
			row.first = Math.min(row.first, e.target.layer);
		} else {
			rows.set(g, {from: Math.min(from, to), to: Math.max(from, to), first: Math.min(e.target.layer, e.source.layer), last: Math.max(e.target.layer, e.source.layer), y: 0});
		}
	}
	const bottoms = layers.map(ly => ly.reduce((low, it) => Math.max(low, it.y + (it.node ? it.node.height : it.h)), -Infinity));
	const placedRows: {from: number; to: number; y: number}[] = [];
	for (const row of [...rows.values()].sort((a, b) => (a.to - a.from) - (b.to - b.from))) {
		let y = -Infinity;
		for (let l = Math.max(0, row.first - 1); l <= Math.min(maxCol, row.last + 1); l++) y = Math.max(y, bottoms[l]);
		y += Math.max(nodeGap, laneGap);
		for (const other of placedRows.filter(o => o.from <= row.to + laneGap && o.to >= row.from - laneGap).sort((a, b) => a.y - b.y)) {
			if (Math.abs(other.y - y) < laneGap) y = other.y + laneGap;
		}
		row.y = y;
		placedRows.push(row);
	}

	const routeForward = (e: WorkEdge): FlowPoint[] => {
		const pts: FlowPoint[] = [];
		let curY = e.source.y + e.outPort.dy;
		pts.push({x: e.source.x + e.source.width, y: curY});
		for (const seg of e.segs) {
			const l = seg.a.layer;
			const y1 = seg.y1;
			if (Math.abs(y1 - curY) > GEOM_EPS) {
				const laneX = seg.laneX !== null ? seg.laneX : layerX[l] + layerW[l] + SIDE_PAD;
				pts.push({x: laneX, y: curY});
				pts.push({x: laneX, y: y1});
			}
			const x1 = layerX[l + 1];
			if (seg.b.kind === 'dummy') {
				pts.push({x: x1, y: y1});
				pts.push({x: x1 + layerW[l + 1], y: y1});
			} else {
				pts.push({x: x1, y: y1});
			}
			curY = y1;
		}
		return cleanPoints(pts);
	};

	// Cycles and other lines that do not move right: down the output's lane, along
	// its row below the chart, and up a lane left of the target's labels.
	const routeBackward = (e: WorkEdge): FlowPoint[] => {
		const t = e.target;
		const sy = e.source.y + e.outPort.dy;
		const ty = t.y + e.inDy;
		const exit = e.exit as LaneGroup;
		const xOut = exit.laneX as number;
		const xIn = (e.entry as LaneGroup).laneX as number;
		const y = (rows.get(exit) as {y: number}).y;
		return cleanPoints([
			{x: e.source.x + e.source.width, y: sy},
			{x: xOut, y: sy},
			{x: xOut, y},
			{x: xIn, y},
			{x: xIn, y: ty},
			{x: t.x, y: ty},
		]);
	};

	const outNodes = new Map<string, FlowNodePlacement>();
	for (const n of workNodes) outNodes.set(n.id, {x: n.x, y: n.y, width: n.width, height: n.height});
	const outEdges = new Map<string, FlowEdgeRoute>();
	for (const e of workEdges) {
		const points = e.segs.length ? routeForward(e) : routeBackward(e);
		outEdges.set(e.id, {points, label: {x: e.target.x - 12, y: e.target.y + e.inDy}});
	}

	// Shift everything so the chart starts at (0, 0) and measure the real extent.
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	const see = (x: number, y: number): void => {
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	};
	for (const p of outNodes.values()) {
		see(p.x, p.y);
		see(p.x + p.width, p.y + p.height);
	}
	for (const g of outEdges.values()) {
		for (const p of g.points) see(p.x, p.y);
		if (g.label) see(g.label.x, g.label.y);
	}
	if (!Number.isFinite(minX)) minX = 0;
	if (!Number.isFinite(minY)) minY = 0;
	if (!Number.isFinite(maxX)) maxX = minX;
	if (!Number.isFinite(maxY)) maxY = minY;
	if (minX !== 0 || minY !== 0) {
		for (const p of outNodes.values()) {
			p.x -= minX;
			p.y -= minY;
		}
		for (const g of outEdges.values()) {
			for (const p of g.points) {
				p.x -= minX;
				p.y -= minY;
			}
			if (g.label) {
				g.label.x -= minX;
				g.label.y -= minY;
			}
		}
		for (const j of junctions) {
			j.x -= minX;
			j.y -= minY;
		}
	}
	return {nodes: outNodes, edges: outEdges, junctions, width: maxX - minX, height: maxY - minY};
}
