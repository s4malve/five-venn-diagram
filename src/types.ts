export interface SpeciesData {
	species: string;
	values: { [name: string]: number };
}

export interface ProcessedData {
	serialId: number;
	name: string;
	species: SpeciesData[];
}

export interface GroupedData {
	id: number[]; // Assuming group ID is an array now
	name: string[];
	species: SpeciesData[];
}
