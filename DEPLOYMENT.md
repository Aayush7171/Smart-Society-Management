# SMS Project Deployment Guide

## Backend Deployment on Render

### Step 1: Prepare Your Repository
1. Push your code to GitHub (if not already done)
2. Ensure `.env` file is in `.gitignore` (don't commit sensitive data)
3. Your `render.yaml` file is already configured

### Step 2: Deploy on Render
1. Go to [render.com](https://render.com) and sign up/login
2. Click **New +** → **Web Service**
3. Select your GitHub repository
4. Configure:
   - **Name**: `sms-api`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Branch**: main (or your default branch)
5. Add Environment Variables (in Render dashboard):
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: Generate a strong secret key
   - `FRONTEND_URL`: Your Netlify frontend URL (e.g., `https://your-app.netlify.app`)
6. Click **Deploy**

### Step 3: After Deployment
- Copy your Render API URL (e.g., `https://sms-api.onrender.com`)
- Update your frontend's `VITE_API_URL` environment variable with this URL

---

## Frontend Deployment on Netlify

### Prerequisites
- Frontend must be built (run `npm run build` locally to ensure no build errors)
- `netlify.toml` is already configured

### Step 1: Deploy on Netlify
1. Go to [netlify.com](https://netlify.com) and sign up/login
2. Click **Add new site** → **Import an existing project**
3. Select your GitHub repository
4. Configure:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. Click **Deploy site**

### Step 2: Set Environment Variables
1. Go to **Site settings** → **Build & deploy** → **Environment**
2. Click **Edit variables** and add:
   - `VITE_API_URL`: Your Render backend URL (e.g., `https://sms-api.onrender.com`)
3. Trigger a new deploy by pushing to GitHub

### Step 3: API Proxy Configuration
- The `netlify.toml` includes redirects for SPA routing
- Update the API base URL in your React components to use `import.meta.env.VITE_API_URL`

---

## Local Development

### Create `.env` files locally:

**backend/.env**
```
PORT=4000
JWT_SECRET=your-local-secret
NODE_ENV=development
```

**frontend/.env.local**
```
VITE_API_URL=http://localhost:4000
```

Then run:
```bash
# Terminal 1 - Backend
cd backend
npm install
npm run dev

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev
```

---

## Update API Configuration in React

In your React components, use environment variables:

```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// For API calls:
fetch(`${API_URL}/api/endpoint`)
```

---

## Common Issues & Fixes

**Issue**: 502 Bad Gateway on Render
- **Solution**: Check your server.js PORT configuration - ensure it uses `process.env.PORT`

**Issue**: CORS errors
- **Solution**: Ensure your backend CORS is configured to accept your Netlify domain

**Issue**: Frontend can't reach backend
- **Solution**: 
  1. Verify `VITE_API_URL` is set correctly in Netlify build variables
  2. Check network tab in browser DevTools for actual API URLs being called

---

## Monitoring & Logs

- **Render**: Go to Logs tab in your service dashboard
- **Netlify**: Go to Deploys → View deploy log
- **Both**: Check browser console for CORS or network errors

