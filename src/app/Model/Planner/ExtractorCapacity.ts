import {ItemForm} from '@src/Model/API/Schema/Data/Parts/ItemForm';
import {Data} from '@src/Model/Data/Data';
import {Building} from '@src/Model/Data/Entities/Building';
import {Item} from '@src/Model/Data/Entities/Item';
import {MapPurity} from '@src/Model/Map/MapPurity';
import {ExtractorRow} from '@src/Model/Planner/ExtractorSetup';
import {Formulas} from '@src/Model/Planner/Formulas';
import {SpecialClasses} from '@src/Model/Planner/SpecialClasses';

/** What a mine node's real extractors can produce, draw and need. Node purity scales an extractor's base rate. */
export class ExtractorCapacity
{

	private static readonly PURITY_MULTIPLIERS: Record<MapPurity, number> = {impure: 0.5, normal: 1, pure: 2};

	/**
	 * The Water Extractor reports no mining fields in the version data, so its game default is the one rate kept here.
	 * Water has no resource-node purity either.
	 */
	private static readonly WATER_EXTRACTOR = 'Desc_WaterPump_C';
	private static readonly WATER_EXTRACTOR_BASE_RATE = 120;

	/** Resource wells use a pressurizer and satellites, a separate system that is out of scope here. */
	private static readonly RESOURCE_WELL_BUILDINGS = new Set<string>(['Desc_FrackingSmasher_C', 'Desc_FrackingExtractor_C']);

	/** Buildings that can extract this item, in version-data order. */
	public static extractorsFor(data: Data, itemClassName: string): Building[]
	{
		const item = data.searchItemByClassName(itemClassName);
		if (!item) {
			return [];
		}
		return data.buildings.filter(building => {
			if (ExtractorCapacity.RESOURCE_WELL_BUILDINGS.has(building.className)) {
				return false;
			}
			if (building.className === ExtractorCapacity.WATER_EXTRACTOR) {
				return item.className === SpecialClasses.WaterItem;
			}
			if (building.allowedResources.length > 0) {
				return building.allowedResources.some(resource => resource.className === item.className);
			}
			// Miners list no resources and accept everything of an allowed form (ores, coal, stone, ...).
			return building.allowedResourceForms.includes(item.form);
		});
	}

	/** Per minute at normal purity and 100% clock. */
	public static baseRate(building: Building): number
	{
		if (building.className === ExtractorCapacity.WATER_EXTRACTOR) {
			return ExtractorCapacity.WATER_EXTRACTOR_BASE_RATE;
		}
		if (building.miningRatePerCycle <= 0 || building.miningCycleLength <= 0) {
			return 0;
		}
		const perMinute = building.miningRatePerCycle * 60 / building.miningCycleLength;
		// Fluid mining rates are litres in the data; the planner counts fluids in m³.
		return ExtractorCapacity.isFluid(building) ? perMinute / 1000 : perMinute;
	}

	/** Water has no purity: its extractor produces the same on every node. */
	public static hasPurity(building: Building, item: Item): boolean
	{
		return building.className !== ExtractorCapacity.WATER_EXTRACTOR && item.className !== SpecialClasses.WaterItem;
	}

	/** One extractor feeds one belt or pipe, so each extractor's own output is capped when a cap is given. */
	public static rowRate(row: ExtractorRow, building: Building, item: Item, beltCap: number | null): number
	{
		const purity = ExtractorCapacity.hasPurity(building, item) ? ExtractorCapacity.PURITY_MULTIPLIERS[row.purity] : 1;
		const perExtractor = ExtractorCapacity.baseRate(building) * purity * row.clockSpeed / 100;
		const capped = beltCap === null ? perExtractor : Math.min(perExtractor, beltCap);
		return row.count * capped;
	}

	public static capacity(rows: ExtractorRow[], data: Data, item: Item, beltCap: number | null): number
	{
		return rows.reduce((sum, row) => {
			const building = data.searchBuildingByClassName(row.buildingClassName);
			return building ? sum + ExtractorCapacity.rowRate(row, building, item, beltCap) : sum;
		}, 0);
	}

	/** Average power draw in MW. */
	public static power(rows: ExtractorRow[], data: Data): number
	{
		return rows.reduce((sum, row) => {
			const building = data.searchBuildingByClassName(row.buildingClassName);
			return building
				? sum + row.count * building.powerUsage * Math.pow(row.clockSpeed / 100, building.powerUsageExponent)
				: sum;
		}, 0);
	}

	public static shards(rows: ExtractorRow[]): number
	{
		return rows.reduce((sum, row) => sum + Formulas.powerShards(row.clockSpeed) * row.count, 0);
	}

	public static buildings(rows: ExtractorRow[]): number
	{
		return rows.reduce((sum, row) => sum + row.count, 0);
	}

	private static isFluid(building: Building): boolean
	{
		return building.allowedResources.some(resource => resource.form !== ItemForm.Solid)
			|| building.allowedResourceForms.some(form => form !== ItemForm.Solid);
	}

}
