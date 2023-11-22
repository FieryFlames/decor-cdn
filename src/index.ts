export interface Env {
	API_URL: string;
	UGC: R2Bucket;
}

export interface Decoration {
	hash: string;
	animated: boolean;
	alt: string | null;
	authorId: string | null;
	reviewed: boolean | null;
	presetId: string | null;
}

async function getDecoration(hash: string, env: Env): Promise<Decoration | null> {
	const decorationReq = await fetch(`${env.API_URL}/decorations/${hash}`);
	if (decorationReq.ok) return decorationReq.json();
	return null;
}

function getFileName(hash: string, animated: boolean): string {
	return `${animated ? 'a_' : ''}${hash}.png`;
}

function isDecorationApproved(decoration: Decoration): boolean {
	return decoration.reviewed !== false;
}

const BASE_HEADERS = {
	'Access-Control-Allow-Origin': '*',
};

const TTL_1_YEAR = 60 * 60 * 24 * 365;
const TTL_1_DAY = 60 * 60 * 24;
const TTL_1_HOUR = 60 * 60;

// https://decorcdn.fieryflames.dev/abcdefg.png
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const cache = caches.default;
		const cachedResponse = await cache.match(request);
		if (cachedResponse) return cachedResponse;

		const url = new URL(request.url);

		const filename = url.pathname.slice(1);
		if (!filename.endsWith('.png')) return new Response('Not Found', { status: 404, headers: new Headers(BASE_HEADERS) });

		let hash = filename.slice(0, -4);
		if (hash.startsWith('a_')) hash = hash.slice(2);

		const decoration = await getDecoration(hash, env);
		if (!decoration) return new Response('Decoration not found', { status: 404, headers: new Headers(BASE_HEADERS) });

		const animateParam = url.searchParams.get("animate")
		const animate = decoration.animated && ((animateParam ? animateParam === "true" : null) ?? filename.startsWith('a_'));

		const object = await env.UGC.get(getFileName(hash, animate));
		if (!object) return new Response('Not Found', { status: 404, headers: new Headers(BASE_HEADERS) });

		const ttl = isDecorationApproved(decoration) ? TTL_1_YEAR : TTL_1_HOUR;

		const headers = new Headers({
			...BASE_HEADERS,
			'Content-Type': 'image/png',
			'Cache-Control': `public, max-age=${ttl}`,
		});

		const response = new Response(object.body, { headers });

		await cache.put(request, response.clone());

		return response;
	},
};
