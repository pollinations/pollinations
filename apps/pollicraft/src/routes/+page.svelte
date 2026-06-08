<script lang="ts">
	import { onMount } from 'svelte';
	import type PocketBase from 'pocketbase';
	import { getPocketBase } from '$lib/pocketbaseClient';
	import Camera from '@lucide/svelte/icons/camera';
	import Clock from '@lucide/svelte/icons/clock';
	import Menu from '@lucide/svelte/icons/menu';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Search from '@lucide/svelte/icons/search';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Trophy from '@lucide/svelte/icons/trophy';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import WandSparkles from '@lucide/svelte/icons/wand-sparkles';

	import { env } from '$env/dynamic/public';

	type ElementOrigin = 'seed' | 'cached' | 'generated';

	type ElementDefinition = {
		id: string;
		name: string;
		description: string;
		origin: ElementOrigin;
		hue: string;
		ink: string;
		glow: string;
		prompt: string;
		recordId?: string;
		imageUrl?: string;
		recipe?: [string, string];
		discoveredBy?: string;
	};

	type PlacedElement = {
		uid: string;
		elementId: string;
		x: number;
		y: number;
		rotation: number;
		scale: number;
		isNew?: boolean;
	};

	type DragState = {
		uid: string;
		offsetX: number;
		offsetY: number;
		hasMoved: boolean;
		fromInventory?: boolean;
		elementId?: string;
	};

	type PendingInventoryDrag = {
		elementId: string;
		pointerId: number;
		startClientX: number;
		startClientY: number;
		moved: boolean;
	};

	type CraftResolution = {
		element: ElementDefinition;
		firstDiscovery: boolean;
		source: 'global-cache' | 'ai-sim';
	};

	type CraftLogItem = {
		uid: string;
		resultId: string;
		pair: [string, string];
		firstDiscovery: boolean;
		source: CraftResolution['source'];
		time: string;
		createdAt: number;
	};

	type Toast = {
		title: string;
		message: string;
		tone: 'plain' | 'discovery' | 'cache';
	};

	type InventorySortMode = 'discoveries' | 'time';

	const POLLEN_KEY_STORAGE = 'pollicraft.pollen.key';
	const IDENTITY_STORAGE = 'pollicraft.identity.v1';
	const PB_BASE_URL = env.PUBLIC_PB_URL ?? '';
	const POLLEN_CLIENT_ID = env.PUBLIC_POLLINATIONS_APP_KEY ?? '';

	const generatedCombinationCache = new Map<string, ElementDefinition>();
	const generatedPalettes = [
		['#3c9f8e', '#163f39', '#b9f0df'],
		['#cb4f76', '#5a1830', '#ffd1dc'],
		['#4267ac', '#17284e', '#cbd9ff'],
		['#d29b31', '#5a3a08', '#ffe2a1'],
		['#5c7a43', '#24351d', '#d7edbe'],
		['#8f5c9f', '#392244', '#ead3f5'],
		['#b45c41', '#542112', '#fac0a4']
	] as const;

	let elements = $state<Record<string, ElementDefinition>>({});
	let inventory = $state<string[]>([]);
	let placed = $state<PlacedElement[]>([]);
	let craftLog = $state<CraftLogItem[]>([]);
	let activeDrag = $state<DragState | null>(null);
	let collisionTargetUid = $state<string | null>(null);
	let isCrafting = $state(false);
	let activeCraftPairIds = $state(new Set<string>());
	let activeSynthesisPoints = $state<Record<string, { x: number; y: number }>>({});
	let menuOpen = $state(false);
	let helpOpen = $state(false);
	let searchTerm = $state('');
	let sortMode = $state<InventorySortMode>('discoveries');
	let compactMode = $state(false);
	let synthesisPoint = $state<{ x: number; y: number } | null>(null);
	let toast = $state<Toast | null>(null);
	let pendingInventoryDrag = $state<PendingInventoryDrag | null>(null);
	let freshInventoryIds = $state<string[]>([]);
	let pb = $state<PocketBase | null>(null);
	let userEmail = $state<string | null>(null);
	let displayName = $state('local guest');
	let profilePicture = $state<string | null>(null);
	let identityBusy = $state(false);
	let identityError = $state<string | null>(null);
	let pollenKey = $state<string | null>(null);
	let pendingPollenKey = $state<string | null>(null);
	let tableNode: HTMLElement;
	let uidCounter = 0;
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	let dragBoundsCache: DOMRect | null = null;
	let inventoryBusy = $state(false);
	let inventoryError = $state<string | null>(null);
	let inventoryReady = $state(false);
	let backendFirstDiscoveryCount = $state<number | null>(null);

	const filteredInventory = $derived(
		sortInventoryIds(inventory, sortMode)
			.map((id) => elements[id])
			.filter(
				(item): item is ElementDefinition =>
					Boolean(item) && item.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
			)
	);
	const firstDiscoveryCount = $derived(
		backendFirstDiscoveryCount ?? craftLog.filter((entry) => entry.firstDiscovery).length
	);
	const freshCount = $derived(freshInventoryIds.filter((id) => inventory.includes(id)).length);
	const apiStatus = $derived(pollenKey ? 'Logged in' : 'Logged out');
	const authStatus = $derived(userEmail ? 'Connected' : 'Guest');
	const canCraft = $derived(Boolean(userEmail) && Boolean(pollenKey));
	const pbStatus = $derived(pb ? 'PB online' : 'PB offline');

	onMount(() => {
		loadIdentityFromStorage();
		void loadPollenKeyFromHash();
		void initializeClient();
		return () => {};
	});

	$effect(() => {
		if (!pb || !PB_BASE_URL) return;
		if (!userEmail || !pollenKey) return;
		if (inventoryError) return;
		if (inventoryBusy || inventoryReady) return;
		void loadInventoryFromBackend();
	});

	async function initializeClient() {
		pb = getPocketBase();
		if (!pb) return;
		applyPollenKeyForUser();
	}

	function pollenStorageKey(email: string) {
		return `${POLLEN_KEY_STORAGE}.${email.toLowerCase()}`;
	}

	function applyPollenKeyForUser() {
		if (!userEmail || typeof localStorage === 'undefined') {
			pollenKey = null;
			return;
		}
		const stored = localStorage.getItem(pollenStorageKey(userEmail));
		if (pendingPollenKey) {
			pollenKey = pendingPollenKey;
			localStorage.setItem(pollenStorageKey(userEmail), pendingPollenKey);
			pendingPollenKey = null;
			return;
		}
		pollenKey = stored || null;
	}

	function loadIdentityFromStorage() {
		if (typeof localStorage === 'undefined') return;
		const raw = localStorage.getItem(IDENTITY_STORAGE);
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw) as { email?: string; displayName?: string };
			if (parsed?.email) {
				userEmail = parsed.email;
				displayName = parsed.displayName || 'local guest';
			}
		} catch {
			// ignore invalid stored identity
		}
	}

	function persistIdentity(email: string, name: string) {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(IDENTITY_STORAGE, JSON.stringify({ email, displayName: name }));
	}

	function clearIdentity() {
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem(IDENTITY_STORAGE);
			if (userEmail) {
				localStorage.removeItem(pollenStorageKey(userEmail));
			}
		}
		userEmail = null;
		displayName = 'local guest';
		profilePicture = null;
		pollenKey = null;
		pendingPollenKey = null;
		inventoryReady = false;
		inventoryBusy = false;
		inventoryError = null;
		backendFirstDiscoveryCount = null;
		elements = {};
		inventory = [];
		placed = [];
		craftLog = [];
		freshInventoryIds = [];
		generatedCombinationCache.clear();
	}

	async function fetchPollinationsUserInfo(key: string) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15000);
		try {
			const response = await fetch('https://enter.pollinations.ai/api/device/userinfo', {
				headers: {
					Authorization: `Bearer ${key}`
				},
				signal: controller.signal
			});
			clearTimeout(timeout);
			if (!response.ok) return null;
			return (await response.json()) as {
				email?: string;
				name?: string;
				preferred_username?: string;
				picture?: string;
			};
		} catch (err) {
			clearTimeout(timeout);
			// Don't log abort errors (user navigated away / timeout)
			if (err instanceof Error && err.name !== 'AbortError') {
				console.error('fetchPollinationsUserInfo failed:', err);
			}
			return null;
		}
	}

	function resolveDisplayName(info: { name?: string; preferred_username?: string }) {
		return info.name || info.preferred_username || 'Pollinations user';
	}

	async function resolveIdentityFromKey(key: string) {
		identityBusy = true;
		identityError = null;
		const info = await fetchPollinationsUserInfo(key);
		if (!info?.email) {
			pendingPollenKey = key;
			identityError = 'Could not verify the Pollinations account yet.';
			identityBusy = false;
			return;
		}
		const email = info.email.toLowerCase();
		const name = resolveDisplayName(info);
		const picture = info.picture || null;
		userEmail = email;
		displayName = name;
		profilePicture = picture;
		pollenKey = key;
		pendingPollenKey = null;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(pollenStorageKey(email), key);
		}
		persistIdentity(email, name);
		identityBusy = false;
		announce('Connected', 'Your Pollinations account is now linked.', 'plain');
	}

	async function loadPollenKeyFromHash() {
		if (typeof window === 'undefined') return;
		const hash = window.location.hash.replace(/^#/, '');
		if (!hash) return;
		const params = new URLSearchParams(hash);
		const key = params.get('api_key');
		const error = params.get('error');
		if (key) {
			await resolveIdentityFromKey(key);
		}
		if (error === 'access_denied') {
			announce('Login cancelled', 'Pollinations access was not granted.', 'plain');
		}
		if (params.has('api_key') || params.has('error') || params.has('state')) {
			history.replaceState(null, '', window.location.pathname + window.location.search);
		}
	}

	function connectPollinations() {
		if (typeof window === 'undefined') return;
		const redirectUri = `${window.location.origin}${window.location.pathname}`;
		const params = new URLSearchParams({ redirect_uri: redirectUri });
		if (POLLEN_CLIENT_ID) {
			params.set('client_id', POLLEN_CLIENT_ID);
		}
		window.location.href = `https://enter.pollinations.ai/authorize?${params.toString()}`;
	}

	function disconnectPollinations() {
		clearIdentity();
	}

	function recipeKey(left: string, right: string) {
		return [left, right].map(normalizeId).sort().join('+');
	}

	function normalizeId(value: string) {
		return value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	function originLabel(origin: ElementOrigin) {
		return origin === 'seed' ? 'seed' : origin === 'cached' ? 'atlas' : 'first';
	}

	function createUid(prefix: string) {
		uidCounter += 1;
		return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
	}

	function clamp(value: number, min: number, max: number) {
		return Math.min(Math.max(value, min), max);
	}

	function sortInventoryIds(ids: string[], mode: InventorySortMode) {
		if (mode === 'discoveries') return [...ids];

		const recentById = new Map<string, number>();
		craftLog.forEach((entry, index) => {
			if (!recentById.has(entry.resultId)) {
				recentById.set(entry.resultId, entry.createdAt || Date.now() - index);
			}
		});

		// Build index map once for O(1) fallback lookups instead of O(n) .indexOf in comparator
		const indexById = new Map<string, number>();
		ids.forEach((id, i) => indexById.set(id, i));

		return [...ids].sort((left, right) => {
			const leftRecent = recentById.get(left);
			const rightRecent = recentById.get(right);
			if (leftRecent === undefined && rightRecent === undefined) {
				return (indexById.get(left) ?? 0) - (indexById.get(right) ?? 0);
			}
			if (leftRecent === undefined) return 1;
			if (rightRecent === undefined) return -1;
			return rightRecent - leftRecent;
		});
	}

	function createPlacedElement(elementId: string, uid: string, x: number, y: number, isNew = true) {
		return {
			uid,
			elementId,
			x,
			y,
			rotation: Math.round((Math.random() - 0.5) * 9),
			scale: 0.96 + Math.random() * 0.08,
			isNew
		} satisfies PlacedElement;
	}

	function markInventorySeen(elementId: string) {
		if (!freshInventoryIds.includes(elementId)) return;
		freshInventoryIds = freshInventoryIds.filter((id) => id !== elementId);
	}

	function removePiece(uid: string) {
		const piece = placed.find((candidate) => candidate.uid === uid);
		placed = placed.filter((candidate) => candidate.uid !== uid);
		if (activeDrag?.uid === uid) activeDrag = null;
		if (collisionTargetUid === uid) collisionTargetUid = null;
		const item = piece ? elements[piece.elementId] : undefined;
		if (item) {
			announce('Element removed', `${item.name} was lifted from the table.`, 'plain');
		}
	}

	function handlePieceKeydown(event: KeyboardEvent, uid: string) {
		if (event.key !== 'Delete' && event.key !== 'Backspace') return;
		event.preventDefault();
		removePiece(uid);
	}

	function addToWorkspace(elementId: string) {
		const bounds = tableNode?.getBoundingClientRect();
		const width = bounds?.width ?? 900;
		const height = bounds?.height ?? 620;
		const driftX = (Math.random() - 0.5) * Math.min(260, width * 0.32);
		const driftY = (Math.random() - 0.5) * Math.min(200, height * 0.26);
		const uid = createUid(elementId);

		placed = [
			...placed,
			createPlacedElement(
				elementId,
				uid,
				clamp(width * 0.45 + driftX, 74, width - 74),
				clamp(height * 0.52 + driftY, 74, height - 74)
			)
		];
		menuOpen = false;
		markInventorySeen(elementId);
		settleNewFlag(uid);
	}

	function beginInventoryPointer(event: PointerEvent, elementId: string) {
		if (event.button !== 0) return;
		pendingInventoryDrag = {
			elementId,
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			moved: false
		};
	}

	function beginInventoryDrag(event: PointerEvent, elementId: string, targetEl?: HTMLElement | null) {
		const bounds = tableNode?.getBoundingClientRect();
		if (!bounds) return;
		dragBoundsCache = bounds;

		event.preventDefault();
		const uid = createUid(elementId);
		const x = clamp(event.clientX - bounds.left, 58, bounds.width - 58);
		const y = clamp(event.clientY - bounds.top, 58, bounds.height - 58);

		placed = [...placed, createPlacedElement(elementId, uid, x, y, false)];
		markInventorySeen(elementId);
		activeDrag = {
			uid,
			offsetX: 0,
			offsetY: 0,
			hasMoved: true,
			fromInventory: true,
			elementId
		};
		collisionTargetUid = null;
		menuOpen = false;
		const captureTarget = targetEl || (event.currentTarget as HTMLElement);
		captureTarget?.setPointerCapture?.(event.pointerId);
	}

	function beginDrag(event: PointerEvent, uid: string) {
		const node = placed.find((piece) => piece.uid === uid);
		const bounds = tableNode?.getBoundingClientRect();
		if (!node || !bounds) return;
		dragBoundsCache = bounds;

		event.preventDefault();
		activeDrag = {
			uid,
			offsetX: event.clientX - bounds.left - node.x,
			offsetY: event.clientY - bounds.top - node.y,
			hasMoved: false
		};
		collisionTargetUid = null;
		(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (pendingInventoryDrag && event.pointerId === pendingInventoryDrag.pointerId && !activeDrag) {
			const bounds = dragBoundsCache || tableNode?.getBoundingClientRect();
			const dx = event.clientX - pendingInventoryDrag.startClientX;
			const dy = event.clientY - pendingInventoryDrag.startClientY;
			const distance = Math.hypot(dx, dy);
			const crossingIntoTable =
				bounds &&
				event.clientX >= bounds.left &&
				event.clientX <= bounds.right &&
				event.clientY >= bounds.top &&
				event.clientY <= bounds.bottom;
			const pulledFromRightShelf = dx < -8 && Math.abs(dx) > Math.abs(dy) + 3;
			const pulledFromBottomShelf = dy < -8 && Math.abs(dy) > Math.abs(dx) + 3;

			if (distance > 6) {
				pendingInventoryDrag = { ...pendingInventoryDrag, moved: true };
			}

			if (distance > 9 && (crossingIntoTable || pulledFromRightShelf || pulledFromBottomShelf)) {
				const elementId = pendingInventoryDrag.elementId;
				const targetEl = event.target as HTMLElement | null;
				pendingInventoryDrag = null;
				beginInventoryDrag(event, elementId, targetEl);
			}
		}

		if (!activeDrag) return;
		const bounds = dragBoundsCache || tableNode?.getBoundingClientRect();
		if (!bounds) return;

		const x = clamp(event.clientX - bounds.left - activeDrag.offsetX, 58, bounds.width - 58);
		const y = clamp(event.clientY - bounds.top - activeDrag.offsetY, 58, bounds.height - 58);

		placed = placed.map((piece) => (piece.uid === activeDrag?.uid ? { ...piece, x, y } : piece));
		activeDrag = { ...activeDrag, hasMoved: true };
		collisionTargetUid = findCollisionTarget(activeDrag.uid)?.uid ?? null;
	}

	async function handlePointerUp(event: PointerEvent) {
		if (pendingInventoryDrag && event.pointerId === pendingInventoryDrag.pointerId) {
			const pending = pendingInventoryDrag;
			pendingInventoryDrag = null;
			if (!pending.moved) {
				addToWorkspace(pending.elementId);
			}
			return;
		}

		const drag = activeDrag;
		activeDrag = null;
		dragBoundsCache = null;

		if (!drag || !drag.hasMoved) {
			collisionTargetUid = null;
			return;
		}

		const target = findCollisionTarget(drag.uid);
		collisionTargetUid = null;

		if (target) {
			await craftPieces(drag.uid, target.uid);
		} else if (drag.fromInventory) {
			placed = placed.map((piece) => (piece.uid === drag.uid ? { ...piece, isNew: true } : piece));
			settleNewFlag(drag.uid);
		}
	}

	function handlePointerCancel(event: PointerEvent) {
		if (pendingInventoryDrag?.pointerId === event.pointerId) {
			pendingInventoryDrag = null;
		}

		if (activeDrag?.fromInventory) {
			const uid = activeDrag.uid;
			placed = placed.filter((piece) => piece.uid !== uid);
		}

		activeDrag = null;
		collisionTargetUid = null;
	}

	function handleInventoryKeydown(event: KeyboardEvent, elementId: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		addToWorkspace(elementId);
	}

	function findCollisionTarget(uid: string) {
		const moving = placed.find((piece) => piece.uid === uid);
		if (!moving) return null;

		return (
			placed.find((piece) => {
				if (piece.uid === uid) return false;
				const distance = Math.hypot(piece.x - moving.x, piece.y - moving.y);
				return distance < 108;
			}) ?? null
		);
	}

	async function craftPieces(leftUid: string, rightUid: string) {
		const left = placed.find((piece) => piece.uid === leftUid);
		const right = placed.find((piece) => piece.uid === rightUid);
		if (!left || !right) return;
		if (!userEmail) {
			announce('Connect required', 'Connect Pollinations before crafting new elements.', 'plain');
			menuOpen = true;
			return;
		}
		if (!pollenKey) {
			announce('Login required', 'Connect your Pollinations account to craft new elements.', 'plain');
			menuOpen = true;
			return;
		}
		if (PB_BASE_URL && !inventoryReady) {
			announce('Inventory syncing', 'Wait for the backend inventory to load.', 'plain');
			return;
		}

		const leftElement = elements[left.elementId];
		const rightElement = elements[right.elementId];
		if (!leftElement || !rightElement) {
			announce('Inventory out of sync', 'Reload the inventory before crafting.', 'plain');
			return;
		}
		const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };

		const pairKey = [leftUid, rightUid].sort().join('+');
		activeCraftPairIds.add(pairKey);
		activeSynthesisPoints = { ...activeSynthesisPoints, [pairKey]: center };

		try {
			const resolution = await resolveCombination(leftElement, rightElement);
			const result = resolution.element;
			const resultUid = createUid(result.id);

			if (!elements[result.id]) {
				elements = { ...elements, [result.id]: result };
			}

			const isNewInventoryItem = !inventory.includes(result.id);
			if (isNewInventoryItem) {
				inventory = [...inventory, result.id];
				freshInventoryIds = [result.id, ...freshInventoryIds.filter((id) => id !== result.id)].slice(0, 24);
			}

			placed = placed
				.filter((piece) => piece.uid !== leftUid && piece.uid !== rightUid)
				.concat({
					uid: resultUid,
					elementId: result.id,
					x: clamp(center.x, 70, (tableNode?.clientWidth ?? 900) - 70),
					y: clamp(center.y, 70, (tableNode?.clientHeight ?? 620) - 70),
					rotation: Math.round((Math.random() - 0.5) * 7),
					scale: 1.04,
					isNew: true
				});

			const pair: [string, string] = [leftElement.name, rightElement.name];
			craftLog = [
				{
					uid: createUid('log'),
					resultId: result.id,
					pair,
					firstDiscovery: resolution.firstDiscovery,
					source: resolution.source,
					time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
					createdAt: Date.now()
				},
				...craftLog
			].slice(0, 8);

			announce(
				resolution.firstDiscovery ? 'First discovery' : 'Found in the atlas',
				`${leftElement.name} + ${rightElement.name} made ${result.name}.`,
				resolution.firstDiscovery ? 'discovery' : 'cache'
			);
			settleNewFlag(resultUid);
		} catch (err) {
			console.error('Crafting failed:', err);
			announce('Crafting failed', 'Backend crafting is unavailable right now.', 'plain');
		} finally {
			const pk = [leftUid, rightUid].sort().join('+');
			activeCraftPairIds.delete(pk);
			activeCraftPairIds = activeCraftPairIds; // trigger reactivity
			const nextPoints = { ...activeSynthesisPoints };
			delete nextPoints[pk];
			activeSynthesisPoints = nextPoints;
		}
	}

	type CraftApiResponse = {
		element: {
			id: string;
			slug?: string;
			name: string;
			description: string;
			image?: string;
			collectionId?: string;
			collectionName?: string;
			discovererDisplayName?: string;
		};
		firstDiscovery: boolean;
		source?: 'global-cache' | 'ai-sim';
	};

	type InventoryApiResponse = {
		elements: Array<{
			id: string;
			slug?: string;
			name: string;
			description: string;
			image?: string;
			collectionId?: string;
			collectionName?: string;
			discovererDisplayName?: string;
		}>;
		firstDiscoveryCount?: number;
	};

	function derivePalette(seed: string) {
		const palette = generatedPalettes[hashString(seed) % generatedPalettes.length];
		return { hue: palette[0], ink: palette[1], glow: palette[2] };
	}

	function buildPrompt(name: string, leftName: string, rightName: string) {
		return `small hand-painted ${name}, paper texture, indie game icon, made from ${leftName} and ${rightName}`;
	}

	function mapBackendElement(
		record: CraftApiResponse['element'],
		leftElement: ElementDefinition,
		rightElement: ElementDefinition,
		origin: ElementOrigin
	): ElementDefinition {
		const palette = derivePalette(record.name);
		const prompt = buildPrompt(record.name, leftElement.name, rightElement.name);
		const elementId = record.slug || record.id;
		const fileRecord = {
			id: record.id,
			collectionId: record.collectionId || undefined,
			collectionName: record.collectionName || 'elements'
		};
		const imageUrl = record.image && pb ? pb.files.getURL(fileRecord, record.image) : undefined;
		const discoveredBy = record.discovererDisplayName ?? displayName;
		return {
			id: elementId,
			recordId: record.id,
			name: record.name,
			description: record.description,
			origin,
			hue: palette.hue,
			ink: palette.ink,
			glow: palette.glow,
			prompt,
			recipe: [leftElement.id, rightElement.id],
			discoveredBy: discoveredBy,
			imageUrl
		};
	}

	function mapInventoryElement(record: InventoryApiResponse['elements'][number]): ElementDefinition {
		const palette = derivePalette(record.name);
		const elementId = record.slug || record.id;
		const fileRecord = {
			id: record.id,
			collectionId: record.collectionId || undefined,
			collectionName: record.collectionName || 'elements'
		};
		const imageUrl = record.image && pb ? pb.files.getURL(fileRecord, record.image) : undefined;
		const discoveredBy = record.discovererDisplayName ?? displayName;
		const origin: ElementOrigin = discoveredBy === displayName ? 'generated' : 'cached';
		return {
			id: elementId,
			recordId: record.id,
			name: record.name,
			description: record.description,
			origin,
			hue: palette.hue,
			ink: palette.ink,
			glow: palette.glow,
			prompt: `small hand-painted ${record.name}, paper texture, indie game icon`,
			discoveredBy,
			imageUrl
		};
	}

	async function craftViaBackend(leftElement: ElementDefinition, rightElement: ElementDefinition) {
		if (!PB_BASE_URL || !pollenKey || !userEmail) {
			throw new Error('Crafting unavailable');
		}
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 30000);
		try {
			const response = await fetch(`${PB_BASE_URL}/craft`, {
				method: 'POST',
				headers: {
					'X-Pollen-Key': pollenKey,
					'X-User-Email': userEmail,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					leftId: leftElement.id,
					rightId: rightElement.id,
					userEmail,
					pollenKey
				}),
				signal: controller.signal
			});
			clearTimeout(timeout);
			if (!response.ok) {
				throw new Error('Crafting failed');
			}
			return (await response.json()) as CraftApiResponse;
		} catch (err) {
			clearTimeout(timeout);
			if (err instanceof Error && err.name !== 'AbortError') {
				console.error('craftViaBackend failed:', err);
			}
			throw err;
		}
	}

	async function loadInventoryFromBackend() {
		if (inventoryBusy) return;
		if (!PB_BASE_URL || !pollenKey || !userEmail) return;
		inventoryBusy = true;
		inventoryError = null;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15000);
		try {
			const response = await fetch(`${PB_BASE_URL}/inventory`, {
				method: 'POST',
				headers: {
					'X-Pollen-Key': pollenKey,
					'X-User-Email': userEmail,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ userEmail, pollenKey }),
				signal: controller.signal
			});
			clearTimeout(timeout);
			if (!response.ok) {
				throw new Error('Inventory load failed');
			}
			const data = (await response.json()) as InventoryApiResponse;
			const nextElements: Record<string, ElementDefinition> = { ...elements };
			const nextInventory: string[] = [];

			for (const record of data.elements) {
				const mapped = mapInventoryElement(record);
				nextElements[mapped.id] = mapped;
				nextInventory.push(mapped.id);
			}

			elements = nextElements;
			inventory = nextInventory;
			freshInventoryIds = [];
			backendFirstDiscoveryCount = data.firstDiscoveryCount ?? null;
			inventoryReady = true;
		} catch (error) {
			clearTimeout(timeout);
			if (error instanceof Error && error.name !== 'AbortError') {
				console.error('loadInventoryFromBackend failed:', error);
			}
			inventoryError = error instanceof Error ? error.message : 'Inventory unavailable';
			inventoryReady = false;
		} finally {
			inventoryBusy = false;
		}
	}

	async function resolveCombination(
		leftElement: ElementDefinition,
		rightElement: ElementDefinition
	): Promise<CraftResolution> {
		if (!PB_BASE_URL || !userEmail || !pollenKey) {
			throw new Error('Crafting unavailable');
		}
		const key = recipeKey(leftElement.id, rightElement.id);
		await wait(360);

		const cachedGenerated = generatedCombinationCache.get(key);
		if (cachedGenerated) {
			const isSameElement = leftElement.id === rightElement.id;
			const matchesInput =
				cachedGenerated.name.toLowerCase() === leftElement.name.toLowerCase();
			if (isSameElement && matchesInput) {
				console.log('[resolveCombination] rejecting stale same-element cache:', cachedGenerated.name);
				generatedCombinationCache.delete(key);
			} else {
				return { element: cachedGenerated, firstDiscovery: false, source: 'global-cache' };
			}
		}

		const response = await craftViaBackend(leftElement, rightElement);
		const origin = response.firstDiscovery ? 'generated' : 'cached';
		const element = mapBackendElement(response.element, leftElement, rightElement, origin);
		const rejectCache =
			leftElement.id === rightElement.id &&
			element.name.toLowerCase() === leftElement.name.toLowerCase();
		if (!rejectCache) {
			generatedCombinationCache.set(key, element);
		} else {
			console.log('[resolveCombination] not caching same-element result matching input:', element.name);
		}
		return {
			element,
			firstDiscovery: response.firstDiscovery,
			source: response.source ?? (response.firstDiscovery ? 'ai-sim' : 'global-cache')
		};
	}

	function wait(milliseconds: number) {
		return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
	}

	function hashString(value: string) {
		let hash = 0;
		for (let index = 0; index < value.length; index += 1) {
			hash = (hash << 5) - hash + value.charCodeAt(index);
			hash |= 0;
		}
		return Math.abs(hash >>> 0);
	}

	function settleNewFlag(uid?: string) {
		if (!uid) return;
		setTimeout(() => {
			placed = placed.map((piece) => (piece.uid === uid ? { ...piece, isNew: false } : piece));
		}, 820);
	}

	function announce(title: string, message: string, tone: Toast['tone']) {
		toast = { title, message, tone };
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			toast = null;
		}, 3200);
	}

	function clearWorkspace() {
		placed = [];
		menuOpen = false;
		announce('Table cleared', 'Your inventory and discoveries are still intact.', 'plain');
	}

	function resetRun() {
		placed = [];
		craftLog = [];
		freshInventoryIds = [];
		sortMode = 'discoveries';
		generatedCombinationCache.clear();
		menuOpen = false;
		if (PB_BASE_URL && userEmail && pollenKey) {
			inventoryReady = false;
			void loadInventoryFromBackend();
			announce('Run reset', 'Reloading your inventory from the backend.', 'plain');
			return;
		}
		elements = {};
		inventory = [];
		announce('Run reset', 'The table has been cleared.', 'plain');
	}

	function arrangeTable() {
		if (placed.length === 0) {
			announce('Empty table', 'Place an element before arranging the desk.', 'plain');
			return;
		}

		const width = tableNode?.clientWidth ?? 900;
		const height = tableNode?.clientHeight ?? 620;
		const radius = Math.min(180, Math.max(88, placed.length * 22));
		const centerX = width * 0.45;
		const centerY = height * 0.52;

		placed = placed.map((piece, index) => {
			const angle = (Math.PI * 2 * index) / placed.length - Math.PI / 2;
			return {
				...piece,
				x: clamp(centerX + Math.cos(angle) * radius, 70, width - 70),
				y: clamp(centerY + Math.sin(angle) * radius, 70, height - 70),
				rotation: Math.round(Math.sin(index + placed.length) * 6)
			};
		});
	}

	function downloadSnapshot() {
		const width = Math.round(tableNode?.clientWidth ?? 1200);
		const height = Math.round(tableNode?.clientHeight ?? 720);
		const elementMarkup = placed
			.map((piece) => {
				const item = elements[piece.elementId];
				if (!item) return '';
				return `<g transform="translate(${Math.round(piece.x)} ${Math.round(piece.y)}) rotate(${piece.rotation})"><circle r="24" fill="${escapeSvgAttribute(item.hue)}" stroke="${escapeSvgAttribute(item.ink)}" stroke-width="2"/><text y="43" text-anchor="middle" font-family="Georgia,serif" font-size="15" fill="#191713">${escapeSvgText(item.name)}</text></g>`;
			})
			.filter(Boolean)
			.join('');
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fbfaf4"/><text x="24" y="38" font-family="Georgia,serif" font-size="24" fill="#191713">Pollicraft Table</text>${elementMarkup}</svg>`;
		const blob = new Blob([svg], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'pollicraft-table.svg';
		anchor.click();
		URL.revokeObjectURL(url);
		announce('Snapshot exported', 'The current table was saved as an SVG.', 'plain');
	}

	function escapeSvgText(value: string) {
		return value.replace(/[&<>"'`]/g, (match) => {
			const entities: Record<string, string> = {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&apos;',
				'`': '&#96;'
			};
			return entities[match] ?? match;
		});
	}

	function escapeSvgAttribute(value: string) {
		return value.replace(/[&<>"'`\\]/g, (match) => {
			const entities: Record<string, string> = {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&apos;',
				'`': '&#96;',
				'\\': '&#92;'
			};
			return entities[match] ?? match;
		});
	}

	function orbStyle(item: ElementDefinition) {
		let imageRule = '';
		if (item.imageUrl) {
			try {
				const u = new URL(item.imageUrl);
				if (u.protocol === 'http:' || u.protocol === 'https:') {
					const safeUrl = encodeURI(item.imageUrl)
						.replace(/\\/g, '%5C')
						.replace(/"/g, '%22')
						.replace(/'/g, '%27');
					imageRule = `--orb-image: url("${safeUrl}")`;
				}
			} catch {
				// ignore invalid URL
			}
		}
		return `--orb-base: ${item.hue}; --orb-ink: ${item.ink}; --orb-glow: ${item.glow}; ${imageRule}`;
	}

	function pieceStyle(piece: PlacedElement, item: ElementDefinition) {
		return `left: ${piece.x}px; top: ${piece.y}px; --piece-rotate: ${piece.rotation}deg; --piece-scale: ${piece.scale}; ${orbStyle(item)}`;
	}

	function pieceClass(piece: PlacedElement) {
		return [
			'workspace-piece',
			activeDrag?.uid === piece.uid ? 'is-dragging' : '',
			collisionTargetUid === piece.uid ? 'is-target' : '',
			piece.isNew ? 'newly-born' : ''
		]
			.filter(Boolean)
			.join(' ');
	}
</script>

<svelte:head>
	<title>Pollicraft</title>
	<meta
		name="description"
		content="An infinite sandbox crafting game with personal discoveries and shared global alchemy."
	/>
</svelte:head>

<svelte:window
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerCancel}
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			menuOpen = false;
			helpOpen = false;
		}
	}}
