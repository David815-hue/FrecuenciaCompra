import PocketBase from 'pocketbase';

// Initialize PocketBase
// URL will be http://127.0.0.1:8090 when running locally
export const pb = new PocketBase('http://127.0.0.1:8090');

// Disable auto-cancellation of pending requests
pb.autoCancellation(false);

export default pb;
