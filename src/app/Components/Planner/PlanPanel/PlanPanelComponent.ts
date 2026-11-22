import {ChangeDetectionStrategy, Component, computed, signal, Signal} from '@angular/core';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faCopy, faFileImport, faIndustry, faLock, faPlay, faRotateLeft, faSliders, faXmark} from '@fortawesome/free-solid-svg-icons';
import {BsDropdownModule} from 'ngx-bootstrap/dropdown';
import {AppTooltipDirective} from '@src/Components/Common/AppTooltipDirective';
import {InfoNoteComponent} from '@src/Components/Common/InfoNoteComponent';
import {CalculationModeOption} from '@src/Components/Planner/Panels/Calculator/CalculationModeOption';
import {CalculatorRunControls} from '@src/Components/Planner/Panels/Calculator/CalculatorRunControls';
import {LoadFromSaveDialogComponent} from '@src/Components/Planner/Panels/Calculator/LoadFromSaveDialogComponent';
import {PlanSettingsActions} from '@src/Components/Planner/Panels/Calculator/PlanSettingsActions';
import {FolderRecalculationProgress} from '@src/Components/Planner/FolderRecalculationProgress';
import {FolderRecalculationService} from '@src/Components/Planner/FolderRecalculationService';
import {MapPanelRequests} from '@src/Components/Map/MapPanelRequests';
import {PanelLayoutService} from '@src/Components/Planner/Panel/PanelLayoutService';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {PlannerPlansComponent} from '@src/Components/Planner/Panels/Plans/PlannerPlansComponent';
import {CalculationMode} from '@src/Model/Planner/CalculationMode';
import {Folder} from '@src/Model/Planner/Folder';
import {FolderGroupMode} from '@src/Model/Planner/FolderGroupMode';
import {NotificationService} from '@src/Model/NotificationService';
import {Plan} from '@src/Model/Planner/Plan';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {PlanNameResolver} from '@src/Model/Planner/PlanNameResolver';
import {PlanSettings} from '@src/Model/Planner/PlanSettings';
import {SettingsGroup} from '@src/Model/Planner/SettingsGroup';
import {SettingsGroups} from '@src/Model/Planner/SettingsGroups';
import {VersionManager} from '@src/Model/Data/VersionManager';

/**
 * The plan name's panel: today's Plans tree, with the plan- and folder-level actions that used to sit in the old
 * full calculator's header along the top. Opened from the top bar; the actions themselves live in PlanSettingsActions.
 */
@Component({
	selector: 'planner-plan-panel',
	templateUrl: './PlanPanelComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [BsDropdownModule, FaIconComponent, InfoNoteComponent, LoadFromSaveDialogComponent, AppTooltipDirective, PlannerPlansComponent],
})
export class PlanPanelComponent
{

	public readonly faCopy = faCopy;
	public readonly faFileImport = faFileImport;
	public readonly faIndustry = faIndustry;
	public readonly faLock = faLock;
	public readonly faPlay = faPlay;
	public readonly faRotateLeft = faRotateLeft;
	public readonly faSliders = faSliders;
	public readonly faXmark = faXmark;

	public readonly groups: readonly SettingsGroup[] = SettingsGroups.all;

	/** Which group the folder settings row is showing; the old calculator showed it per tab, the panel picks one. */
	private readonly activeGroupSignal = signal<SettingsGroup>('recipes');
	public readonly activeGroup: Signal<SettingsGroup> = this.activeGroupSignal.asReadonly();

	public readonly actions: PlannerActionsService;

	public readonly activePlan: Signal<Plan | null>;
	public readonly activeFolder: Signal<Folder | null>;
	public readonly hasGraph: Signal<boolean>;
	public readonly modeOptions: readonly CalculationModeOption[];
	public readonly mode: Signal<CalculationMode>;
	public readonly modeLabel: Signal<string>;
	public readonly mapAvailable: Signal<boolean>;

