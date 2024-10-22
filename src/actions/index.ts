import { defineAction } from 'astro:actions';
import data from '../../public/data.json'

type ObjType = {
	[key: string]: string[];
};

function getExclusiveCombinations(obj: ObjType): { [key: string]: string[] } {
	// Normalize the object keys to lowercase
	let lowerCaseObj: ObjType = {};
	for (let key in obj) {
		lowerCaseObj[key.toLowerCase()] = obj[key]!;
	}

	// Helper function to get the common values for a set of keys
	function getCommonValuesForKeys(subsetKeys: string[]): string[] {
		if (subsetKeys.length === 0) return [];

		let commonValues = lowerCaseObj[subsetKeys[0]!] || [];
		subsetKeys.forEach(key => {
			if (lowerCaseObj[key]) {
				commonValues = commonValues.filter(value => lowerCaseObj[key]!.includes(value));
			}
		});

		return commonValues;
	}

	// Helper function to generate all subsets of an array
	function getSubsets(array: string[]): string[][] {
		return array.reduce(
			(subsets, value) => subsets.concat(subsets.map(set => [...set, value])),
			[[]] as string[][]
		);
	}

	// Get all subsets of the keys
	let keys = Object.keys(lowerCaseObj);
	let subsets = getSubsets(keys);

	// Helper function to filter out values that appear in keys outside the current subset
	function getExclusiveValues(subset: string[], commonValues: string[]): string[] {
		let otherKeys = keys.filter(key => !subset.includes(key));
		otherKeys.forEach(otherKey => {
			commonValues = commonValues.filter(value => !lowerCaseObj[otherKey]!.includes(value));
		});
		return commonValues;
	}

	// Get exclusive common values for each subset
	let result: { [key: string]: string[] } = {};
	subsets.forEach(subset => {
		let commonValues = getCommonValuesForKeys(subset);
		let exclusiveValues = getExclusiveValues(subset, commonValues);
		// Include empty ones as well
		if (subset.length > 0) result[subset.join(",")] = exclusiveValues;
	});

	return result;
}

export const server = {
	getCombinedData: defineAction({
		handler: async () => {
			const combinedData = getExclusiveCombinations(data);

			return combinedData
		}
	})
}
