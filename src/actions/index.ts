import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import fs from 'node:fs'
import { parse } from 'csv-parse';
import { finished } from 'node:stream/promises';
import { assert } from 'node:console';

const processFile = async function <T>(file: File) {
	const records: T[] = [];
	const parser = parse(Buffer.from(await file.arrayBuffer()))

	parser.on('readable', function() {
		let record; while ((record = parser.read()) !== null) {
			// Work with each record
			records.push(record);
		}
	});
	await finished(parser);
	return records;
};

type Result = {
	group: string | undefined; data: DataResult
}
type DataResult = {
	[key: string]: number;
}
const extractData = (matrix: string[][]) => {
	if (!matrix[0]?.length) return []

	// Extract the header (compounds)
	const header = matrix[0].slice(2); // Ignore 'Name' and 'Species'
	// Function to extract groups with non-zero compound values
	const result: Result[] = [];


	matrix.slice(1).forEach(row => {
		const groupName = row[0];
		const groupData: DataResult = {};

		row.slice(2).forEach((value, index) => {
			if (parseFloat(value) > 0) {
				const compound = header[index] ?? 'not found'

				// eslint-disable-next-line no-index-signature
				groupData[compound] = parseFloat(value);
			}
		});

		if (Object.keys(groupData).length > 0) {
			result.push({
				group: groupName,
				data: groupData
			});
		}
	});

	return result;
}

function analyzeDataForVenn(data) {
	const groupNames = data[0].slice(2); // Extract group names from the first row
	const counts = {};

	// Iterate over each group's data
	data.slice(1).forEach((groupData) => {
		const groupName = groupData[1]; // Get the group name

		groupData.slice(2).forEach((value, index) => {
			if (value !== '0') {
				const compound = groupNames[index];

				// Initialize the count structure if it doesn't exist
				if (!counts[compound]) {
					counts[compound] = { groups: new Set() };
				}

				// Update the groups
				counts[compound].groups.add(groupName);
			}
		});
	});

	// Create the Venn diagram-like structure
	const uniqueIdentifiers = {};
	for (const compound in counts) {
		const { groups } = counts[compound];
		const groupArray = Array.from(groups);
		const identifier = groupArray.join('&'); // Join groups with '&'

		// Determine value based on the number of groups
		const value = groups.size === 1 ? 100 : 25;

		if (!uniqueIdentifiers[identifier]) {
			uniqueIdentifiers[identifier] = {
				x: identifier,
				value: value,
				names: compound // Start with the compound name
			};
		} else {
			// If it already exists, concatenate the compound name
			uniqueIdentifiers[identifier].names += `\n${compound}`;
		}
	}

	// Convert uniqueIdentifiers object to an array, formatting names
	return Object.values(uniqueIdentifiers).map(item => ({
		x: item.x,
		name: item.x,
		value: item.value,
		tooltipDesc: item.names,

	}));
}

export const server = {
	validateFileUpload: defineAction({
		accept: "form",
		input: z.object({
			file: z.instanceof(File)
		}),
		handler: async ({ file }) => {
			const allowedTypes = ["text/csv"]

			if (!allowedTypes.includes(file.type)) {
				throw new ActionError({
					code: "BAD_REQUEST",
					message: `❌ File "${file.name}" could not be uploaded. Only CSV files are allowed`,
				})
			}


			// Parse the CSV content
			const records = await processFile(file) as string[][];
			const analyzeData = analyzeDataForVenn(records)
			console.log(analyzeData)

			return analyzeData
		}
	})
}
