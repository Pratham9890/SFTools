import {MapPurity} from '@src/Model/Map/MapPurity';

/** One kind of extractor on its own resource nodes; the count is how many such nodes are tapped. */
export interface ExtractorRow
{
	readonly count: number;
	readonly purity: MapPurity;
	readonly buildingClassName: string;
	readonly clockSpeed: number;
}
