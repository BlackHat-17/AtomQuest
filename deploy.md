# Deployment Guide

This guide covers deploying the GoalTrack application with the backend on Render and frontend on Vercel.

## Prerequisites

1. **GitHub Repository**: Push your code to a GitHub repository
2. **Render Account**: Sign up at [render.com](https://render.com)
3. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)

## Backend Deployment on Render

### Option 1: Using render.yaml (Recommended)

1. **Connect Repository**:
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect the `render.yaml` file

2. **Configure Environment Variables**:
   - The database and JWT secret will be auto-generated
   - Update `CORS_ORIGIN` if your frontend URL differs
   - Add optional variables (Azure AD, Gemini API, SMTP) as needed

### Option 2: Manual Setup

1. **Create PostgreSQL Database**:
   - Go to Render Dashboard
   - Click "New" → "PostgreSQL"
   - Name: `goaltrack-db`
   - Plan: Free
   - Copy the connection string

2. **Create Web Service**:
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `goaltrack-backend`
     - **Environment**: Node
     - **Build Command**: `cd backend && npm ci && npm run build`
     - **Start Command**: `cd backend && npm start`
     - **Plan**: Free

3. **Set Environment Variables**:
   ```
   NODE_ENV=production
   PORT=3000
   DATABASE_URL=<your-postgres-connection-string>
   JWT_SECRET=<generate-a-secure-random-string>
   CORS_ORIGIN=https://goaltrack-frontend.vercel.app
   FRONTEND_URL=https://goaltrack-frontend.vercel.app
   ```

4. **Deploy**:
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Note your backend URL (e.g., `https://goaltrack-backend.onrender.com`)

## Frontend Deployment on Vercel

### Option 1: Using Vercel CLI (Recommended)

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel --prod
   ```

4. **Configure Environment Variables**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Select your project
   - Go to Settings → Environment Variables
   - Add:
     ```
     VITE_API_BASE_URL=https://goaltrack-backend.onrender.com/api
     ```

### Option 2: GitHub Integration

1. **Connect Repository**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository

2. **Configure Build Settings**:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm ci`

3. **Set Environment Variables**:
   ```
   VITE_API_BASE_URL=https://goaltrack-backend.onrender.com/api
   ```

4. **Deploy**:
   - Click "Deploy"
   - Wait for deployment to complete

## Post-Deployment Setup

### 1. Database Migration

After backend deployment, run database migrations:

```bash
# Connect to your Render service terminal or use a local connection
npx prisma migrate deploy
npx prisma db seed
```

### 2. Update CORS Settings

Ensure your backend CORS settings include your actual frontend URL:

```env
CORS_ORIGIN=https://your-actual-frontend-url.vercel.app
```

### 3. Test the Application

1. Visit your frontend URL
2. Try logging in with seeded credentials
3. Test key functionality across different user roles

## Environment Variables Reference

### Backend (Render)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | Yes | Set to `3000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secure random string for JWT signing |
| `CORS_ORIGIN` | Yes | Frontend URL for CORS |
| `FRONTEND_URL` | Yes | Frontend URL for redirects |
| `AZURE_AD_CLIENT_ID` | No | Azure AD app client ID |
| `AZURE_AD_CLIENT_SECRET` | No | Azure AD app client secret |
| `AZURE_AD_TENANT_ID` | No | Azure AD tenant ID |
| `GEMINI_API_KEY` | No | Google Gemini API key |
| `SMTP_HOST` | No | Email server host |
| `SMTP_PORT` | No | Email server port |
| `SMTP_USER` | No | Email username |
| `SMTP_PASS` | No | Email password |
| `FROM_EMAIL` | No | From email address |

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | Backend API URL |
| `VITE_AAD_CLIENT_ID` | No | Azure AD app client ID |
| `VITE_AAD_TENANT_ID` | No | Azure AD tenant ID |
| `VITE_GEMINI_API_KEY` | No | Google Gemini API key |

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure `CORS_ORIGIN` matches your frontend URL exactly
2. **Database Connection**: Verify `DATABASE_URL` is correct and accessible
3. **Build Failures**: Check that all dependencies are in `package.json`
4. **Environment Variables**: Ensure all required variables are set

### Logs

- **Render**: View logs in the Render dashboard under your service
- **Vercel**: View logs in the Vercel dashboard under your project

### Health Checks

- Backend health: `https://your-backend-url.onrender.com/api/health`
- Frontend: Visit your frontend URL and check browser console

## Scaling Considerations

### Free Tier Limitations

- **Render**: 
  - 750 hours/month compute time
  - Services sleep after 15 minutes of inactivity
  - 1GB RAM, 0.5 CPU

- **Vercel**:
  - 100GB bandwidth/month
  - 6,000 build minutes/month
  - Unlimited static requests

### Upgrading

For production use, consider upgrading to paid plans for:
- Always-on services (no sleep)
- More compute resources
- Better performance
- Custom domains
- Advanced analytics

## Security Checklist

- [ ] Strong JWT secret generated
- [ ] Database credentials secured
- [ ] CORS properly configured
- [ ] HTTPS enforced
- [ ] Environment variables not exposed in client
- [ ] API rate limiting considered
- [ ] Input validation in place
- [ ] SQL injection protection (Prisma handles this)