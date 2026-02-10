# Vercel Deployment Guide

## 📝 Prerequisites

1. ✅ Firebase project configured
2. ✅ Supabase project configured
3. ✅ Code tested locally

## 🚀 Deployment Steps

### 1. Install Vercel CLI (optional)
```bash
npm i -g vercel
```

### 2. Configure Environment Variables in Vercel

Go to your Vercel project settings → Environment Variables and add:

**From `.env.local`:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`  
- `SUPABASE_SERVICE_KEY`

**From `firebase-service-account.json`:**
- `FIREBASE_PROJECT_ID` → `frecuecia-4ee83`
- `FIREBASE_PRIVATE_KEY_ID` → (from JSON)
- `FIREBASE_PRIVATE_KEY` → **Full private key** including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
  - ⚠️ **IMPORTANT**: Wrap in quotes and replace actual newlines with `\n`
- `FIREBASE_CLIENT_EMAIL` → `firebase-adminsdk-xxxxx@frecuecia-4ee83.iam.gserviceaccount.com`
- `FIREBASE_CLIENT_ID` → (from JSON)
- `FIREBASE_CERT_URL` → (from JSON `client_x509_cert_url`)

### 3. Deploy

**Via GitHub (recommended):**
1. Push code to GitHub
2. Import repository in Vercel
3. Vercel auto-deploys on each push

**Via CLI:**
```bash
vercel --prod
```

### 4. Verify

- Login should work
- Admin Panel should load users
- User creation/editing/deletion should work

## 📁 Project Structure for Vercel

```
/api
  /users
    index.js       → GET/POST /api/users
    [uid].js       → PUT/DELETE /api/users/:uid
/src               → React app
/public            → Static assets
```

## ⚠️ Important Notes

- **API Routes**: The `/api` folder is automatically recognized by Vercel as serverless functions
- **Environment Variables**: Must be set in Vercel dashboard (not in code)
- **Private Key**: The Firebase private key must have `\n` instead of actual newlines
- **Local Development**: Uses `localhost:3001` (Express server)
- **Production**: Uses `/api` (Vercel serverless functions)

## 🔥 Common Issues

**Issue**: "Firebase Admin not initialized"  
**Fix**: Check that all `FIREBASE_*` environment variables are set correctly in Vercel

**Issue**: CORS errors  
**Fix**: Serverless functions already include CORS headers, check browser console

**Issue**: "Method not allowed"  
**Fix**: Vercel route might not match, check `/api/users` and `/api/users/[uid]` structure

