import { config } from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'url';

// Load env variables
config({ path: '.env.local' });

/**
 * Vite plugin that intercepts all /api/* requests and forwards them to
 * the corresponding serverless function in the api/ directory.
 * This completely eliminates the need to run the separate Express server
 * in development.
 */
export default function apiMiddlewarePlugin() {
    return {
        name: 'api-middleware',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                // Parse URL and pathname
                const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
                const pathname = url.pathname;

                // Only intercept requests starting with /api/
                if (!pathname.startsWith('/api/')) {
                    return next();
                }

                console.log(`🔌 [Vite API Plugin] Intercepted request: ${req.method} ${pathname}`);

                // CORS preflight options handler
                if (req.method === 'OPTIONS') {
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
                    res.writeHead(200);
                    res.end();
                    return;
                }

                // Parse query parameters
                const query = {};
                for (const [key, value] of url.searchParams.entries()) {
                    query[key] = value;
                }

                // Map route path to file path
                let handlerPath = null;

                if (pathname === '/api/chat') {
                    handlerPath = './api/chat.js';
                } else if (pathname === '/api/change-password') {
                    handlerPath = './api/change-password.js';
                } else if (pathname === '/api/users' || pathname === '/api/users/') {
                    handlerPath = './api/users/index.js';
                } else {
                    // Check for /api/users/:uid
                    const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
                    if (userMatch) {
                        handlerPath = './api/users/[uid].js';
                        query.uid = userMatch[1];
                    }
                }

                // If no matching handler, let it pass (or return 404)
                if (!handlerPath) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Endpoint not found' }));
                    return;
                }

                // Parse request body for POST/PUT requests
                let body = null;
                if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
                    try {
                        let rawBody = '';
                        for await (const chunk of req) {
                            rawBody += chunk;
                        }
                        if (rawBody) {
                            body = JSON.parse(rawBody);
                        }
                    } catch (err) {
                        console.error('⚠️ [Vite API Plugin] Error parsing JSON body:', err.message);
                    }
                }

                try {
                    // Resolve and import the serverless function handler
                    const absolutePath = path.resolve(process.cwd(), handlerPath);
                    const fileUrl = pathToFileURL(absolutePath).href;
                    const { default: handler } = await import(fileUrl);

                    const fakeReq = {
                        method: req.method,
                        body: body,
                        query: query,
                        headers: req.headers
                    };

                    const fakeRes = {
                        _statusCode: 200,
                        _headers: {},
                        setHeader(key, value) {
                            this._headers[key] = value;
                            res.setHeader(key, value);
                        },
                        status(code) {
                            this._statusCode = code;
                            return this;
                        },
                        json(data) {
                            res.writeHead(this._statusCode, {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*',
                                ...this._headers
                            });
                            res.end(JSON.stringify(data));
                            return this;
                        },
                        end(data) {
                            res.writeHead(this._statusCode, this._headers);
                            res.end(data);
                            return this;
                        }
                    };

                    await handler(fakeReq, fakeRes);
                } catch (error) {
                    console.error(`❌ [Vite API Plugin] Error in handler for ${pathname}:`, error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: error.message }));
                }
            });
        }
    };
}
