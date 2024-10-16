import { defineAction } from 'astro:actions';
import fs from 'node:fs'
import { parse } from 'csv-parse';
import path from 'node:path';
import type { ProcessedData, GroupedData, SpeciesData } from '../types';

const processFile = async () => {
	const records = [];
	const parser = fs
		.createReadStream(path.join(process.cwd(), 'data.csv'))
		.pipe(parse({
			// CSV options if any
		}));
	for await (const record of parser) {
		// Work with each record
		records.push(record);
	}
	return records;
};


function processMatrix(data: any[][]): ProcessedData[] {
	const headers = data[0]!.slice(2); // Species columns start from the 3rd column
	return data.slice(1).map((row, index) => {
		const name = row[0];
		const speciesData: SpeciesData[] = [];

		headers.forEach((header, i) => {
			const value = Number(row[i + 2]);
			if (value !== 0) {
				let speciesEntry = speciesData.find(s => s.species === header);
				if (!speciesEntry) {
					speciesEntry = { species: header, values: {} };
					speciesData.push(speciesEntry);
				}
				speciesEntry.values[name] = value;
			}
		});

		return {
			serialId: index + 1,
			name,
			species: speciesData,
		};
	});
}

function groupSpeciesByNames(processedData: ProcessedData[]): GroupedData[] {
	const speciesToNamesMap = new Map<string, { ids: number[]; names: string[]; species: SpeciesData }>();
	const groupedData: GroupedData[] = [];
	const existingGroups = new Map<string, GroupedData>();

	// Build the species-to-names map
	processedData.forEach(data => {
		data.species.forEach(species => {
			if (!speciesToNamesMap.has(species.species)) {
				speciesToNamesMap.set(species.species, {
					ids: [],
					names: [],
					species: { species: species.species, values: {} },
				});
			}

			const entry = speciesToNamesMap.get(species.species)!;
			entry.ids.push(data.serialId);
			entry.names.push(data.name);

			Object.entries(species.values).forEach(([name, value]) => {
				entry.species.values[name] = value;
			});
		});
	});

	// Group species by the names and ids
	speciesToNamesMap.forEach((entry) => {
		const groupId = entry.ids.sort().toString(); // Sort IDs for the group

		if (existingGroups.has(groupId)) {
			existingGroups.get(groupId)!.species.push(entry.species);
		} else {
			const newGroup: GroupedData = {
				id: entry.ids,
				name: entry.names,
				species: [entry.species],
			};
			existingGroups.set(groupId, newGroup);
			groupedData.push(newGroup);
		}
	});

	// Add groups for names without shared species
	processedData.forEach(data => {
		const singleGroupId = `${data.serialId}`;
		if (!existingGroups.has(singleGroupId)) {
			const newGroup: GroupedData = {
				id: [data.serialId],
				name: [data.name],
				species: [], // No species for this name
			};
			existingGroups.set(singleGroupId, newGroup);
			groupedData.push(newGroup);
		}
	});

	// Step 1: Sort each group's `id` array in ascending order
	groupedData.forEach(group => {
		group.id.sort((a, b) => a - b); // Sort individual `id` arrays
	});

	// Step 2: Sort the entire groupedData by the first element in each group's `id`
	groupedData.sort((a, b) => {
		// Compare based on the first id in each group
		return a.id[0]! - b.id[0]! || a.id.length - b.id.length; // Secondary sort by length for cases like [1] vs [1,2]
	});

	return groupedData;
}

export const server = {
	showDiagram: defineAction({
		handler: async () => {
			const inputData = await processFile() as string[][];
			const processedData = processMatrix(inputData);
			const groupedData = groupSpeciesByNames(processedData)

			return groupedData
		}
	})
}
