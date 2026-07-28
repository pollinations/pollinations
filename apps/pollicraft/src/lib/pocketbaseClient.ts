import PocketBase from 'pocketbase';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

let client: PocketBase | null = null;

export function getPocketBase(): PocketBase | null {
	if (!browser) return null;
	if (!client) {
		const baseUrl = env.PUBLIC_PB_URL ?? '';
		if (!baseUrl) return null;
		client = new PocketBase(baseUrl);
	}
	return client;
}
