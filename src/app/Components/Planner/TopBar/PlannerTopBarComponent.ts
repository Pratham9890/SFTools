import {ChangeDetectionStrategy, Component, Signal, computed} from '@angular/core';
import {RouterLink} from '@angular/router';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faCheck, faChevronDown, faEye, faFileArrowDown, faGear, faImage, faPlay, faShareNodes, faUser, faUserPlus, faXmark} from '@fortawesome/free-solid-svg-icons';
import {BsDropdownModule} from 'ngx-bootstrap/dropdown';
import {AppTooltipDirective} from '@src/Components/Common/AppTooltipDirective';
import {CalculatorRunControls} from '@src/Components/Planner/Panels/Calculator/CalculatorRunControls';
import {CalculatorTabHotkeys} from '@src/Components/Planner/Panels/Calculator/CalculatorTabHotkeys';
import {CALCULATOR_DOCK_IDS} from '@src/Components/Planner/Dock/PlannerDockApi';
import {PlannerDockService} from '@src/Components/Planner/Dock/PlannerDockService';
import {GraphExportDialogService} from '@src/Components/Planner/Export/GraphExportDialogService';
import {PanelLayoutService} from '@src/Components/Planner/Panel/PanelLayoutService';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {CoopPlayer} from '@src/Model/Coop/CoopApi';
import {CoopSession} from '@src/Model/Coop/CoopSession';
import {CoopBoxComponent} from '@src/Components/Planner/TopBar/CoopBoxComponent';
import {HotkeyAction} from '@src/Model/Hotkeys/HotkeyAction';
import {HotkeyService} from '@src/Model/Hotkeys/HotkeyService';
import {NotificationService} from '@src/Model/NotificationService';
import {PlanFileDialogService} from '@src/Model/PlanFiles/PlanFileDialogService';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {PlanNameResolver} from '@src/Model/Planner/PlanNameResolver';

interface TopBarTab
{
	readonly id: string;
	readonly label: string;
}

/** The planner's own header: plan name, the six tabs and the actions that used to sit on the calculator's header. */
@Component({
	selector: 'planner-top-bar',
	templateUrl: './PlannerTopBarComponent.html',
	imports: [RouterLink, FaIconComponent, BsDropdownModule, AppTooltipDirective, CoopBoxComponent],
	changeDetection: ChangeDetectionStrategy.Eager,
})
export class PlannerTopBarComponent
{

	public readonly faCheck = faCheck;
	public readonly faChevronDown = faChevronDown;
	public readonly faEye = faEye;
	public readonly faFileArrowDown = faFileArrowDown;
	public readonly faGear = faGear;
	public readonly faImage = faImage;
	public readonly faPlay = faPlay;
	public readonly faShareNodes = faShareNodes;
	public readonly faUser = faUser;
	public readonly faUserPlus = faUserPlus;
	public readonly faXmark = faXmark;

	public readonly tabs: readonly TopBarTab[] = [
		{id: 'produce', label: 'Produce'},
		{id: 'recipes', label: 'Recipes'},
		{id: 'resources', label: 'Resources'},
		{id: 'supply', label: 'Supply'},
		{id: 'belts', label: 'Belts'},
		{id: 'materials', label: 'Materials'},
	];

	public readonly moreOpen: Signal<boolean>;

	public readonly hasPlan: Signal<boolean>;

	public readonly planLabel: Signal<string>;

	/** The same setting the Belts tab writes, so the badge can never disagree with its checkbox. */
	public readonly beltView: Signal<boolean>;

	public readonly coopLabel: Signal<string>;

	public readonly players: Signal<(CoopPlayer & {online: boolean})[]>;

	public readonly run: CalculatorRunControls;

	public constructor(
		public readonly dock: PlannerDockService,
		public readonly layout: PanelLayoutService,
		private readonly planManager: PlanManager,
		private readonly planNames: PlanNameResolver,
		public readonly coop: CoopSession,
		public readonly actions: PlannerActionsService,
		private readonly notifications: NotificationService,
		private readonly planFiles: PlanFileDialogService,
		private readonly exportDialog: GraphExportDialogService,
		public readonly hotkeys: HotkeyService,
	)
	{
		this.run = new CalculatorRunControls(planManager, actions);
		this.hasPlan = computed(() => planManager.activePlan() !== null);
		this.planLabel = computed(() => {
			const plan = planManager.activePlan();
			if (plan !== null) {
				return planNames.displayName(plan);
			}
			const folder = planManager.activeFolder();
			return folder === null ? 'Plans' : folder.name;
		});
		this.beltView = computed(() => planManager.activeSettings()?.beltLayout?.beltView === true);
		this.moreOpen = computed(() => {
			const id = dock.openId();
			return id !== null && dock.entries.some(entry => entry.id === id && (entry.group === 'more' || entry.group === 'more-view'));
		});
		this.coopLabel = computed(() => {
			if (!coop.active()) {
				return 'Playing solo';
			}
			const name = coop.spaceName();
			return name === null || name.trim() === '' ? 'Co-op' : `Co-op: ${name}`;
		});
		this.players = computed(() => {
			const online = coop.online();
			const me = coop.player()?.id ?? null;
			return coop.players().map(player => ({...player, online: player.id === me || online.has(player.id)}));
		});
	}

	public toggleTab(id: string): void
	{
		this.dock.toggle(id);
	}

	public openTab(id: string): void
	{
		this.dock.open(id);
	}

	public openPlans(): void
	{
		this.dock.toggle('plans');
	}

	public toggleSettings(): void
	{
		this.dock.toggle('settings');
	}

	public preview(): void
	{
		this.run.preview();
	}

	public hotkeyOf(dockId: string): HotkeyAction | undefined
	{
		const entry = CalculatorTabHotkeys.ENTRIES.find(candidate => CALCULATOR_DOCK_IDS[candidate.tab] === dockId);
		return entry?.action;
	}

	public tabTooltip(label: string, dockId: string): string
	{
		return label + this.hotkeys.suffix(this.hotkeyOf(dockId));
	}

	public isMode(mode: string): boolean
	{
		return this.run.mode() === mode;
	}

	/** Solo: the co-op panel opens first, so the invite has somewhere to come from. In a space: the link is copied. */
	public async inviteFriend(): Promise<void>
	{
		const link = this.coop.inviteLink();
		if (link === null) {
			this.dock.open('coop');
			return;
		}
		try {
			await navigator.clipboard.writeText(link);
			this.notifications.show('Invite link copied. Anyone with it can open and edit this space.', 5_000);
		} catch {
			window.prompt('Copy the invite link:', link);
		}
	}

	public downloadPlan(): void
	{
		const plan = this.planManager.activePlan();
		if (plan === null) {
			return;
		}
		// A shared plan is not in either export tree, so the dialog would open with nothing to tick.
		const source = this.planManager.isSharedPlan(plan.id) ? null : this.planManager.isLocalPlan(plan.id) ? 'local' : 'account';
		if (source === null) {
			this.dock.open('plans');
			this.notifications.show('This plan belongs to someone else. Add it to your plans to download it.', 6_000);
			return;
		}
		this.planFiles.openExport({source, target: {type: 'plan', id: plan.id}});
	}

	public saveChartAsImage(): void
	{
		this.exportDialog.open();
	}

}
