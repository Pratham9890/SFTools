import {MapPurity} from '@src/Model/Map/MapPurity';

/** The Resource Well Pressurizer; a row for it stands for whole wells. */
export const WELL_PRESSURIZER_CLASS = 'Desc_FrackingSmasher_C';

/** The satellite extractor a well row adds implicitly, one per tapped satellite node. */
export const WELL_EXTRACTOR_CLASS = 'Desc_FrackingExtractor_C';

/** Default satellites of a well row missing or invalid on load: one normal node, like a single-extractor row. */
export const DEFAULT_SATELLITES: ExtractorSatellites = {impure: 0, normal: 1, pure: 0};

/** How many satellite nodes of each purity one well taps; the pressurizer's clock scales all of them. */
export interface ExtractorSatellites
{
	readonly impure: number;
	readonly normal: number;
	readonly pure: number;
}

/**
 * One kind of extractor on its own resource nodes; the count is how many such nodes are tapped.
 * A row whose building is the pressurizer is a well: count is the number of identical wells and
 * satellites the nodes each one taps.
 */
export interface ExtractorRow
{
	readonly count: number;
	readonly purity: MapPurity;
	readonly buildingClassName: string;
	readonly clockSpeed: number;
	readonly satellites?: ExtractorSatellites;
}
