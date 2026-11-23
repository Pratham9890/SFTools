import {Component, ChangeDetectionStrategy, Input, inject, signal} from '@angular/core';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {IconDefinition, faChevronDown, faChevronRight, faRotateLeft} from '@fortawesome/free-solid-svg-icons';
import {AppTooltipDirective} from '@src/Components/Common/AppTooltipDirective';
import {SETTINGS_FOLD} from '@src/Components/Settings/SettingsFold';
import {HelpButtonComponent} from '@src/Components/Help/HelpButtonComponent';
import {HelpTopicId} from '@src/Model/Help/HelpTopicId';
import {SettingsCategory} from '@src/Model/Settings/SettingsCategory';
import {SettingsManager} from '@src/Model/Settings/SettingsManager';

@Component({
	selector: 'settings-section',
	templateUrl: './SettingsSectionComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [AppTooltipDirective, FaIconComponent, HelpButtonComponent],
	// The title input would otherwise stay on the host as a native title attribute and tooltip the whole card.
	host: {'[attr.title]': 'null'},
	styles: [`
		:host {
			display: block;
		}
		.section-reset {
			white-space: nowrap;
		}
		.section-fold {
			border: 0;
			padding: 0;
			background: none;
			color: inherit;
			flex: none;
		}
		.card-header:has(.section-fold) {
			position: relative;
		}
		/* The whole header folds the section; the help and reset buttons stay above it. */
		.section-fold::after {
			content: '';
			position: absolute;
			inset: 0;
		}
		help-button, .section-reset {
			position: relative;
			z-index: 1;
		}
		.section-icon {
			width: 1.75rem;
			height: 1.75rem;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			color: var(--bs-primary);
			font-size: 0.85rem;
			flex-shrink: 0;
		}
	`],
})
export class SettingsSectionComponent
{

	@Input({required: true}) public title = '';
	@Input({required: true}) public icon!: IconDefinition;
	@Input() public description = '';

	@Input() public helpTopic: HelpTopicId | '' = '';

	@Input() public resetCategories: readonly SettingsCategory[] = [];

	/** Added to the confirmation when a reset reaches further than this page. */
	@Input() public resetWarning = '';

	/** The chart section has folding groups of its own. */
	@Input() public foldable = true;

	public readonly faRotateLeft = faRotateLeft;
	public readonly faChevronDown = faChevronDown;
	public readonly faChevronRight = faChevronRight;

	private readonly inSheet = inject(SETTINGS_FOLD, {optional: true}) !== null;
	private readonly unfolded = signal(false);

	public constructor(private readonly settings: SettingsManager)
	{
	}

	public get folds(): boolean
	{
		return this.inSheet && this.foldable;
	}

	public get isOpen(): boolean
	{
		return !this.folds || this.unfolded();
	}

	public toggle(): void
	{
		this.unfolded.update(open => !open);
	}

	public get isDefault(): boolean
	{
		return this.settings.isDefault(this.resetCategories);
	}

	public reset(): void
	{
		const message = `Reset all "${this.title}" settings to their defaults?` + (this.resetWarning !== '' ? `\n\n${this.resetWarning}` : '');
		if (confirm(message)) {
			this.settings.reset(this.resetCategories);
		}
	}

}
