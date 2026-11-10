import {ChangeDetectionStrategy, Component, Signal, computed, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faCheck, faCopy, faFlag, faPen, faRightFromBracket, faRotateLeft, faTriangleExclamation, faUserPlus, faXmark} from '@fortawesome/free-solid-svg-icons';
import {GameIconComponent} from '@src/Components/Common/GameIconComponent';
import {GoToNodeButtonComponent} from '@src/Components/Planner/Panels/GoToNode/GoToNodeButtonComponent';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {CoopPlayer} from '@src/Model/Coop/CoopApi';
import {COOP_COLORS, CoopSession} from '@src/Model/Coop/CoopSession';
import {CoopClaimables, CoopClaimable} from '@src/Model/Coop/CoopClaimables';
import {NotificationService} from '@src/Model/NotificationService';
import {BuildCostBreakdown} from '@src/Model/Planner/Breakdown/BuildCostBreakdown';
import {PlanBreakdownService} from '@src/Model/Planner/Breakdown/PlanBreakdownService';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {RateFormatter} from '@src/Model/RateFormatter';

export type CoopPartView = 'mine' | 'unclaimed' | 'everyone' | 'plan';

interface PartRow extends CoopClaimable
{
	readonly holder: CoopPlayer | null;
	readonly mine: boolean;
}

@Component({
	selector: 'planner-coop',
	changeDetection: ChangeDetectionStrategy.Eager,
	templateUrl: './PlannerCoopComponent.html',
	styleUrl: './PlannerCoopComponent.scss',
	imports: [FormsModule, FaIconComponent, GameIconComponent, GoToNodeButtonComponent],
})
export class PlannerCoopComponent
{

	public readonly faCheck = faCheck;
	public readonly faCopy = faCopy;
	public readonly faFlag = faFlag;
	public readonly faPen = faPen;
	public readonly faRightFromBracket = faRightFromBracket;
	public readonly faRotateLeft = faRotateLeft;
	public readonly faTriangleExclamation = faTriangleExclamation;
	public readonly faUserPlus = faUserPlus;
	public readonly faXmark = faXmark;

	public readonly colors = COOP_COLORS;

	private readonly coop = inject(CoopSession);
	private readonly planManager = inject(PlanManager);
	private readonly claimableService = inject(CoopClaimables);
	private readonly breakdown = inject(PlanBreakdownService);
	private readonly actions = inject(PlannerActionsService);
	private readonly notifications = inject(NotificationService);
	public readonly rateFormatter = inject(RateFormatter);

	public playerName = '';
	public playerColor = COOP_COLORS[0];
	public spaceName = '';
	public inviteText = '';
	public renameText = '';

	public readonly editingPlayer = signal(false);
	public readonly renaming = signal(false);
	public readonly busy = signal(false);
	public readonly error = signal<string | null>(null);
	public readonly view = signal<CoopPartView>('mine');

	public readonly player = this.coop.player;
	public readonly active = this.coop.active;
	public readonly connection = this.coop.connection;

	public readonly players: Signal<(CoopPlayer & {online: boolean; me: boolean})[]> = computed(() => {
		const online = this.coop.online();
		const me = this.coop.player()?.id;
		return this.coop.players().map(p => ({...p, online: online.has(p.id) || p.id === me, me: p.id === me}));
	});

	public readonly plan = this.planManager.activePlan;
	public readonly planInSpace = computed(() => {
		const plan = this.plan();
		return plan !== null && this.coop.active() && this.planManager.plans().some(p => p.id === plan.id);
	});

	private readonly claimables: Signal<CoopClaimable[]> = computed(() => this.claimableService.of(this.plan()));

	public readonly rows: Signal<PartRow[]> = computed(() => {
		const plan = this.plan();
		const me = this.coop.player()?.id ?? null;
		this.coop.claims();
		if (plan === null) return [];
		return this.claimables().map(item => {
			const holder = this.coop.claimHolder(plan.id, item.nodeId);
			return {...item, holder, mine: holder !== null && holder.id === me};
		});
	});

	public readonly visibleRows: Signal<PartRow[]> = computed(() => {
		switch (this.view()) {
			case 'mine': return this.rows().filter(row => row.mine);
			case 'unclaimed': return this.rows().filter(row => row.holder === null);
			case 'everyone': return this.rows().filter(row => row.holder !== null);
			default: return this.rows();
		}
	});

