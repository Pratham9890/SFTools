import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {AppTooltipDirective} from '@src/Components/Common/AppTooltipDirective';
import {BeltProposalRequest} from '@src/Components/Planner/BeltProposalRequest';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {PlannerGraphService} from '@src/Components/Planner/PlannerGraphService';
import {Item} from '@src/Model/Data/Entities/Item';
import {VersionManager} from '@src/Model/Data/VersionManager';
import {BeltPlanner} from '@src/Model/Planner/BeltPlanner';
import {BeltConsumerPart, BeltLayoutResult, BeltPart, BeltProposal} from '@src/Model/Planner/BeltLayoutResult';
import {ConveyorCapacity} from '@src/Model/Planner/ConveyorCapacity';
import {GraphEdge} from '@src/Model/Planner/Graph/GraphEdge';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {Node} from '@src/Model/Planner/Solver/Response/Node';
import {RateFormatter} from '@src/Model/RateFormatter';

interface BeltLineView
{

	readonly index: number;

	readonly load: string;

	readonly percent: number;

	readonly from: string;

	readonly to: string;

}

interface BeltProposalView
{

	readonly request: BeltProposalRequest;

	/** Non-null: the Apply button stays disabled and explains why. */
	readonly disabledReason: string | null;

}

interface BeltConnectionView
{

	/** The edge's index in the rendered graph. */
	readonly index: number;

	/** "Belt" or "Pipe", for the per-line labels. */
	readonly lineName: string;

	readonly header: string;

	readonly belts: BeltLineView[];

	readonly suggestion: string | null;

	readonly proposal: BeltProposalView | null;

}

/** Read-only belt breakdown of the selected node's multi-belt connections. */
@Component({
	selector: 'node-belts',
	templateUrl: './NodeBeltsComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [AppTooltipDirective],
	styles: [`
		.belt-line {
			display: flex;
			align-items: center;
			flex-wrap: wrap;
			gap: 0.35rem;
		}
		.belt-bar {
			height: 8px;
			min-width: 4rem;
			background: #1d2833;
		}
		.belt-bar .progress-bar { background: #5bc0de; }
	`],
})
export class NodeBeltsComponent
{

	@Input({required: true}) public node!: Node;

	public constructor(
		private readonly plannerGraph: PlannerGraphService,
		private readonly planManager: PlanManager,
		private readonly versionManager: VersionManager,
		private readonly rateFormatter: RateFormatter,
		private readonly actions: PlannerActionsService,
	)
	{
	}

	public connections(): BeltConnectionView[]
	{
		const settings = this.planManager.activeSettings();
		const graph = this.planManager.activePlan()?.graph ?? null;
		const data = this.versionManager.activeVersionData();
		if (settings?.conveyorLimit === undefined || settings.beltLayout === undefined || graph === null || data === null) {
			return [];
		}

		const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
		const connections: BeltConnectionView[] = [];
		for (const [index, plan] of this.plannerGraph.beltPlan()) {
			const edge = plan.edge;
			if (plan.layout.belts.length < 2 || (edge.sourceId !== this.node.id && edge.targetId !== this.node.id)) {
				continue;
			}
			const source = nodeById.get(edge.sourceId);
			const target = nodeById.get(edge.targetId);
			if (!source || !target) {
				continue;
			}
			const item = data.searchItemByClassName(edge.itemClassName) ?? null;
			const itemName = item?.name ?? edge.itemClassName;
			const proposal = plan.layout.changed ? plan.layout.proposal : null;
			const capacityLabel = ConveyorCapacity.label(settings.conveyorLimit, plan.isFluid, plan.layout.belts.length);
			const sourceTotals = NodeBeltsComponent.totals(plan.layout.belts.flatMap(belt => belt.parts));
			const consumerTotals = NodeBeltsComponent.totals(plan.consumers.flat());
			connections.push({
				index,
				lineName: plan.isFluid ? 'Pipe' : 'Belt',
				header: edge.sourceId === this.node.id
					? `Out: ${itemName} → ${target.getDisplayName()} · ${capacityLabel}`
					: `In: ${itemName} ← ${source.getDisplayName()} · ${capacityLabel}`,
				belts: plan.layout.belts.map((belt, beltIndex) => ({
					index: belt.index,
					load: this.rateFormatter.rate(belt.load, item),
					percent: Math.round(belt.fill * 100),
					from: BeltPlanner.describe(belt.parts, source, sourceTotals, data),
					to: BeltPlanner.describe(plan.consumers[beltIndex] ?? [], target, consumerTotals, data),
				})),
				suggestion: proposal !== null ? this.suggestionFor(proposal, plan.layout, item) : null,
				proposal: proposal !== null ? this.proposalFor(proposal, index, edge, graph.edges) : null,
			});
		}
		return connections.sort((left, right) => left.index - right.index);
	}

	private suggestionFor(proposal: BeltProposal, layout: BeltLayoutResult, item: Item | null): string
	{
		if (proposal.kind === 'raise') {
			const raised = `raise to ${this.rateFormatter.rate(proposal.totalAfter, item)}`;
			return proposal.surplus !== undefined
				? `${raised}, ${this.rateFormatter.rate(proposal.surplus, item)} to the sink`
				: raised;
		}
		const belts = proposal.belts.map((groups, index) => `belt ${index + 1}: ` + groups
			.map(group => `${this.rateFormatter.machineCount(group.machines)} × ${this.rateFormatter.clock(group.clockSpeed)}%`)
			.join(' + '));
		const before = layout.belts.reduce((units, belt) => {
			belt.parts.forEach(part => units.add(part.unitId));
			return units;
		}, new Set<string>()).size;
		const after = this.rateFormatter.machineCount(proposal.machinesAfter);
		const change = before > 0 ? ` (${after} machines, now ${this.rateFormatter.machineCount(before)})` : ` (${after} machines)`;
		return `regroup so each belt is fed by whole machines: ${belts.join(' · ')}${change}`;
	}

	private proposalFor(proposal: BeltProposal, edgeIndex: number, edge: GraphEdge, edges: readonly GraphEdge[]): BeltProposalView
	{
		// A proposal for one connection of a node that feeds several cannot be turned into machine groups: its rates are only this connection's share.
		const shared = edges.filter(other => other.sourceId === edge.sourceId && other.itemClassName === edge.itemClassName).length > 1;
		let disabledReason: string | null = null;
		if (this.planManager.activePlanReadOnly()) {
			disabledReason = 'The plan is read-only';
		} else if (shared) {
			disabledReason = 'Applies only when this node feeds one connection of this item';
		}
		return {request: {edgeIndex, nodeId: edge.sourceId, proposal}, disabledReason};
	}

	public applyProposal(view: BeltProposalView): void
	{
		if (view.disabledReason === null) {
			this.actions.requestBeltProposal(view.request);
		}
	}

	private static totals(parts: readonly (BeltPart | BeltConsumerPart)[]): Map<string, number>
	{
		const totals = new Map<string, number>();
		parts.forEach(part => totals.set(part.unitId, (totals.get(part.unitId) ?? 0) + part.rate));
		return totals;
	}

}