	public readonly fixedFolder: Signal<Folder | null>;
	public readonly allGroupsFixed: Signal<boolean>;
	public readonly parentLabel: Signal<string>;
	public readonly folderHasCustomSettings: Signal<boolean>;
	public readonly customSettingsBlocker: Signal<string | null>;
	public readonly fixGroupsBlocker: Signal<string | null>;
	public readonly innerPlans: Signal<Plan[]>;
	public readonly outdatedPlans: Signal<Plan[]>;
	public readonly skippedOutdatedPlans: Signal<Plan[]>;
	public readonly recalculationProgress: Signal<FolderRecalculationProgress | null>;
	public readonly loadFromSave: Signal<{name: string} | null>;

	private readonly settings: PlanSettingsActions;
	private readonly run: CalculatorRunControls;

	public constructor(
		private readonly planManager: PlanManager,
		planNames: PlanNameResolver,
		notifications: NotificationService,
		folderRecalculation: FolderRecalculationService,
		private readonly versionManager: VersionManager,
		private readonly mapPanelRequests: MapPanelRequests,
		private readonly panelLayout: PanelLayoutService,
		actions: PlannerActionsService,
	)
	{
		this.actions = actions;
		this.settings = new PlanSettingsActions(planManager, planNames, notifications, folderRecalculation);
		this.run = new CalculatorRunControls(planManager, actions);

		this.activePlan = planManager.activePlan;
		this.activeFolder = planManager.activeFolder;
		this.hasGraph = computed(() => (this.activePlan()?.graph?.nodes.length ?? 0) > 0);
		this.modeOptions = this.run.modeOptions;
		this.mode = this.run.mode;
		this.modeLabel = this.run.modeLabel;
		this.mapAvailable = computed(() => {
			const data = this.versionManager.activeVersionData();
			return data !== null && data.mapId !== null && data.worldNodesPath !== null;
		});

		this.fixedFolder = this.settings.fixedFolder;
		this.allGroupsFixed = this.settings.allGroupsFixed;
		this.parentLabel = this.settings.parentLabel;
		this.folderHasCustomSettings = this.settings.folderHasCustomSettings;
		this.customSettingsBlocker = this.settings.customSettingsBlocker;
		this.fixGroupsBlocker = this.settings.fixGroupsBlocker;
		this.innerPlans = this.settings.innerPlans;
		this.outdatedPlans = this.settings.outdatedPlans;
		this.skippedOutdatedPlans = this.settings.skippedOutdatedPlans;
		this.recalculationProgress = this.settings.recalculationProgress;
		this.loadFromSave = this.settings.loadFromSave;
	}

	public resetSettings(): void
	{
		this.settings.resetSettings();
	}

	public inheritSettings(): void
	{
		this.settings.inheritSettings();
	}

	public enableFolderSettings(): void
	{
		this.settings.enableFolderSettings();
	}

	public disableFolderSettings(): void
	{
		this.settings.disableFolderSettings();
	}

	public openLoadFromSave(): void
	{
		this.settings.openLoadFromSave();
	}

	public onLoadFromSaveApply(patch: Partial<PlanSettings> | null): void
	{
		this.settings.onLoadFromSaveApply(patch);
	}

	public closeLoadFromSave(): void
	{
		this.settings.closeLoadFromSave();
	}

	public openFactorySites(): void
	{
		this.mapPanelRequests.request('sites');
		this.panelLayout.focusPanel('map');
	}

	public setMode(mode: CalculationMode): void
	{
		this.run.setMode(mode);
	}

	public groupMode(group: SettingsGroup): FolderGroupMode
	{
		return this.settings.groupMode(group);
	}

	public setGroup(group: SettingsGroup): void
	{
		this.activeGroupSignal.set(group);
	}

	public setGroupMode(group: SettingsGroup, mode: FolderGroupMode): void
	{
		this.settings.setGroupMode(group, mode);
	}

	public groupLabel(group: SettingsGroup): string
	{
		return this.settings.groupLabel(group);
	}

	public fixedGroupsSummary(): string
	{
		return this.settings.fixedGroupsSummary();
	}

	public recalculateFolder(): void
	{
		this.settings.recalculateFolder();
	}

	public cancelFolderRecalculation(): void
	{
		this.settings.cancelFolderRecalculation();
	}

	public openFixedFolder(): void
	{
		this.settings.openFixedFolder();
	}

}
