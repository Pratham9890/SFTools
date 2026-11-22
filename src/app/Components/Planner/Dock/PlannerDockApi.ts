import {InjectionToken} from '@angular/core';
import {CalculatorTab} from '@src/Components/Planner/Panels/Calculator/CalculatorTab';

/** The calculator tab each full-tab dock entry edits; kept in one place so the top bar and the hotkeys agree. */
export const CALCULATOR_DOCK_IDS: Readonly<Record<CalculatorTab, string>> = {
	request: 'produce',
	input: 'supply',
	resources: 'resources',
	recipes: 'recipes',
	logistics: 'belts',
	power: 'generators',
	overclocking: 'clock',
	sloops: 'sloops',
	sink: 'sink',
	byproducts: 'byproducts',
	machines: 'machines',
	optimisation: 'optimisation',
};

/** The calculator tab a dock entry edits, or null for the entries that are not calculator tabs. */
export function calculatorTabOfDockId(id: string): CalculatorTab | null
{
	const found = (Object.entries(CALCULATOR_DOCK_IDS) as [CalculatorTab, string][]).find(([, dockId]) => dockId === id);
	return found === undefined ? null : found[0];
}

/** Desktop panel ids that the old rail used, mapped to the dock entry that replaced them. */
export function dockIdForPanel(panelId: string, activeTab: CalculatorTab): string
{
	if (panelId === 'calculator') {
		return CALCULATOR_DOCK_IDS[activeTab];
	}
	if (panelId === 'inspector') {
		return 'block';
	}
	if (panelId === 'build-cost') {
		return 'materials';
	}
	if (panelId === 'power') {
		return 'power-use';
	}
	return panelId;
}

/**
 * What PanelLayoutService needs from the dock. A token rather than the class, because the class imports every
 * panel (the calculator included) and those panels call back into PanelLayoutService: this keeps that a type-only
 * dependency instead of an import cycle.
 */
export interface PlannerDockApi
{
	openId(): string | null;
	height(): number;
	open(id: string): void;
	toggle(id: string): void;
	close(): void;
	isOpen(id: string): boolean;
	/** The dock entry a rail panel id opens, using the calculator tab that is active right now. */
	dockIdForPanel(panelId: string): string;
}

export const PLANNER_DOCK = new InjectionToken<PlannerDockApi>('PlannerDock');
