import {Injectable} from '@angular/core';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {ShardFitPreview} from '@src/Components/Planner/ShardBudget/ShardFitPreview';
import {Graph} from '@src/Model/Planner/Graph/Graph';
import {PlanBreakdownService} from '@src/Model/Planner/Breakdown/PlanBreakdownService';
import {GroupingModeResolver} from '@src/Model/Planner/GroupingModeResolver';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {PlanSerializer} from '@src/Model/Planner/PlanSerializer';
import {ShardBudgetFitter} from '@src/Model/Planner/ShardBudgetFitter';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';

/** Component-scoped through the overclocking tab; the planner applies the fitted nodes. */
@Injectable()
export class ShardFitService
{

	public constructor(
		private readonly planManager: PlanManager,
		private readonly planSerializer: PlanSerializer,
		private readonly breakdown: PlanBreakdownService,
		private readonly groupingModes: GroupingModeResolver,
		private readonly actions: PlannerActionsService,
	)
	{
	}

	public preview(): ShardFitPreview | null
	{
		const plan = this.planManager.activePlan();
		const budget = plan?.settings.maxShards;
		if (!plan?.graph || plan.graph.nodes.length === 0 || budget === undefined || this.planManager.activePlanReadOnly()) {
			return null;
		}

		let graph: Graph;
		try {
			graph = this.planSerializer.reviveGraph(plan.graph);
		} catch (err) {
			console.error('Could not revive the plan graph to fit power shards:', err);
			return null;
		}

		const used = this.breakdown.buildCost(plan).shards;
		const result = ShardBudgetFitter.fit(graph.nodes, budget, used, this.groupingModes.resolve(plan.settings));
		return {planId: plan.id, budget, used, graph, result};
	}

	public apply(preview: ShardFitPreview): boolean
	{
		const plan = this.planManager.activePlan();
		if (!plan || plan.id !== preview.planId || this.planManager.activePlanReadOnly()
			|| !preview.result.fits || preview.result.changes.length === 0) {
			return false;
		}

		const changes = new Map(preview.result.changes.map(change => [change.nodeId, change]));
		const updated = preview.graph.nodes.flatMap(node => {
			const change = changes.get(node.id);
			if (!(node instanceof RecipeNode) || change === undefined) {
				return [];
			}
			const fitted = new RecipeNode(node.id, node.target, change.after.map(group => ({...group})), node.machine, node.recipe);
			fitted.x = node.x;
			fitted.y = node.y;
			fitted.done = node.done;
			fitted.groupingMode = node.groupingMode;
			// Fitting is a manual edit, so the node stays user-owned through further solves.
			fitted.locked = true;
			return [fitted];
		});
		// The planner applies them like inspector edits: one undo step, reconciled edges, repainted canvas.
		this.actions.requestNodesUpdate(updated);
		return true;
	}

}
