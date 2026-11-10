import {BeltLayoutSettings} from '@src/Model/Planner/BeltLayoutSettings';

/**
 * Reads stored belt settings. 'beltView: false' is Belt view off: earlier versions stored it both for turning Belt view off
 * and for Belt management without Belt view, which can't be told apart, so off wins. A missing or unknown style reads as
 * 'even'; of the known styles only 'custom' still changes anything.
 */
export class BeltLayoutSettingsNormalizer
{

	public static normalize(settings: BeltLayoutSettings): BeltLayoutSettings
	{
		if (settings.beltView !== true && settings.beltView !== false) {
			return BeltLayoutSettingsNormalizer.normalize({...settings, beltView: false});
		}
		if (settings.lineStyle !== 'even' && settings.lineStyle !== 'full' && settings.lineStyle !== 'custom') {
			return {...settings, lineStyle: 'even'};
		}
		return settings;
	}

}
