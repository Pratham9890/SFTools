import {Injectable} from '@angular/core';
import {ExtractorCapacity} from '@src/Model/Planner/ExtractorCapacity';
import {Plan} from '@src/Model/Planner/Plan';
import {PlanSerializer} from '@src/Model/Planner/PlanSerializer';
import {GeneratorNode} from '@src/Model/Planner/Solver/Response/GeneratorNode';
import {MineNode} from '@src/Model/Planner/Solver/Response/MineNode';
import {Node} from '@src/Model/Planner/Solver/Response/Node';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';

/** One part of a plan a player can claim: a node that stands for buildings. */
export interface CoopClaimable
{
	readonly nodeId: string;
	readonly name: string;
	readonly detail: string;
	readonly icon: string | null;
	readonly buildings: number;
	readonly done: boolean;
}

@Injectable({providedIn: 'root'})
export class CoopClaimables
{

	private cachedGraph: unknown = null;
	private cached: CoopClaimable[] = [];

	public constructor(private readonly serializer: PlanSerializer)
	{
	}

	public static isClaimable(node: Node): boolean
	{
		return node instanceof RecipeNode || node instanceof GeneratorNode || node instanceof MineNode;
	}

	public of(plan: Plan | null): CoopClaimable[]
	{
		const graph = plan?.graph ?? null;
		if (graph === null) return [];
		if (graph === this.cachedGraph) return this.cached;
		let nodes: Node[];
		try {
			nodes = this.serializer.reviveGraph(graph).nodes;
		} catch {
			return [];
		}
		this.cachedGraph = graph;
		this.cached = nodes.flatMap(node => {
			const item = this.describe(node);
			return item === null ? [] : [item];
		});
		return this.cached;
	}

	private describe(node: Node): CoopClaimable | null
	{
		if (node instanceof RecipeNode) {
			return {
				nodeId: node.id,
				name: node.recipe.name,
				detail: node.machine.name,
				icon: node.machine.icon,
				buildings: node.amount,
				done: node.done,
			};
		}
		if (node instanceof GeneratorNode) {
			return {
				nodeId: node.id,
				name: node.generator.name,
				detail: node.fuel.item.name,
				icon: node.generator.icon,
				buildings: node.wholeGenerators(),
				done: node.done,
			};
		}
		if (node instanceof MineNode) {
			return {
				nodeId: node.id,
				name: node.item.name,
				detail: 'Extraction',
				icon: node.item.icon,
				buildings: ExtractorCapacity.buildings(node.extractors ?? []),
				done: node.done,
			};
		}
		return null;
	}

}
