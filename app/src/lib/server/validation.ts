const MAX_NAME_LENGTH = 120;
const MAX_SLUG_LENGTH = 80;
const MAX_URL_LENGTH = 2048;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ProjectPayload {
	name: string;
	slug: string;
	url?: string;
}

export interface SitePayload {
	projectId: string;
	url: string;
	name: string;
	slug: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown, fieldName: string): ValidationResult<string | undefined> {
	if (value === undefined) return { ok: true, value: undefined };
	if (typeof value !== 'string') return { ok: false, error: `${fieldName} must be a string` };

	const trimmed = value.trim();
	if (!trimmed) return { ok: false, error: `${fieldName} cannot be empty` };

	return { ok: true, value: trimmed };
}

function readRequiredString(
	value: unknown,
	fieldName: string,
	maxLength?: number
): ValidationResult<string> {
	if (typeof value !== 'string') return { ok: false, error: `${fieldName} is required` };

	const trimmed = value.trim();
	if (!trimmed) return { ok: false, error: `${fieldName} is required` };
	if (maxLength && trimmed.length > maxLength) {
		return { ok: false, error: `${fieldName} is too long` };
	}

	return { ok: true, value: trimmed };
}

export function generateSlug(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function validateSlug(value: string): ValidationResult<string> {
	if (value.length > MAX_SLUG_LENGTH) return { ok: false, error: 'Slug is too long' };
	if (!SLUG_PATTERN.test(value)) {
		return { ok: false, error: 'Slug must contain lowercase letters, numbers, and hyphens only' };
	}

	return { ok: true, value };
}

function readSlug(value: unknown, fallbackSource: string): ValidationResult<string> {
	const suppliedSlug = readOptionalString(value, 'Slug');
	if (!suppliedSlug.ok) return suppliedSlug;

	const slug = suppliedSlug.value ?? generateSlug(fallbackSource);
	if (!slug) return { ok: false, error: 'Slug cannot be empty' };

	return validateSlug(slug);
}

export function validateUrl(value: unknown, fieldName = 'URL'): ValidationResult<string> {
	const rawUrl = readRequiredString(value, fieldName, MAX_URL_LENGTH);
	if (!rawUrl.ok) return rawUrl;

	try {
		const parsed = new URL(rawUrl.value);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return { ok: false, error: `${fieldName} must use http or https` };
		}
		if (!parsed.hostname) return { ok: false, error: `${fieldName} is invalid` };

		return { ok: true, value: parsed.href };
	} catch {
		return { ok: false, error: `${fieldName} is invalid` };
	}
}

export function validateProjectPayload(payload: unknown): ValidationResult<ProjectPayload> {
	if (!isRecord(payload)) return { ok: false, error: 'Request body must be an object' };

	const name = readRequiredString(payload.name, 'Name', MAX_NAME_LENGTH);
	if (!name.ok) return name;

	const slug = readSlug(payload.slug, name.value);
	if (!slug.ok) return slug;

	let url: string | undefined;
	if (payload.url !== undefined) {
		const validatedUrl = validateUrl(payload.url);
		if (!validatedUrl.ok) return validatedUrl;
		url = validatedUrl.value;
	}

	return { ok: true, value: { name: name.value, slug: slug.value, url } };
}

export function validateSitePayload(payload: unknown): ValidationResult<SitePayload> {
	if (!isRecord(payload)) return { ok: false, error: 'Request body must be an object' };

	const projectId = readRequiredString(payload.project_id, 'Project ID');
	if (!projectId.ok) return projectId;
	if (!UUID_PATTERN.test(projectId.value)) return { ok: false, error: 'Project ID is invalid' };

	const url = validateUrl(payload.url);
	if (!url.ok) return url;

	const suppliedName = readOptionalString(payload.name, 'Name');
	if (!suppliedName.ok) return suppliedName;

	const name =
		suppliedName.value ??
		new URL(url.value).hostname
			.toLowerCase()
			.replace(/^www\./, '');

	const slug = readSlug(payload.slug, name);
	if (!slug.ok) return slug;

	return { ok: true, value: { projectId: projectId.value, url: url.value, name, slug: slug.value } };
}

export function sanitizeAppRedirect(value: string | null | undefined, fallback = '/dashboard'): string {
	if (!value) return fallback;

	const trimmed = value.trim();
	if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//') || /[\u0000-\u001F\u007F]/.test(trimmed)) {
		return fallback;
	}

	return trimmed;
}
