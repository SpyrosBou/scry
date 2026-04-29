export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type SuiteSlug = 'functionality' | 'accessibility' | 'responsive' | 'visual';
export type RunStatus = 'running' | 'pass' | 'warn' | 'fail';
export type SuiteStatus = 'pass' | 'warn' | 'fail';
export type Severity = 'blocker' | 'warning' | 'passed';

export interface Database {
	public: {
		Tables: {
			projects: {
				Row: {
					id: string;
					user_id: string;
					name: string;
					slug: string;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					name: string;
					slug: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					name?: string;
					slug?: string;
					created_at?: string;
				};
				Relationships: [];
			};
			sites: {
				Row: {
					id: string;
					project_id: string;
					url: string;
					slug: string;
					name: string;
					created_at: string;
				};
				Insert: {
					id?: string;
					project_id: string;
					url: string;
					slug: string;
					name: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					project_id?: string;
					url?: string;
					slug?: string;
					name?: string;
					created_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'sites_project_id_fkey';
						columns: ['project_id'];
						isOneToOne: false;
						referencedRelation: 'projects';
						referencedColumns: ['id'];
					}
				];
			};
			runs: {
				Row: {
					id: string;
					site_id: string;
					status: RunStatus;
					pages_tested: number;
					suites_run: string[];
					started_at: string;
					completed_at: string | null;
				};
				Insert: {
					id?: string;
					site_id: string;
					status: RunStatus;
					pages_tested?: number;
					suites_run?: string[];
					started_at?: string;
					completed_at?: string | null;
				};
				Update: {
					id?: string;
					site_id?: string;
					status?: RunStatus;
					pages_tested?: number;
					suites_run?: string[];
					started_at?: string;
					completed_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'runs_site_id_fkey';
						columns: ['site_id'];
						isOneToOne: false;
						referencedRelation: 'sites';
						referencedColumns: ['id'];
					}
				];
			};
			run_suites: {
				Row: {
					id: string;
					run_id: string;
					suite: SuiteSlug;
					score: number | null;
					status: SuiteStatus;
				};
				Insert: {
					id?: string;
					run_id: string;
					suite: SuiteSlug;
					score?: number | null;
					status: SuiteStatus;
				};
				Update: {
					id?: string;
					run_id?: string;
					suite?: SuiteSlug;
					score?: number | null;
					status?: SuiteStatus;
				};
				Relationships: [
					{
						foreignKeyName: 'run_suites_run_id_fkey';
						columns: ['run_id'];
						isOneToOne: false;
						referencedRelation: 'runs';
						referencedColumns: ['id'];
					}
				];
			};
			findings: {
				Row: {
					id: string;
					run_id: string;
					suite: string;
					rule: string;
					severity: Severity;
					page_count: number;
					details: Json;
				};
				Insert: {
					id?: string;
					run_id: string;
					suite: string;
					rule: string;
					severity: Severity;
					page_count?: number;
					details?: Json;
				};
				Update: {
					id?: string;
					run_id?: string;
					suite?: string;
					rule?: string;
					severity?: Severity;
					page_count?: number;
					details?: Json;
				};
				Relationships: [
					{
						foreignKeyName: 'findings_run_id_fkey';
						columns: ['run_id'];
						isOneToOne: false;
						referencedRelation: 'runs';
						referencedColumns: ['id'];
					}
				];
			};
		};
		Views: Record<string, never>;
		Functions: Record<string, never>;
		Enums: Record<string, never>;
		CompositeTypes: Record<string, never>;
	};
}

/** Helper type for extracting Row types */
export type Tables<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Row'];

/** Composite types for app use */
export interface SiteWithHealth {
	id: string;
	slug: string;
	name: string;
	health: 'green' | 'yellow' | 'red' | 'none';
}

export interface ProjectWithSites {
	id: string;
	name: string;
	slug: string;
	sites: SiteWithHealth[];
}
