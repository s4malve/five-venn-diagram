import { defineAction } from 'astro:actions';
import fs from 'node:fs'
import { parse } from 'csv-parse';
import path from 'node:path';

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

// Define types for species and groups
interface SpeciesData {
	species: string;
	values: { [name: string]: number }; // A map of name to value
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
	value: number; // 100 for individual, 20 for combined
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
				// Check if this species is already in the speciesData array
				let speciesEntry = speciesData.find(s => s.species === headers[i]);
				if (!speciesEntry) {
					// If it's the first occurrence, create a new species entry
					speciesEntry = { species: headers[i], values: {} };
					speciesData.push(speciesEntry);
				}
				// Add or update the value for the current name
				speciesEntry.values[name] = value;
			}
		}

		return {
			serialId: index + 1, // Serial ID starting from 1
			name: name,
			species: speciesData
		};
	});
}

// Step 2: Group species by names and merge if necessary
function groupSpeciesByNames(processedData: ProcessedData[]): GroupedData[] {
	const speciesToNamesMap: { [key: string]: { ids: number[]; names: string[]; species: SpeciesData } } = {};
	const groupedData: GroupedData[] = [];

	// Build a map of species to the names they belong to
	processedData.forEach(data => {
		data.species.forEach(species => {
			// Ensure that the species is initialized correctly for the first occurrence
			if (!speciesToNamesMap[species.species]) {
				speciesToNamesMap[species.species] = { ids: [], names: [], species: { species: species.species, values: {} } };
			}

			// Add the current name and serial ID to the species' entry
			speciesToNamesMap[species.species]!.ids.push(data.serialId);
			speciesToNamesMap[species.species]!.names.push(data.name);

			// Merge the species' values into the map entry
			Object.entries(species.values).forEach(([name, value]) => {
				speciesToNamesMap[species.species]!.species.values[name] = value;
			});
		});
	});

	// Track existing groups to avoid duplicates
	const existingGroups: { [key: string]: GroupedData } = {};

	// Step 3: Extract groups for species belonging to any number of names
	Object.keys(speciesToNamesMap).forEach(species => {
		const entry = speciesToNamesMap[species]!;
		const groupId = entry.ids.sort().join("&"); // Create a group ID by sorting and joining the IDs
		const groupName = entry.names.join(" "); // Create a group name by joining the names

		// If this groupId already exists, merge the species into that group
		if (existingGroups[groupId]) {
			existingGroups[groupId].species.push(entry.species);
		} else {
			// Create a new group and add it to the groupedData
			const newGroup: GroupedData = {
				id: groupId,
				name: groupName,
				species: [entry.species], // Add species
				value: entry.ids.length === 1 ? 100 : 20 // Single species has value 100, otherwise 20
			};

			existingGroups[groupId] = newGroup;
			groupedData.push(newGroup);
		}
	});

	// Step 4: Add groups that have no species (i.e., single names without shared species)
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
				tooltipDesc:
					data.species.map((d, idx) => `${idx + 1}. ${d.species}`).join("\n"),
				value: data.value
			}))

			return dataForDiagram
		}
	})
}
