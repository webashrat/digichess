const API_TARGET = 'https://api.digichess.org/api';

async function handler(req, { params }) {
    const { path } = await params;
    const targetPath = path.join('/');
    const originalUrl = new URL(req.url);
    const hasTrailingSlash = originalUrl.pathname.endsWith('/');
    const targetUrl = `${API_TARGET}/${targetPath}${hasTrailingSlash ? '/' : ''}${originalUrl.search}`;

    const headers = new Headers();
    for (const [key, value] of req.headers.entries()) {
        const lk = key.toLowerCase();
        if (['content-type', 'authorization', 'accept', 'accept-language', 'cookie'].includes(lk)) {
            headers.set(key, value);
        }
    }
    // Remove host so it doesn't conflict with the target
    headers.delete('host');

    const fetchOptions = {
        method: req.method,
        headers,
        redirect: 'manual',
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        try {
            const body = await req.text();
            if (body) fetchOptions.body = body;
        } catch (_) { }
    }

    try {
        let response = await fetch(targetUrl, fetchOptions);

        // Handle one level of redirect manually (e.g. trailing slash redirect)
        if ([301, 302, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (location) {
                const redirectUrl = new URL(location, targetUrl);
                const redirectOptions = {
                    method: [307, 308].includes(response.status) ? req.method : 'GET',
                    headers,
                    redirect: 'manual',
                };
                if ([307, 308].includes(response.status) && fetchOptions.body) {
                    redirectOptions.body = fetchOptions.body;
                }
                response = await fetch(redirectUrl.toString(), redirectOptions);
            }
        }

        const responseHeaders = new Headers();
        for (const [key, value] of response.headers.entries()) {
            if (!['transfer-encoding', 'connection', 'keep-alive', 'content-encoding'].includes(key.toLowerCase())) {
                responseHeaders.set(key, value);
            }
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    } catch (error) {
        return new Response(JSON.stringify({ detail: 'Proxy error: ' + error.message }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
