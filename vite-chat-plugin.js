import { config } from 'dotenv';

// Load .env.local for the GROQ_API_KEY
config({ path: '.env.local' });

/**
 * Vite plugin that adds /api/chat as dev server middleware.
 * This eliminates the need to run the Express server separately
 * just for the AI chat endpoint during development.
 * 
 * In production (Vercel), the api/chat.js serverless function handles this.
 */
export default function chatApiPlugin() {
    return {
        name: 'chat-api-middleware',
        configureServer(server) {
            server.middlewares.use('/api/chat', async (req, res) => {
                // Only handle POST
                if (req.method === 'OPTIONS') {
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                    res.writeHead(200);
                    res.end();
                    return;
                }

                if (req.method !== 'POST') {
                    res.writeHead(405, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                    return;
                }

                // Parse body
                let body = '';
                for await (const chunk of req) {
                    body += chunk;
                }

                let parsed;
                try {
                    parsed = JSON.parse(body);
                } catch {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
                    return;
                }

                // Dynamically import the handler from api/chat.js
                // We create a fake req/res to reuse the Vercel handler
                try {
                    const { default: handler } = await import('./api/chat.js');

                    const fakeReq = {
                        method: 'POST',
                        body: parsed
                    };

                    const fakeRes = {
                        _statusCode: 200,
                        _headers: {},
                        setHeader(key, value) { this._headers[key] = value; },
                        status(code) { this._statusCode = code; return this; },
                        json(data) {
                            res.writeHead(this._statusCode, {
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*'
                            });
                            res.end(JSON.stringify(data));
                        },
                        end() {
                            res.writeHead(this._statusCode);
                            res.end();
                        }
                    };

                    await handler(fakeReq, fakeRes);
                } catch (error) {
                    console.error('❌ Error in chat API middleware:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: error.message }));
                }
            });
        }
    };
}
