import {Component, ChangeDetectionStrategy} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {faXmark} from '@fortawesome/free-solid-svg-icons';
import {SignInPromptDialogComponent} from '@src/Components/Auth/SignInPromptDialogComponent';
import {SupporterWelcomeDialogComponent} from '@src/Components/Supporters/SupporterWelcomeDialogComponent';
import {NavbarComponent} from '@src/Components/Root/NavbarComponent';
import {SettingsConflictDialogComponent} from '@src/Components/Settings/SettingsConflictDialogComponent';
import {AppFeatures} from '@src/Model/AppFeatures';
import {ServerStatusService} from '@src/Model/API/ServerStatusService';
import {HelpManager} from '@src/Model/Help/HelpManager';
import {NotificationService} from '@src/Model/NotificationService';

@Component({
	templateUrl: './ContentComponent.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	imports: [
		FaIconComponent,
		RouterOutlet,
		NavbarComponent,
		SettingsConflictDialogComponent,
		SignInPromptDialogComponent,
		SupporterWelcomeDialogComponent,
	],
})
export class ContentComponent
{

	public readonly faXmark = faXmark;

	/** No "sign in to do X" prompt without accounts: this fork uses co-op spaces instead. */
	protected readonly features = AppFeatures;

	public constructor(
		public readonly notifications: NotificationService,
		public readonly serverStatus: ServerStatusService,
		// Injected for its side effect: the help index loads once here, so search and the question-mark buttons can read it synchronously.
		help: HelpManager,
	)
	{
	}

}
