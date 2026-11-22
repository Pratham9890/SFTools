import {computed, Injectable, Signal, signal, Type} from '@angular/core';
import {CalculatorTabStateService} from '@src/Components/Planner/Panels/Calculator/CalculatorTabStateService';
import {CALCULATOR_DOCK_IDS, PlannerDockApi, calculatorTabOfDockId, dockIdForPanel} from '@src/Components/Planner/Dock/PlannerDockApi';
import {Folder} from '@src/Model/Planner/Folder';
import {SettingsGroup} from '@src/Model/Planner/SettingsGroup';
import {SettingsGroups} from '@src/Model/Planner/SettingsGroups';
import {CalculatorByproductsTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Byproducts/CalculatorByproductsTabComponent';
import {CalculatorInputTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Input/CalculatorInputTabComponent';
import {CalculatorLogisticsTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Logistics/CalculatorLogisticsTabComponent';
import {CalculatorMachinesTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Machines/CalculatorMachinesTabComponent';
import {CalculatorOptimisationTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Optimisation/CalculatorOptimisationTabComponent';
import {CalculatorOverclockingTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Overclocking/CalculatorOverclockingTabComponent';
import {CalculatorPowerTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Power/CalculatorPowerTabComponent';
import {CalculatorProductionTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Production/CalculatorProductionTabComponent';
import {CalculatorRecipesTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Recipes/CalculatorRecipesTabComponent';
import {CalculatorResourcesTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Resources/CalculatorResourcesTabComponent';
import {CalculatorSinkTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Sink/CalculatorSinkTabComponent';
import {CalculatorSloopsTabComponent} from '@src/Components/Planner/Panels/Calculator/Tabs/Sloops/CalculatorSloopsTabComponent';
import {CalculatorQuickStartComponent} from '@src/Components/Planner/Panels/Calculator/CalculatorQuickStartComponent';
import {CalculatorComponent} from '@src/Components/Planner/Panels/Calculator/CalculatorComponent';
import {PlannerBuildCostComponent} from '@src/Components/Planner/Panels/BuildCost/PlannerBuildCostComponent';
import {PlannerCodexComponent} from '@src/Components/Planner/Panels/Codex/PlannerCodexComponent';
import {PlannerCoopComponent} from '@src/Components/Planner/Panels/Coop/PlannerCoopComponent';
import {PlannerHelpComponent} from '@src/Components/Planner/Panels/Help/PlannerHelpComponent';
import {PlannerInspectorComponent} from '@src/Components/Planner/Panels/Inspector/PlannerInspectorComponent';
import {PlannerItemsComponent} from '@src/Components/Planner/Panels/Items/PlannerItemsComponent';
import {PlannerMapComponent} from '@src/Components/Planner/Panels/Map/PlannerMapComponent';
import {PlannerOverviewComponent} from '@src/Components/Planner/Panels/Overview/PlannerOverviewComponent';
import {PlanPanelComponent} from '@src/Components/Planner/PlanPanel/PlanPanelComponent';
import {PlannerPowerComponent} from '@src/Components/Planner/Panels/Power/PlannerPowerComponent';
import {PlannerSettingsComponent} from '@src/Components/Planner/Panels/Settings/PlannerSettingsComponent';
import {SettingsSheetService} from '@src/Components/Planner/SettingsSheet/SettingsSheetService';
import {HelpTopicId} from '@src/Model/Help/HelpTopicId';
import {PlanManager} from '@src/Model/Planner/PlanManager';

/** How the top bar groups an entry: the six tabs, the More menu's two groups, or something opened from elsewhere. */
export type PlannerDockGroup = 'tab' | 'more' | 'more-view' | 'hidden';

export interface PlannerDockEntry
{
	readonly id: string;
	readonly label: string;
	readonly component: Type<unknown>;
	readonly group: PlannerDockGroup;
	readonly helpTopic?: HelpTopicId;
	readonly help?: string;
}

/**
 * The planner's one drop-down panel: which entry is open, and how tall it is so zoom and fit can keep clear of it.
 * Registered in the planner because every entry belongs to the planner's plan, folder and actions.
 */
@Injectable()
export class PlannerDockService implements PlannerDockApi
{

	public readonly entries: readonly PlannerDockEntry[] = [
		{id: 'produce', label: 'Produce', component: CalculatorProductionTabComponent, group: 'tab', helpTopic: 'request.production', help: 'What this plan makes.'},
		{id: 'recipes', label: 'Recipes', component: CalculatorRecipesTabComponent, group: 'tab', helpTopic: 'request.recipes', help: 'Untick a recipe to stop the plan using it.'},
		{id: 'resources', label: 'Resources', component: CalculatorResourcesTabComponent, group: 'tab', helpTopic: 'request.resources', help: 'Which raw resources the plan may mine, how much, and how much each one costs.'},
		{id: 'supply', label: 'Supply', component: CalculatorInputTabComponent, group: 'tab', helpTopic: 'request.input', help: 'Parts you already make in another factory. The plan uses up to this much before making its own.'},
		{id: 'belts', label: 'Belts', component: CalculatorLogisticsTabComponent, group: 'tab', helpTopic: 'request.logistics', help: 'Belt and pipe limits, and splitting the plan into lines.'},
		{id: 'materials', label: 'Materials', component: PlannerBuildCostComponent, group: 'tab', helpTopic: 'panel.build-cost', help: 'What to bring to build this plan.'},

		{id: 'generators', label: 'Power generators', component: CalculatorPowerTabComponent, group: 'more', helpTopic: 'request.power', help: 'Generators the plan may use when you ask it to produce power.'},
		{id: 'clock', label: 'Clock speed and power shards', component: CalculatorOverclockingTabComponent, group: 'more', helpTopic: 'request.overclocking', help: 'Clock speeds for the whole plan, per recipe, per machine and per generator.'},
		{id: 'sloops', label: 'Somersloops', component: CalculatorSloopsTabComponent, group: 'more', helpTopic: 'request.sloops', help: 'Somersloops the calculation may put into machines.'},
		{id: 'sink', label: 'AWESOME Sink', component: CalculatorSinkTabComponent, group: 'more', helpTopic: 'request.sink', help: 'Items that can go into the AWESOME Sink instead of being left over.'},
		{id: 'byproducts', label: 'Byproducts', component: CalculatorByproductsTabComponent, group: 'more', helpTopic: 'request.byproducts', help: 'Unticked items must be fully used up inside the factory.'},
		{id: 'machines', label: 'Machines', component: CalculatorMachinesTabComponent, group: 'more', helpTopic: 'request.machines', help: 'Untick a machine to stop the plan using it.'},
		{id: 'optimisation', label: 'Optimisation', component: CalculatorOptimisationTabComponent, group: 'more', helpTopic: 'request.optimisation', help: 'The calculation keeps the total cost of the ticked goals as low as possible.'},

		{id: 'overview', label: 'Overview', component: PlannerOverviewComponent, group: 'more-view', helpTopic: 'panel.overview', help: 'Totals for this plan.'},
		{id: 'items', label: 'Items', component: PlannerItemsComponent, group: 'more-view', helpTopic: 'panel.items', help: 'Where every item comes from and where it goes.'},
		{id: 'power-use', label: 'Power use', component: PlannerPowerComponent, group: 'more-view', helpTopic: 'panel.power', help: 'Power used by each building type.'},
		{id: 'codex', label: 'Codex', component: PlannerCodexComponent, group: 'more-view', helpTopic: 'panel.codex', help: 'Item, recipe and building details.'},
		{id: 'map', label: 'Map', component: PlannerMapComponent, group: 'more-view', helpTopic: 'panel.map', help: 'Where the factory stands and what is nearby.'},
		{id: 'help', label: 'Help', component: PlannerHelpComponent, group: 'more-view', helpTopic: 'panel.help', help: 'How the planner works.'},

		{id: 'plans', label: 'Plans', component: PlanPanelComponent, group: 'hidden', helpTopic: 'panel.plans', help: 'Open a plan, or start a new one.'},
		{id: 'block', label: 'Block details', component: PlannerInspectorComponent, group: 'hidden', helpTopic: 'panel.inspector', help: 'Click a block, then change its machines, clocks and resource nodes here.'},
		{id: 'coop', label: 'Co-op', component: PlannerCoopComponent, group: 'hidden', help: 'Who builds what.'},
		{id: 'settings', label: 'Settings', component: PlannerSettingsComponent, group: 'hidden', helpTopic: 'panel.settings', help: 'Planner settings: layout, belt limits and the rest.'},
		// The old full calculator, kept reachable while its Settings menu and folder actions await a new home.
		{id: 'plan-settings', label: 'Plan settings', component: CalculatorComponent, group: 'hidden', helpTopic: 'panel.calculator', help: 'Settings, load from save and folder actions for this plan.'},
	];

	public readonly moreEntries = this.entries.filter(entry => entry.group === 'more');
	public readonly moreViewEntries = this.entries.filter(entry => entry.group === 'more-view');
	private readonly openIdSignal = signal<string | null>(null);
	public readonly openId: Signal<string | null> = this.openIdSignal.asReadonly();

	private readonly heightSignal = signal(0);
	/** Measured height in px of the dock and any banner above it; 0 when nothing is open. */
	public readonly height: Signal<number> = this.heightSignal.asReadonly();

	public readonly entry: Signal<PlannerDockEntry | null> = computed(() => {
		const id = this.openIdSignal();
		return id === null ? null : this.entries.find(candidate => candidate.id === id) ?? null;
	});

	/**
	 * Produce normally shows just today's request rows, but some states need the old full calculator's wrapper:
	 * nothing selected (its item picker starts the first plan), a folder selected (its default-settings and
	 * recalculate-plans actions), and a plan that isn't the user's own (its read-only notice and Add to my plans).
	 * The same read-only rule covers every calculator tab: those editors were never reachable on such a plan,
	 * and one strip of settings would let the user change a plan the planner refuses to edit.
	 */
	public readonly component: Signal<Type<unknown> | null> = computed(() => {
		const entry = this.entry();
		if (entry === null) {
			return null;
		}
		if (calculatorTabOfDockId(entry.id) !== null && this.planManager.activePlanReadOnly()) {
			return CalculatorComponent;
		}
		if (entry.id === 'produce' && this.planManager.activePlan() === null) {
			return this.planManager.activeFolder() === null ? CalculatorQuickStartComponent : CalculatorComponent;
		}
		return entry.component;
	});

	public constructor(
		private readonly planManager: PlanManager,
		private readonly calculatorTabs: CalculatorTabStateService,
		private readonly settingsSheet: SettingsSheetService,
	)
	{
	}

	/**
	 * The old full calculator disabled a tab's controls while the plan's folder fixed its group. Each tab now lives
	 * in its own dock entry, so the same guard is applied there, or a fixed setting would look editable.
	 */
	public readonly folderFixed = computed<Folder | null>(() => {
		const id = this.openIdSignal();
		const tab = id === null ? null : calculatorTabOfDockId(id);
		if (tab === null || !(SettingsGroups.all as readonly string[]).includes(tab)) {
			return null;
		}
		const plan = this.planManager.activePlan();
		if (plan === null || this.planManager.activePlanReadOnly()) {
			return null;
		}
		const folder = this.planManager.fixedFolderOf(plan);
		return folder !== null && folder.fixedGroups.includes(tab as SettingsGroup) ? folder : null;
	});

	/** Called by the dock after the entry is shown, so the shared tab state follows the visible panel. */
	public syncCalculatorTab(): void
	{
		const id = this.openIdSignal();
		const tab = id === null ? null : calculatorTabOfDockId(id);
		if (tab !== null && this.calculatorTabs.activeTab() !== tab) {
			this.calculatorTabs.setActiveTab(tab);
		}
	}

	public open(id: string): void
	{
		if (!this.entries.some(entry => entry.id === id)) {
			return;
		}
		// Settings lives in the sheet now; this keeps any caller that opens the dock entry landing there.
		if (id === 'settings') {
			this.close();
			this.settingsSheet.open();
			return;
		}
		// A dock panel and the settings sheet would cover each other, so opening one closes the other.
		this.settingsSheet.close();
		this.openIdSignal.set(id);
		this.syncCalculatorTab();
	}

	public toggle(id: string): void
	{
		if (id === 'settings') {
			this.settingsSheet.toggle();
			return;
		}
		if (this.openIdSignal() === id) {
			this.close();
			return;
		}
		this.open(id);
	}

	public close(): void
	{
		this.openIdSignal.set(null);
		this.heightSignal.set(0);
	}

	/** Called by the dock after it has laid out; the value is 0 once both the dock and its banner are gone. */
	public setHeight(height: number): void
	{
		this.heightSignal.set(Math.max(0, Math.round(height)));
	}

	public isOpen(id: string): boolean
	{
		// The rail's wrench and the panel layout ask through here, so the sheet reports the same state.
		if (id === 'settings') {
			return this.settingsSheet.isOpen();
		}
		return this.openIdSignal() === id;
	}

	/** The dock entry for a rail panel id, using the calculator tab that is active right now. */
	public dockIdForPanel(panelId: string): string
	{
		return dockIdForPanel(panelId, this.calculatorTabs.activeTab());
	}

}