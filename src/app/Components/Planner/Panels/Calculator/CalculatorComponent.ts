import {Component, ElementRef, OnDestroy, Signal, ViewChild, computed, effect, signal, ChangeDetectionStrategy, untracked} from '@angular/core';
import {DatePipe, NgTemplateOutlet} from '@angular/common';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {BsDropdownModule} from 'ngx-bootstrap/dropdown';
import {AppTooltipDirective} from '@src/Components/Common/AppTooltipDirective';
import {SupporterBadgeComponent} from '@src/Components/Supporters/SupporterBadgeComponent';
import {InfoNoteComponent} from '@src/Components/Common/InfoNoteComponent';
import {CalculatorTabsMode} from '@src/Components/Planner/Panels/Calculator/CalculatorTabsMode';
import {faCopy, faDownload, faEllipsis, faEye, faFileImport, faIndustry, faLock, faPlay, faRotateLeft, faShareNodes, faSitemap, faSliders, faXmark} from '@fortawesome/free-solid-svg-icons';
import {CalculationModeOption} from '@src/Components/Planner/Panels/Calculator/CalculationModeOption';
import {CalculatorRunControls} from '@src/Components/Planner/Panels/Calculator/CalculatorRunControls';
import {HelpButtonComponent} from '@src/Components/Help/HelpButtonComponent';
import {HelpTopicId} from '@src/Model/Help/HelpTopicId';
import {CalculatorTab} from '@src/Components/Planner/Panels/Calculator/CalculatorTab';
import {CalculatorTabBadgeResolver} from '@src/Components/Planner/Panels/Calculator/CalculatorTabBadgeResolver';
import {CalculatorTabStateService} from '@src/Components/Planner/Panels/Calculator/CalculatorTabStateService';
import {FolderRecalculationService} from '@src/Components/Planner/FolderRecalculationService';
import {FolderRecalculationProgress} from '@src/Components/Planner/FolderRecalculationProgress';
import {CalculatorTabDefinition} from '@src/Components/Planner/Panels/Calculator/CalculatorTabDefinition';
import {CalculatorTabDefinitions} from '@src/Components/Planner/Panels/Calculator/CalculatorTabDefinitions';
import {PlanSettingsActions} from '@src/Components/Planner/Panels/Calculator/PlanSettingsActions';
import {LoadFromSaveDialogComponent} from '@src/Components/Planner/Panels/Calculator/LoadFromSaveDialogComponent';
import {CalculatorByproductsTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Byproducts/CalculatorByproductsTabComponent';
import {CalculatorOptimisationTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Optimisation/CalculatorOptimisationTabComponent';
import {CalculatorOverclockingTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Overclocking/CalculatorOverclockingTabComponent';
import {CalculatorPowerTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Power/CalculatorPowerTabComponent';
import {CalculatorInputTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Input/CalculatorInputTabComponent';
import {CalculatorLogisticsTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Logistics/CalculatorLogisticsTabComponent';
import {CalculatorMachinesTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Machines/CalculatorMachinesTabComponent';
import {CalculatorProductionTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Production/CalculatorProductionTabComponent';
import {CalculatorRecipesTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Recipes/CalculatorRecipesTabComponent';
import {CalculatorResourcesTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Resources/CalculatorResourcesTabComponent';
import {CalculatorSinkTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Sink/CalculatorSinkTabComponent';
import {CalculatorSloopsTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Sloops/CalculatorSloopsTabComponent';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {CalculatorTabHotkeys} from '@src/Components/Planner/Panels/Calculator/CalculatorTabHotkeys';
import {HotkeyService} from '@src/Model/Hotkeys/HotkeyService';
import {NotificationService} from '@src/Model/NotificationService';
import {CalculationMode} from '@src/Model/Planner/CalculationMode';
import {Folder} from '@src/Model/Planner/Folder';
import {FolderGroupMode} from '@src/Model/Planner/FolderGroupMode';
import {Plan} from '@src/Model/Planner/Plan';
import {VersionManager} from '@src/Model/Data/VersionManager';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {MapPanelRequests} from '@src/Components/Map/MapPanelRequests';
import {PanelLayoutService} from '@src/Components/Planner/Panel/PanelLayoutService';
import {SettingsManager} from '@src/Model/Settings/SettingsManager';
import {PlanNameResolver} from '@src/Model/Planner/PlanNameResolver';
import {PlanSettings} from '@src/Model/Planner/PlanSettings';
import {SettingsGroup} from '@src/Model/Planner/SettingsGroup';
import {SettingsGroups} from '@src/Model/Planner/SettingsGroups';
import {ShareDialogService} from '@src/Components/Planner/Share/ShareDialogService';
import {AppFeatures} from '@src/Model/AppFeatures';
import {ActiveShareManager} from '@src/Model/Shares/ActiveShareManager';
import {ActivePlanLinkManager} from '@src/Model/PlanLinks/ActivePlanLinkManager';
import {AppPlatform} from '@src/Model/Desktop/AppPlatform';
import {CalculatorQuickStartComponent} from '@src/Components/Planner/Panels/Calculator/CalculatorQuickStartComponent';

@Component({
	selector: 'planner-calculator',
	templateUrl: './CalculatorComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [CalculatorQuickStartComponent, 
		BsDropdownModule,
		DatePipe,
		NgTemplateOutlet,
		HelpButtonComponent,
		CalculatorByproductsTabComponent,
		CalculatorInputTabComponent,
		CalculatorLogisticsTabComponent,
		CalculatorMachinesTabComponent,
		CalculatorOptimisationTabComponent,
		CalculatorOverclockingTabComponent,
		CalculatorPowerTabComponent,
		CalculatorProductionTabComponent,
		CalculatorRecipesTabComponent,
		CalculatorResourcesTabComponent,
		CalculatorSinkTabComponent,
		CalculatorSloopsTabComponent,
		FaIconComponent,
		InfoNoteComponent,
		LoadFromSaveDialogComponent,
		AppTooltipDirective,
		SupporterBadgeComponent,
	],
	styles: [`
		.req-controls {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 8px;
			padding: 8px 10px 0;
		}
		.req-controls .btn {
			white-space: nowrap;
		}
		@container panel (max-width: 560px) {
			.load-save-label {
				display: none;
			}
		}
		.calc-tabs-wrap {
			padding: 8px 10px 0;
		}
		.calc-tabs {
			--bs-nav-tabs-border-color: #6a7d91;
			--bs-nav-tabs-link-active-bg: #4a5d71;
			--bs-nav-tabs-link-active-color: #fff;
			--bs-nav-tabs-link-active-border-color: #6a7d91 #6a7d91 #4a5d71;
			--bs-nav-tabs-link-hover-border-color: #6a7d91 #6a7d91 transparent;
			gap: 2px;
		}
		.calc-tabs .nav-link {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 5px 12px;
			background: rgba(255, 255, 255, 0.04);
			border-color: #34495e #34495e transparent;
			color: #c5d0db;
			cursor: pointer;
			white-space: nowrap;
		}
		.calc-tabs .nav-link:hover {
			background: rgba(255, 255, 255, 0.08);
			color: #fff;
		}
		.calc-tabs .nav-link.active {
			font-weight: 600;
			box-shadow: inset 0 2px 0 var(--bs-primary);
		}
		.calc-tabs .nav-link.active fa-icon {
			color: var(--bs-primary);
		}
		.calc-tabs.icons .nav-link {
			padding: 5px 8px;
		}
		/* Natural-width copies of the strip, measured to pick the mode. */
		.calc-tabs.tab-measure {
			position: absolute;
			top: -9999px;
			left: 0;
			flex-wrap: nowrap;
			width: max-content;
			visibility: hidden;
			pointer-events: none;
		}
		.tab-badge {
			font-size: 0.7em;
			font-weight: 600;
			padding: 0.2em 0.45em;
			background: rgba(255, 255, 255, 0.14);
			color: #dfe6ee;
		}
		.nav-link.active .tab-badge,
		.calc-tab-select .tab-badge {
			background: rgba(var(--bs-primary-rgb), 0.35);
			color: #fff;
		}
		.calc-tabs-wrap.menu {
			margin-top: 6px;
			padding-top: 8px;
			border-top: 1px solid rgba(255, 255, 255, 0.08);
		}
		.calc-tab-select {
			background: #4a5d71;
			border-color: #6a7d91;
			color: #fff;
			font-weight: 600;
			padding: 0.45rem 0.75rem;
		}
		.calc-tab-select:hover,
		.calc-tab-select:focus {
			background: #33526f;
			border-color: #7a90a8;
			color: #fff;
		}
		.calc-tab-select .tab-select-icon {
			color: var(--bs-primary);
		}
	`],
})
export class CalculatorComponent implements OnDestroy
{

	private tabsResizeObserver: ResizeObserver | null = null;
	private tabsWrapElement: HTMLElement | null = null;
	private measureFullElement: HTMLElement | null = null;
	private measureIconsElement: HTMLElement | null = null;
	private readonly tabsModeSignal = signal<CalculatorTabsMode>('full');
	public readonly tabsMode: Signal<CalculatorTabsMode> = this.tabsModeSignal.asReadonly();

	public readonly faCopy = faCopy;
	public readonly faDownload = faDownload;
	public readonly faFileImport = faFileImport;
	public readonly faLock = faLock;
	public readonly faSliders = faSliders;
	public readonly faPlay = faPlay;
	public readonly faEye = faEye;
	public readonly faRotateLeft = faRotateLeft;
	public readonly faSitemap = faSitemap;
	public readonly faIndustry = faIndustry;
	public readonly faShareNodes = faShareNodes;
	public readonly faXmark = faXmark;
	public readonly faEllipsis = faEllipsis;

	/** Share links are hidden in this fork: co-op spaces replace them. */
	protected readonly features = AppFeatures;

	public readonly activeTab: Signal<CalculatorTab>;

	public readonly badges: Signal<ReadonlyMap<CalculatorTab, string | null>>;

	public readonly tabs: readonly CalculatorTabDefinition[] = CalculatorTabDefinitions.ALL;

	public readonly mainTabs: Signal<readonly CalculatorTabDefinition[]>;

	public readonly moreTabs: Signal<readonly CalculatorTabDefinition[]>;

	public readonly moreTabActive: Signal<boolean>;

	/** Shared with the planner's top bar, so both calculate buttons always agree. */
	public readonly run: CalculatorRunControls;

	public readonly modeOptions: readonly CalculationModeOption[];

	public readonly activePlan: Signal<Plan | null>;
	public readonly activePlanLocal: Signal<boolean>;
	public readonly activeFolder: Signal<Folder | null>;
	public readonly mode: Signal<CalculationMode>;
	public readonly graphDirty: Signal<boolean>;
	public readonly buttonLabel: Signal<string>;
	public readonly calculateHint: Signal<string>;
	public readonly hasGraph: Signal<boolean>;

	public readonly mapAvailable: Signal<boolean> = computed(() => {
		const data = this.versionManager.activeVersionData();
		return data !== null && data.mapId !== null && data.worldNodesPath !== null;
	});

	public readonly folderHasCustomSettings: Signal<boolean>;

	public readonly parentLabel: Signal<string>;

	private readonly planSettings: PlanSettingsActions;

	public readonly modeLabel: Signal<string>;

	public readonly fixedFolder: Signal<Folder | null>;

	public readonly fixedGroups: Signal<readonly SettingsGroup[]>;

	public readonly allGroupsFixed: Signal<boolean>;

	public readonly customSettingsBlocker: Signal<string | null>;

	public readonly fixGroupsBlocker: Signal<string | null>;

	public readonly innerPlans: Signal<Plan[]>;

	public readonly outdatedPlans: Signal<Plan[]>;

	public readonly skippedOutdatedPlans: Signal<Plan[]>;

	public readonly recalculationProgress: Signal<FolderRecalculationProgress | null>;

	public readonly loadFromSave: Signal<{name: string} | null>;

	public constructor(
		private readonly planManager: PlanManager,
		public readonly planNames: PlanNameResolver,
		protected readonly platform: AppPlatform,
		private readonly notifications: NotificationService,
		public readonly actions: PlannerActionsService,
		public readonly hotkeys: HotkeyService,
		public readonly activeShare: ActiveShareManager,
		public readonly shareDialog: ShareDialogService,
		public readonly planLink: ActivePlanLinkManager,
		private readonly folderRecalculation: FolderRecalculationService,
		private readonly tabState: CalculatorTabStateService,
		private readonly badgeResolver: CalculatorTabBadgeResolver,
		private readonly versionManager: VersionManager,
		private readonly settingsManager: SettingsManager,
		public readonly panelLayout: PanelLayoutService,
		private readonly mapPanelRequests: MapPanelRequests,
	)
	{
		this.activeTab = tabState.activeTab;
		// Reading the preference here re-runs updateTabsMode on a change even when nothing resized.
		this.moreTabs = computed(() => {
			const planner = this.settingsManager.planner();
			return planner.groupTabs ? this.tabs.filter(tab => planner.moreTabs.includes(tab.id)) : [];
		});
		this.mainTabs = computed(() => this.tabs.filter(tab => !this.moreTabs().includes(tab)));
		this.moreTabActive = computed(() => this.moreTabs().some(tab => tab.id === this.activeTab()));
		effect(() => {
			this.settingsManager.planner().tabLabels;
			this.moreTabs();
			this.updateTabsMode();
		});
		this.badges = computed(() => {
			const badges = new Map<CalculatorTab, string | null>();
			if (!this.settingsManager.planner().tabBadges) {
				return badges;
			}
			const plan = this.planManager.activePlan();
			const settings = this.planManager.activeSettings();
			const data = this.versionManager.activeVersionData();
			this.tabs.forEach(tab => badges.set(tab.id, this.badgeResolver.badge(tab.id, plan, settings, data)));
			return badges;
		});
		// The plan and folder actions live in PlanSettingsActions so the plan panel cannot drift from this header.
		this.planSettings = new PlanSettingsActions(planManager, planNames, notifications, folderRecalculation);
		this.fixedFolder = this.planSettings.fixedFolder;
		this.fixedGroups = this.planSettings.fixedGroups;
		this.allGroupsFixed = this.planSettings.allGroupsFixed;
		this.customSettingsBlocker = this.planSettings.customSettingsBlocker;
		this.fixGroupsBlocker = this.planSettings.fixGroupsBlocker;
		this.innerPlans = this.planSettings.innerPlans;
		this.outdatedPlans = this.planSettings.outdatedPlans;
		this.skippedOutdatedPlans = this.planSettings.skippedOutdatedPlans;
		this.recalculationProgress = this.planSettings.recalculationProgress;
		this.folderHasCustomSettings = this.planSettings.folderHasCustomSettings;
		this.parentLabel = this.planSettings.parentLabel;
		this.loadFromSave = this.planSettings.loadFromSave;

		this.activePlan = planManager.activePlan;
		this.activePlanLocal = planManager.activePlanLocal;
		this.activeFolder = planManager.activeFolder;
		this.graphDirty = planManager.activePlanGraphDirty;
		this.run = new CalculatorRunControls(planManager, actions);
		this.modeOptions = this.run.modeOptions;
		this.mode = this.run.mode;
		this.modeLabel = this.run.modeLabel;
		this.buttonLabel = this.run.buttonLabel;
		this.hasGraph = computed(() => (this.activePlan()?.graph?.nodes.length ?? 0) > 0);
		this.calculateHint = this.run.calculateHint;
	}

	/** The strip exists only while a plan or folder is selected, so the observers re-attach as the elements come and go. */
	@ViewChild('tabsWrap')
	private set tabsWrap(element: ElementRef<HTMLElement> | undefined)
	{
		this.tabsWrapElement = element?.nativeElement ?? null;
		this.observeTabs();
	}

	@ViewChild('measureFull')
	private set measureFull(element: ElementRef<HTMLElement> | undefined)
	{
		this.measureFullElement = element?.nativeElement ?? null;
		this.observeTabs();
	}

	@ViewChild('measureIcons')
	private set measureIcons(element: ElementRef<HTMLElement> | undefined)
	{
		this.measureIconsElement = element?.nativeElement ?? null;
		this.observeTabs();
	}

	public ngOnDestroy(): void
	{
		this.tabsResizeObserver?.disconnect();
	}

	private observeTabs(): void
	{
		this.tabsResizeObserver?.disconnect();
		this.tabsResizeObserver = null;
		const elements = [this.tabsWrapElement, this.measureFullElement, this.measureIconsElement];
		if (elements.some(element => element === null) || typeof ResizeObserver === 'undefined') {
			return;
		}
		// Firefox has fired this while a computed was mid-evaluation, where the signal write throws NG0600.
		this.tabsResizeObserver = new ResizeObserver(() => untracked(() => this.updateTabsMode()));
		elements.forEach(element => this.tabsResizeObserver?.observe(element as HTMLElement));
		this.updateTabsMode();
	}

	private updateTabsMode(): void
	{
		const wrap = this.tabsWrapElement;
		const full = this.measureFullElement;
		const icons = this.measureIconsElement;
		if (!wrap || !full || !icons) {
			return;
		}
		// A couple of pixels of slack keep sub-pixel rounding from wrapping the last tab.
		const style = getComputedStyle(wrap);
		const available = wrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
		const preference = this.settingsManager.planner().tabLabels;
		// When not even the icon strip fits, every preference ends in the dropdown.
		if (icons.scrollWidth > available) {
			this.tabsModeSignal.set('menu');
			return;
		}
		if (preference === 'labels' || (preference === 'auto' && full.scrollWidth <= available)) {
			this.tabsModeSignal.set('full');
			return;
		}
		this.tabsModeSignal.set('icons');
	}

	private static readonly TAB_HELP_TOPICS: Record<CalculatorTab, HelpTopicId> = {
		request: 'request.production',
		resources: 'request.resources',
		recipes: 'request.recipes',
		machines: 'request.machines',
		input: 'request.input',
		byproducts: 'request.byproducts',
		power: 'request.power',
		sink: 'request.sink',
		sloops: 'request.sloops',
		logistics: 'request.logistics',
		overclocking: 'request.overclocking',
		optimisation: 'request.optimisation',
	};

	public activeTabHelpTopic(): HelpTopicId
	{
		return CalculatorComponent.TAB_HELP_TOPICS[this.activeTab()];
	}

	public get activeTabDefinition(): CalculatorTabDefinition
	{
		return this.tabs.find(tab => tab.id === this.activeTab()) ?? this.tabs[0];
	}

	public setTab(tab: CalculatorTab): void
	{
		this.tabState.setActiveTab(tab);
	}

	public addLocalPlanToMyPlans(plan: Plan): void
	{
		this.planManager.moveLocalToAccount(plan.id, 'plan');
		this.notifications.showSuccess('Moved to your plans.');
	}

	public addShareToMyPlans(): void
	{
		const share = this.activeShare.payload();
		if (share !== null) {
			this.activeShare.addToMyPlans(share.share);
		}
	}

	public openFactorySites(): void
	{
		this.mapPanelRequests.request('sites');
		this.panelLayout.focusPanel('map');
	}

	public relayout(): void
	{
		this.actions.requestRelayout();
	}

	public setMode(mode: CalculationMode): void
	{
		this.run.setMode(mode);
	}

	public calculate(): void
	{
		this.run.calculate();
	}

	public cancel(): void
	{
		this.run.cancel();
	}

	public resetSettings(): void
	{
		this.planSettings.resetSettings();
	}

	public inheritSettings(): void
	{
		this.planSettings.inheritSettings();
	}

	public enableFolderSettings(): void
	{
		this.planSettings.enableFolderSettings();
	}

	public disableFolderSettings(): void
	{
		this.planSettings.disableFolderSettings();
	}

	public openLoadFromSave(): void
	{
		this.planSettings.openLoadFromSave();
	}

	/** Applied to the settings as they are now: loading the map's part may have just counted a resource area again. */
	public onLoadFromSaveApply(patch: Partial<PlanSettings> | null): void
	{
		this.planSettings.onLoadFromSaveApply(patch);
	}

	public closeLoadFromSave(): void
	{
		this.planSettings.closeLoadFromSave();
	}

	public isGroupTab(tab: CalculatorTab): tab is SettingsGroup
	{
		return (SettingsGroups.all as readonly string[]).includes(tab);
	}

	public isFixedTab(tab: CalculatorTab): boolean
	{
		return this.isGroupTab(tab) && this.fixedGroups().includes(tab);
	}

	public groupLabel(group: SettingsGroup): string
	{
		return this.planSettings.groupLabel(group);
	}

	/** The name is repeated even when the tab shows it: the tooltip is what carries the tab's hotkey. */
	public tabTooltip(tab: CalculatorTabDefinition, locks: boolean): string
	{
		const parts: string[] = [tab.label + this.hotkeys.suffix(CalculatorTabHotkeys.actionFor(tab.id))];
		if (locks && this.isFixedTab(tab.id)) {
			parts.push(this.fixedTabTooltip(tab.id));
		}
		return parts.join(' - ');
	}

	public moreTooltip(): string
	{
		if (this.moreTabActive()) {
			return this.tabTooltip(this.activeTabDefinition, false);
		}
		return 'More tabs';
	}

	public fixedTabTooltip(tab: CalculatorTab): string
	{
		const folder = this.fixedFolder();
		if (!folder || !this.isGroupTab(tab)) {
			return '';
		}
		const pool = tab === 'resources' && folder.resourcePool ? ' (shared pool)' : '';
		return `Locked by folder "${folder.name}"${pool}`;
	}

	public groupMode(group: SettingsGroup): FolderGroupMode
	{
		return this.planSettings.groupMode(group);
	}

	public setGroupMode(group: SettingsGroup, mode: FolderGroupMode): void
	{
		this.planSettings.setGroupMode(group, mode);
	}

	public fixedGroupsSummary(): string
	{
		return this.planSettings.fixedGroupsSummary();
	}

	public openFixedFolder(): void
	{
		this.planSettings.openFixedFolder();
	}

	public recalculateFolder(): void
	{
		this.planSettings.recalculateFolder();
	}

	public cancelFolderRecalculation(): void
	{
		this.planSettings.cancelFolderRecalculation();
	}

	public createPlanInFolder(): void
	{
		const folder = this.activeFolder();
		if (folder) {
			const plan = this.planManager.createPlan('', folder.id);
			this.planManager.setActivePlan(plan.id);
		}
	}

}
