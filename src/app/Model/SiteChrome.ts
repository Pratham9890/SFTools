import {Injectable, signal} from '@angular/core';

/**
 * Set while a page owns the whole window (the planner): the site navbar and the padding that makes room
 * for it step aside. Every other page leaves it false and keeps the orange site bar.
 */
@Injectable({providedIn: 'root'})
export class SiteChrome
{

	public readonly fullScreen = signal(false);

}