/>

<main class="pollicraft-shell">
	<section class="craft-table" bind:this={tableNode} aria-label="Pollicraft workspace">
		<svg class="constellation-map" viewBox="0 0 1000 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
			<path d="M84 94 L103 113 M214 265 L230 303 M318 122 L344 151 M512 178 L516 236 L491 238 M648 88 L682 88 L701 45 M751 248 L790 215 M704 570 L727 594 M122 615 L139 585 L151 635" />
			<path d="M628 312 L650 292 L668 296 L648 315 Z M342 312 L382 340 M900 104 L930 54 M860 608 L887 629 M74 670 L97 675" />
			<circle cx="42" cy="143" r="2.4" />
			<circle cx="154" cy="77" r="1.8" />
			<circle cx="286" cy="54" r="2.8" />
			<circle cx="439" cy="220" r="3" />
			<circle cx="586" cy="362" r="1.6" />
			<circle cx="712" cy="314" r="2.4" />
			<circle cx="825" cy="494" r="2.1" />
			<circle cx="931" cy="660" r="1.7" />
		</svg>

		<header class="game-brand">
			<div class="brand-lockup">
				<p>global alchemy desk</p>
				<h1>Pollicraft</h1>
			</div>
		</header>

		{#if menuOpen}
			<div class="menu-sheet" role="dialog" aria-label="Session menu">
				<p class="menu-sheet__label">session</p>
				<button type="button" onclick={clearWorkspace}>
					<Trash2 size={16} />
					<span>Clear table</span>
				</button>
				<button type="button" onclick={resetRun}>
					<RotateCcw size={16} />
					<span>Reset run</span>
				</button>
				<button type="button" onclick={downloadSnapshot}>
					<Camera size={16} />
					<span>Export snapshot</span>
				</button>
				<div class="menu-sheet__section">
					<p class="menu-sheet__label">account</p>
					<div class="menu-sheet__account menu-sheet__account--row">
						{#if profilePicture}
							<img src={profilePicture} alt="" class="account-avatar" />
						{/if}
						<span>{userEmail ? displayName : 'Not connected'}</span>
						{#if identityBusy}
							<em>Linking...</em>
						{/if}
					</div>
					{#if identityError}
						<p class="menu-sheet__error">{identityError}</p>
					{/if}
				</div>
				<div class="menu-sheet__section">
					<p class="menu-sheet__label">pollinations</p>
					{#if pollenKey}
						<div class="menu-sheet__account">
							<span>Key connected</span>
							<button type="button" onclick={disconnectPollinations}>Disconnect</button>
						</div>
					{:else}
						<button type="button" onclick={connectPollinations} disabled={identityBusy}>
							Connect Pollinations
						</button>
					{/if}
				</div>
				<div class="menu-sheet__section">
					<p class="menu-sheet__label">guide</p>
					<button type="button" onclick={() => { menuOpen = false; helpOpen = true; }}>
						<BookOpen size={16} />
						<span>How to play</span>
					</button>
				</div>
				<div class="menu-sheet__status">
					<Clock size={15} />
					<span>{authStatus} · {apiStatus} · {pbStatus}</span>
				</div>
			</div>
		{/if}

		{#if helpOpen}
			<div class="help-panel" role="dialog" aria-label="Help and documentation">
				<div class="help-panel__header">
					<h2>How to play</h2>
					<button type="button" class="icon-button" onclick={() => (helpOpen = false)} aria-label="Close help">
						<Trash2 size={16} />
					</button>
				</div>
				<div class="help-panel__body">
					<section>
						<h3><Sparkles size={15} /> Crafting</h3>
						<p>
							Drag any two elements from the inventory or table onto each other. If the combination
							exists in the global atlas, the result appears instantly. Otherwise the AI imagines a
							new element and adds it to your collection.
						</p>
					</section>
					<section>
						<h3><WandSparkles size={15} /> Account</h3>
						<p>
							Connect your Pollinations account so the app can generate new elements.
							We never store your API key.
						</p>
					</section>
					<section>
						<h3><Trophy size={15} /> Discoveries</h3>
						<p>
							Elements discovered for the first time anywhere are marked as a first discovery.
							Your discovery score is shown in the stats bar on the right.
						</p>
					</section>
					<section>
						<h3><Menu size={15} /> Tips</h3>
						<ul>
							<li>Tap an inventory item to place it on the table.</li>
							<li>Drag two items together to craft something new.</li>
							<li>Use the menu to clear the table or export a snapshot.</li>
						</ul>
					</section>
				</div>
			</div>
		{/if}

		<div class="workspace-stage">
			{#if placed.length === 0}
				<div class="empty-state" aria-hidden="true">
					<span class="empty-state__mark"></span>
					<span>The table is quiet.</span>
				</div>
			{/if}

			{#each placed as piece (piece.uid)}
				{@const item = elements[piece.elementId]}
				{#if item}
					<div
						role="button"
						tabindex="0"
						class={pieceClass(piece)}
						style={pieceStyle(piece, item)}
						aria-label={`${item.name}. ${item.description}`}
						onpointerdown={(event) => beginDrag(event, piece.uid)}
						onkeydown={(event) => handlePieceKeydown(event, piece.uid)}
					>
						<span class="piece-sigil">
							<span class="element-orb" style={orbStyle(item)}></span>
						</span>
						<span class="piece-label item-title">{item.name}</span>
						<button
							type="button"
							class="piece-remove"
							aria-label={`Remove ${item.name}`}
							onpointerdown={(event) => event.stopPropagation()}
							onclick={(event) => {
								event.stopPropagation();
								removePiece(piece.uid);
							}}
						>
							<Trash2 size={13} />
						</button>
					</div>
				{/if}
			{/each}

			{#each Object.entries(activeSynthesisPoints) as [key, point] (key)}
				<div
					class="synthesis-marker"
					style="left: {point.x}px; top: {point.y}px;"
					aria-hidden="true"
				>
					<span></span>
				</div>
			{/each}
		</div>

		<div class="table-tools" aria-label="Workspace tools">
			<button type="button" onclick={() => (menuOpen = !menuOpen)}>
				<Menu size={16} />
				<span>Menu</span>
			</button>
			<button type="button" onclick={downloadSnapshot}>
				<Camera size={16} />
				<span>Photo</span>
			</button>
			<button type="button" onclick={clearWorkspace} disabled={placed.length === 0}>
				<Trash2 size={16} />
				<span>Clear</span>
			</button>
		</div>

		{#if toast}
			<div class={`discovery-toast is-${toast.tone}`} role="status" aria-live="polite">
				<Sparkles size={18} />
				<div>
					<strong>{toast.title}</strong>
					<span>{toast.message}</span>
				</div>
			</div>
		{/if}
	</section>

	<aside class="inventory-panel" aria-label="Personal inventory">
		<header class="inventory-header">
			<div>
				<h2>
					Inventory <span>{inventory.length}</span>
					{#if freshCount > 0}
						<em>{freshCount} new</em>
					{/if}
				</h2>
			</div>
			<button type="button" class="icon-button" aria-label="Arrange workspace pieces" onclick={arrangeTable}>
				<WandSparkles size={18} />
			</button>
		</header>

		{#if inventoryError}
			<div class="inventory-error" role="alert">
				<p>{inventoryError}</p>
				<button
					type="button"
					onclick={() => {
						inventoryError = null;
						inventoryReady = false;
						// Let the $effect trigger the load; no manual call to avoid race
						// The $effect watches inventoryError && !inventoryBusy && !inventoryReady
					}}
				>
					Retry
				</button>
			</div>
		{/if}

		{#if !userEmail || !pollenKey || !PB_BASE_URL}
			<div class="auth-banner">
				{#if !userEmail}
					<p>Connect Pollinations to start crafting.</p>
					<button type="button" onclick={() => (menuOpen = true)}>Open menu</button>
				{:else if !PB_BASE_URL}
					<p>Set PUBLIC_PB_URL to connect the backend.</p>
					<button type="button" onclick={() => (menuOpen = true)}>View status</button>
				{:else}
					<p>Connect Pollinations to craft new elements.</p>
					<button type="button" onclick={connectPollinations}>Connect Pollinations</button>
				{/if}
			</div>
		{/if}

		<div class="inventory-stats" aria-label="Discovery statistics">
			<span>
				<Trophy size={15} />
				{firstDiscoveryCount} first
			</span>
			<span>
				<Clock size={15} />
				{apiStatus}
			</span>
		</div>

		<div class="inventory-sort" aria-label="Inventory sort and view options">
			<button
				type="button"
				class:active={sortMode === 'discoveries'}
				aria-pressed={sortMode === 'discoveries'}
				onclick={() => (sortMode = 'discoveries')}
			>
				<Sparkles size={15} />
				Discoveries
			</button>
			<button
				type="button"
				class:active={sortMode === 'time'}
				aria-pressed={sortMode === 'time'}
				onclick={() => (sortMode = 'time')}
			>
				<Clock size={15} />
				Time
			</button>
			<button
				type="button"
				class:active={compactMode}
				aria-pressed={compactMode}
				onclick={() => (compactMode = !compactMode)}
			>
				Compact
			</button>
		</div>

		<label class="search-box">
			<Search size={18} />
			<input bind:value={searchTerm} placeholder="Search items" aria-label="Search inventory" />
		</label>

		<div class="inventory-list" class:compact-mode={compactMode}>
			{#each filteredInventory as item (item.id)}
				<button
					type="button"
					class={`inventory-item ${freshInventoryIds.includes(item.id) ? 'is-fresh' : ''}`}
					aria-label={`Drag or press Enter to place ${item.name}`}
					onpointerdown={(event) => beginInventoryPointer(event, item.id)}
					onkeydown={(event) => handleInventoryKeydown(event, item.id)}
				>
					<span class="element-orb" style={orbStyle(item)}></span>
					<span class="inventory-copy">
						<strong class="item-title">{item.name}</strong>
						<span class="flavor-text">{item.description}</span>
					</span>
					<span
						class={`origin-chip item-tag ${freshInventoryIds.includes(item.id) ? 'is-new' : `is-${item.origin}`}`}
					>
						{freshInventoryIds.includes(item.id) ? 'new' : originLabel(item.origin)}
					</span>
				</button>
			{:else}
				<p class="inventory-empty">No elements match that name.</p>
			{/each}
		</div>

		<section class="field-notes" aria-label="Discovery notes">
			<div class="field-notes__heading">
				<Sparkles size={16} />
				<h3>Discoveries</h3>
			</div>

			{#if craftLog.length === 0}
				<p class="field-notes__empty">No recorded discoveries yet.</p>
				{:else}
					<ul>
						{#each craftLog as entry (entry.uid)}
							{@const result = elements[entry.resultId]}
							{#if result}
								<li>
									<div>
										<strong class="item-title">{result.name}</strong>
										<span class="flavor-text">{entry.pair[0]} + {entry.pair[1]}</span>
									</div>
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
		</section>
	</aside>
</main>
