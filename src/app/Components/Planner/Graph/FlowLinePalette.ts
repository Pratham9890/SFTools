import {Graph} from '@src/Model/Planner/Graph/Graph';

/** The approved mock-up's palette (ui-mockups/app.js, COLOURS), assigned per item in order of first appearance. */
const COLOURS = [
	'#e0a458', '#7aaee0', '#c995dc', '#8cc77a', '#e48a7c', '#5fc4b7', '#d9cd68',
	'#a3a9f2', '#e698c0', '#b6cf9e', '#d6a07a', '#87cbe9', '#f0b6a0', '#9fd3c7',
];

const FLUID = '#4ea3d8';
const NEUTRAL = '#7d8791';

export interface FlowJunctionPoint
{

	readonly x: number;
	readonly y: number;
	readonly itemClassName: string;

}

/** Item colours for the rendered graph; fluids keep their blue when colouring is off. */
export class FlowLinePalette
{

	private readonly colours = new Map<string, string>();

	public constructor(colourByItem: boolean, fluids: ReadonlySet<string>)
	{
		this.colourByItem = colourByItem;
		this.fluids = fluids;
	}

	private readonly colourByItem: boolean;
	private readonly fluids: ReadonlySet<string>;

	public colourFor(itemClassName: string): string
	{
		const cached = this.colours.get(itemClassName);
		if (cached !== undefined) {
			return cached;
		}
		let colour: string;
		if (this.fluids.has(itemClassName)) {
			colour = FLUID;
		} else if (!this.colourByItem) {
			colour = NEUTRAL;
		} else {
			const solids = [...this.colours.values()].filter(value => value !== FLUID).length;
			colour = COLOURS[solids % COLOURS.length];
		}
		this.colours.set(itemClassName, colour);
		return colour;
	}

	/**
	 * Assigns colours in the order the lines appear, so the same plan always gets the same colours.
	 * Builds a fresh palette rather than reusing covered entries of an old one.
	 */
	public static forGraph(graph: Graph, colourByItem: boolean, fluids: ReadonlySet<string>): FlowLinePalette
	{
		const palette = new FlowLinePalette(colourByItem, fluids);
		graph.edges.forEach(edge => palette.colourFor(edge.itemClassName));
		return palette;
	}

}

/**
 * Split dots: places where two or more lines of the same output really branch. Read back from the
 * routed vertices so the dots follow an edited or dragged chart instead of a stale layout result.
 */
export function collectFlowJunctions(graph: Graph, runsRight: boolean): FlowJunctionPoint[]
{
	const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
	const counts = new Map<string, {x: number; y: number; itemClassName: string; count: number}>();
	for (const edge of graph.edges) {
		const vertices = edge.vertices;
		const source = nodeById.get(edge.sourceId);
		if (!vertices || vertices.length === 0 || source === undefined) {
			continue;
		}
		const dy = edge.sourcePortDy ?? 0;
		const first = vertices[0];
		// Only the corner straight off the output can be shared; a later one belongs to one line's own run.
		if (runsRight) {
			if (Math.abs(first.y - (source.y + dy)) > 0.5) {
				continue;
			}
		} else if (Math.abs(first.x - (source.x + dy)) > 0.5) {
			continue;
		}
		const key = `${Math.round(first.x * 100)}|${Math.round(first.y * 100)}|${edge.itemClassName}`;
		const entry = counts.get(key);
		if (entry) {
			entry.count++;
		} else {
			counts.set(key, {x: first.x, y: first.y, itemClassName: edge.itemClassName, count: 1});
		}
	}
	return [...counts.values()]
		.filter(entry => entry.count >= 2)
		.map(entry => ({x: entry.x, y: entry.y, itemClassName: entry.itemClassName}));
}