	public readonly counts = computed(() => {
		const rows = this.rows();
		return {
			mine: rows.filter(r => r.mine).length,
			unclaimed: rows.filter(r => r.holder === null).length,
			everyone: rows.filter(r => r.holder !== null).length,
			plan: rows.length,
		};
	});

	/** Materials still needed for the shown nodes that are not built yet. */
	public readonly cost: Signal<BuildCostBreakdown> = computed(() =>
		this.breakdown.buildCostForNodes(this.plan(), new Set(this.visibleRows().map(row => row.nodeId))));

	/** Claims on nodes a recalculation or edit removed. */
	public readonly orphans: Signal<{nodeId: string; holder: CoopPlayer}[]> = computed(() => {
		const plan = this.plan();
		if (plan === null) return [];
		const present = new Set(this.claimables().map(c => c.nodeId));
		const prefix = `${plan.id}:`;
		const result: {nodeId: string; holder: CoopPlayer}[] = [];
		this.coop.claims().forEach((_playerId, key) => {
			if (!key.startsWith(prefix)) return;
			const nodeId = key.slice(prefix.length);
			if (!present.has(nodeId)) {
				result.push({nodeId, holder: this.coop.claimHolder(plan.id, nodeId)!});
			}
		});
		return result;
	});

	public constructor()
	{
		const player = this.coop.player();
		if (player !== null) {
			this.playerName = player.name;
			this.playerColor = player.color;
		}
	}

	public get configured(): boolean
	{
		return this.coop.configured;
	}

	public spaceTitle(): string
	{
		return this.coop.spaceName() ?? 'Co-op space';
	}

	public savePlayer(): void
	{
		const name = this.playerName.trim();
		if (name === '') return;
		this.coop.setPlayer(name.slice(0, 40), this.playerColor);
		this.editingPlayer.set(false);
	}

	public editPlayer(): void
	{
		const player = this.coop.player();
		this.playerName = player?.name ?? '';
		this.playerColor = player?.color ?? COOP_COLORS[0];
		this.editingPlayer.set(true);
	}

	public async create(): Promise<void>
	{
		const name = this.spaceName.trim() || `${this.coop.player()?.name ?? 'Our'}'s factory`;
		await this.run(() => this.coop.createSpace(name.slice(0, 100)));
	}

	public async join(): Promise<void>
	{
		const fragment = this.inviteText.includes('#') ? this.inviteText.slice(this.inviteText.indexOf('#') + 1) : this.inviteText;
		const credentials = CoopSession.parseInvite(fragment);
		if (credentials === null) {
			this.error.set('That does not look like a co-op invite link.');
			return;
		}
		await this.run(() => this.coop.joinSpace(credentials));
	}

	public startRename(): void
	{
		this.renameText = this.coop.spaceName() ?? '';
		this.renaming.set(true);
	}

	public async rename(): Promise<void>
	{
		const name = this.renameText.trim();
		this.renaming.set(false);
		if (name === '' || name === this.coop.spaceName()) return;
		await this.run(() => this.coop.renameSpace(name.slice(0, 100)));
	}

	public async copyInvite(): Promise<void>
	{
		const link = this.coop.inviteLink();
		if (link === null) return;
		try {
			await navigator.clipboard.writeText(link);
			this.notifications.show('Invite link copied. Anyone with it can open and edit this space.', 5_000);
		} catch {
			window.prompt('Copy the invite link:', link);
		}
	}

	public leave(): void
	{
		if (!window.confirm('Leave this co-op space on this device? Its plans stay in the space, and you can come back with the invite link.')) {
			return;
		}
		this.coop.leave();
	}

	public setView(view: CoopPartView): void
	{
		this.view.set(view);
	}

	public claim(row: PartRow): void
	{
		const plan = this.plan();
		if (plan !== null) void this.coop.claim(plan.id, row.nodeId);
	}

	public unclaim(nodeId: string): void
	{
		const plan = this.plan();
		if (plan !== null) void this.coop.unclaim(plan.id, nodeId);
	}

	public toggleDone(row: PartRow): void
	{
		this.actions.requestNodeDone({nodeIds: [row.nodeId], done: !row.done});
	}

	private async run(task: () => Promise<void>): Promise<void>
	{
		this.busy.set(true);
		this.error.set(null);
		try {
			await task();
			this.inviteText = '';
			this.spaceName = '';
		} catch (error) {
			console.error(error);
			this.error.set(error instanceof Error && error.message.startsWith('This co-op')
				? error.message
				: 'Could not reach the co-op space. Check your connection and try again.');
		} finally {
			this.busy.set(false);
		}
	}

}
