import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {PlannerGraphService} from '@src/Components/Planner/PlannerGraphService';
import {Item} from '@src/Model/Data/Entities/Item';
import {VersionManager} from '@src/Model/Data/VersionManager';
import {BeltPlanner} from '@src/Model/Planner/BeltPlanner';
import {BeltConsumerPart, BeltLayoutResult, BeltPart} from '@src/Model/Planner/BeltLayoutResult';
import {ConveyorCapacity} from '@src/Model/Planner/ConveyorCapacity';
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

interface BeltConnectionView
{

	/** The edge's index in the rendered graph. */
	readonly index: number;

	readonly header: string;

	readonly belts: BeltLineView[];

	readonly suggestion: string | null;

}

/** Read-only belt breakdown of the selected node's multi-belt connections. */
@Component({
	selector: 'node-belts',
	templateUrl: './NodeBeltsComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
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
			const capacityLabel = ConveyorCapacity.label(settings.conveyorLimit, plan.isFluid, plan.layout.belts.length);
			const sourceTotals = NodeBeltsComponent.totals(plan.layout.belts.flatMap(belt => belt.parts));
			const consumerTotals = NodeBeltsComponent.totals(plan.consumers.flat());
			connections.push({
				index,
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
				suggestion: this.suggestionFor(plan.layout, item),
			});
		}
		return connections.sort((left, right) => left.index - right.index);
	}

	private suggestionFor(layout: BeltLayoutResult, item: Item | null): string | null
	{
		if (layout.proposal === null || !layout.changed) {
			return null;
		}
		if (layout.proposal.kind === 'raise') {
			const raised = `raise to ${this.rateFormatter.rate(layout.proposal.totalAfter, item)}`;
			return layout.proposal.surplus !== undefined
				? `${raised}, ${this.rateFormatter.rate(layout.proposal.surplus, item)} to the sink`
				: raised;
		}
		const belts = layout.proposal.belts.map((groups, index) => `belt ${index + 1}: ` + groups
			.map(group => `${this.rateFormatter.machineCount(group.machines)} × ${this.rateFormatter.clock(group.clockSpeed)}%`)
			.join(' + '));
		const before = layout.belts.reduce((units, belt) => {
			belt.parts.forEach(part => units.add(part.unitId));
			return units;
		}, new Set<string>()).size;
		const after = this.rateFormatter.machineCount(layout.proposal.machinesAfter);
		const change = before > 0 ? ` (${after} machines, now ${this.rateFormatter.machineCount(before)})` : ` (${after} machines)`;
		return `regroup so each belt is fed by whole machines: ${belts.join(' · ')}${change}`;
	}

	private static totals(parts: readonly (BeltPart | BeltConsumerPart)[]): Map<string, number>
	{
		const totals = new Map<string, number>();
		parts.forEach(part => totals.set(part.unitId, (totals.get(part.unitId) ?? 0) + part.rate));
		return totals;
	}

}
