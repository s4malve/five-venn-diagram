import { ActionError, defineAction } from 'astro:actions';
import fs from 'node:fs'
import { parse } from 'csv-parse';

const processFile = async () => {
	const records = [];
	const parser = fs
		.createReadStream(new URL("../../data.csv", import.meta.url,))
		.pipe(parse({
			// CSV options if any
		}));
	for await (const record of parser) {
		// Work with each record
		records.push(record);
	}
	return records;
};


interface SpeciesData {
	species: string;
	value: number;
}

interface ProcessedData {
	serialId: number;
	name: string;
	species: SpeciesData[];
}

interface GroupedData {
	id: string;
	name: string;
	species: SpeciesData[];
	value: number
}

// Step 1: Process the matrix into the desired format
function processMatrix(data: any[][]): ProcessedData[] {
	const headers = data[0]!.slice(2); // Species columns start from the 3rd column onwards
	return data.slice(1).map((row, index) => {
		const name = row[0];
		const speciesData: SpeciesData[] = [];

		for (let i = 0; i < headers.length; i++) {
			const value = Number(row[i + 2]);
			if (value !== 0) { // Filter non-zero values early
				speciesData.push({
					species: headers[i],
					value: value
				});
			}
		}

		return {
			serialId: index + 1, // Serial ID starting from 0
			name: name,
			species: speciesData
		};
	});
}

// Step 2: Group species by names and merge if necessary
function groupSpeciesByNames(processedData: ProcessedData[]): GroupedData[] {
	const speciesToNamesMap: { [key: string]: { ids: number[]; names: string[]; species: SpeciesData[] } } = {};
	const groupedData: GroupedData[] = [];

	// Build a map of species to the names they belong to
	processedData.forEach(data => {
		data.species.forEach(species => {
			// Ensure that the species is initialized correctly for the first occurrence
			if (!speciesToNamesMap[species.species]) {
				speciesToNamesMap[species.species] = { ids: [], names: [], species: [] };
			}

			// Add the current name and serial ID to the species' entry
			speciesToNamesMap[species.species]!.ids.push(data.serialId);
			speciesToNamesMap[species.species]!.names.push(data.name);
			speciesToNamesMap[species.species]!.species.push(species);
		});
	});

	console.log("Species to Names Map:", speciesToNamesMap); // Debugging output

	// Track existing groups to avoid duplicates
	const existingGroups: { [key: string]: GroupedData } = {};

	// Step 3: Extract groups for species belonging to any number of names
	Object.keys(speciesToNamesMap).forEach(species => {
		const entry = speciesToNamesMap[species]!;
		const groupId = entry.ids.sort().join("&"); // Create a group ID by sorting and joining the IDs
		const groupName = entry.names.join(" "); // Create a group name by joining the names


		// If this groupId already exists, merge the species into that group
		if (existingGroups[groupId]) {
			existingGroups[groupId].species.push(...entry.species);
		} else {
			// Create a new group and add it to the groupedData
			const newGroup: GroupedData = {
				id: groupId,
				name: groupName,
				species: entry.species,
				value: entry.ids.length === 1 ? 100 : 20 // Single species has value 100, otherwise 20
			};

			existingGroups[groupId] = newGroup;
			groupedData.push(newGroup);
		}
	});

	processedData.forEach(data => {
		const singleGroupId = `${data.serialId}`;
		if (!existingGroups[singleGroupId]) {
			const newGroup: GroupedData = {
				id: singleGroupId,
				name: data.name,
				species: [], // No species, but still include the group
				value: 100
			};
			existingGroups[singleGroupId] = newGroup;
			groupedData.push(newGroup);
		}
	});

	return groupedData;
}


export const server = {
	showDiagram: defineAction({
		handler: async () => {
			// Parse the CSV content
			const inputData = await processFile() as string[][];
			const processedData = processMatrix(inputData);
			const grouppedData = groupSpeciesByNames(processedData)
			const dataForDiagram = grouppedData.map(data => ({
				x: data.id,
				name: data.name,
				tooltipTitle: `${data.name} - ${data.species.length}`,
				tooltipDesc: data.species.map((d => `${d.species}: ${d.value}`)).join("\n"),
				value: data.value
			}))

			return dataForDiagram
		}
	})
}
