import {ItemForm} from '@src/Model/API/Schema/Data/Parts/ItemForm';
import {Data} from '@src/Model/Data/Data';
import {Building} from '@src/Model/Data/Entities/Building';
import {Item} from '@src/Model/Data/Entities/Item';
import {MapPurity} from '@src/Model/Map/MapPurity';
import {
	DEFAULT_SATELLITES,
	ExtractorRow,
	ExtractorSatellites,
	WELL_EXTRACTOR_CLASS,
	WELL_PRESSURIZER_CLASS,
} from '@src/Model/Planner/ExtractorSetup';
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

	/** Buildings that can extract this item, in version-data order; a well row covers both of its buildings. */
	public static extractorsFor(data: Data, itemClassName: string): Building[]
	{
		const item = data.searchItemByClassName(itemClassName);
		if (!item) {
			return [];
		}
		return data.buildings.filter(building => {
			// A well's satellite extractor is added implicitly by the well row, never picked on its own.
			if (building.className === WELL_EXTRACTOR_CLASS) {
				return false;
			}
			// The pressurizer is offered for exactly the items a well can give, read from the satellite extractor.
			if (building.className === WELL_PRESSURIZER_CLASS) {
				return ExtractorCapacity.wellResources(data).some(resource => resource.className === item.className);
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

	/** A well row is the pressurizer plus the satellite extractors it implies. */
	public static isWellRow(row: ExtractorRow): boolean
	{
		return row.buildingClassName === WELL_PRESSURIZER_CLASS;
	}

	public static satellites(row: ExtractorRow): ExtractorSatellites
	{
		return row.satellites ?? DEFAULT_SATELLITES;
	}

	public static satelliteCount(row: ExtractorRow): number
	{
		const satellites = ExtractorCapacity.satellites(row);
		return satellites.impure + satellites.normal + satellites.pure;
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

	/** Water has no purity: its extractor produces the same on every node. A well's purity is per satellite instead. */
	public static hasPurity(building: Building, item: Item): boolean
	{
		return building.className !== ExtractorCapacity.WATER_EXTRACTOR
			&& building.className !== WELL_PRESSURIZER_CLASS
			&& item.className !== SpecialClasses.WaterItem;
	}

	/** One extractor feeds one belt or pipe, so each extractor's own output is capped when a cap is given. */
	public static rowRate(row: ExtractorRow, building: Building, item: Item, beltCap: number | null, data: Data | null): number
	{
		if (ExtractorCapacity.isWellRow(row)) {
			return ExtractorCapacity.wellRate(row, data, beltCap);
		}
		const purity = ExtractorCapacity.hasPurity(building, item) ? ExtractorCapacity.PURITY_MULTIPLIERS[row.purity] : 1;
		const perExtractor = ExtractorCapacity.baseRate(building) * purity * row.clockSpeed / 100;
		const capped = beltCap === null ? perExtractor : Math.min(perExtractor, beltCap);
		return row.count * capped;
	}

	/** The pressurizer's clock scales every satellite; each satellite still feeds its own pipe. */
	private static wellRate(row: ExtractorRow, data: Data | null, beltCap: number | null): number
	{
		const extractor = data?.searchBuildingByClassName(WELL_EXTRACTOR_CLASS);
		if (!extractor) {
			return 0;
		}
		const satellites = ExtractorCapacity.satellites(row);
		const baseRate = ExtractorCapacity.baseRate(extractor) * row.clockSpeed / 100;
		const rate = (['impure', 'normal', 'pure'] as const).reduce((sum, purity) => {
			const perSatellite = baseRate * ExtractorCapacity.PURITY_MULTIPLIERS[purity];
			const capped = beltCap === null ? perSatellite : Math.min(perSatellite, beltCap);
			return sum + satellites[purity] * capped;
		}, 0);
		return row.count * rate;
	}

	public static capacity(rows: ExtractorRow[], data: Data, item: Item, beltCap: number | null): number
	{
		return rows.reduce((sum, row) => {
			const building = data.searchBuildingByClassName(row.buildingClassName);
			return building ? sum + ExtractorCapacity.rowRate(row, building, item, beltCap, data) : sum;
		}, 0);
	}

	/** Average power draw in MW. Only a well's pressurizer draws power; its satellites draw none. */
	public static power(rows: ExtractorRow[], data: Data): number
	{
		return rows.reduce((sum, row) => {
			const building = data.searchBuildingByClassName(row.buildingClassName);
			return building
				? sum + row.count * building.powerUsage * Math.pow(row.clockSpeed / 100, building.powerUsageExponent)
				: sum;
		}, 0);
	}

	/** Shards go to the pressurizer only; satellites cannot be overclocked. */
	public static shards(rows: ExtractorRow[]): number
	{
		return rows.reduce((sum, row) => sum + Formulas.powerShards(row.clockSpeed) * row.count, 0);
	}

	/** Every placed building: one pressurizer per well plus each of its satellite extractors. */
	public static buildings(rows: ExtractorRow[]): number
	{
		return rows.reduce((sum, row) => sum + row.count * (ExtractorCapacity.isWellRow(row) ? 1 + ExtractorCapacity.satelliteCount(row) : 1), 0);
	}

	private static wellResources(data: Data): Item[]
	{
		return data.searchBuildingByClassName(WELL_EXTRACTOR_CLASS)?.allowedResources ?? [];
	}

	private static isFluid(building: Building): boolean
	{
		return building.allowedResources.some(resource => resource.form !== ItemForm.Solid)
			|| building.allowedResourceForms.some(form => form !== ItemForm.Solid);
	}

}
