# Goal Tracking Portal

A comprehensive goal management system with role-based access control, cycle management, and achievement tracking. Built with React, Node.js, Express, PostgreSQL, and Redis.

## 🏗️ Architecture

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Authentication**: JWT + Optional Azure AD SSO
- **Testing**: Vitest (Backend) + Playwright (E2E)

## 📋 Prerequisites

Before running the application, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** (v8 or higher)
- **Docker** and **Docker Compose** (for database services)
- **Git**

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd goal-tracking-portal
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install workspace dependencies (frontend + backend)
npm install --workspaces
```

### 3. Start Database Services

```bash
# Start PostgreSQL and Redis using Docker Compose
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 4. Configure Environment Variables

#### Backend Configuration

```bash
# Copy the example environment file
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your configuration:

```env
# Database
DATABASE_URL=postgresql://goalportal:goalportal_secret@localhost:5433/goalportal

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secrets (generate secure random strings)
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
JWT_REFRESH_SECRET=your-super-secret-refresh-key-at-least-32-characters-long

# Server
PORT=3000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# Optional: Azure AD SSO (leave blank to disable)
AAD_TENANT_ID=
AAD_CLIENT_ID=
AAD_CLIENT_SECRET=
AAD_GROUP_ADMIN=
AAD_GROUP_MANAGER=
AAD_GROUP_EMPLOYEE=

# Optional: Email notifications (leave SMTP_HOST blank to disable)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Optional: Teams notifications (leave blank to disable)
TEAMS_WEBHOOK_URL=
```

#### Frontend Configuration

```bash
# Copy the example environment file
cp frontend/.env.example frontend/.env
```

The default configuration should work for local development:

```env
VITE_API_URL=http://localhost:3000/api
```

### 5. Setup Database

```bash
cd backend

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Seed the database with demo data
npm run db:seed
```

### 6. Start the Application

#### Option A: Start Both Services Simultaneously

```bash
# From the root directory
npm run dev:backend &
npm run dev:frontend
```

#### Option B: Start Services in Separate Terminals

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### 7. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Database Admin** (Prisma Studio): `cd backend && npm run db:studio`

## 👥 Demo Accounts

After seeding the database, you can use these demo accounts:

| Role | Name | Email | Password | Department |
|------|------|-------|----------|------------|
| Admin | Admin User | admin@demo.com | Admin@123 | HR |
| Manager | Manager User | manager@demo.com | Manager@123 | Engineering |
| Employee | Employee User | employee@demo.com | Employee@123 | Engineering |
| Employee | Alice Chen | alice@demo.com | Employee@123 | Engineering |
| Employee | Bob Kumar | bob@demo.com | Employee@123 | Sales |
| Employee | Carol Smith | carol@demo.com | Employee@123 | Sales |

**Note**: All employees report to the Manager User. The seed data includes:
- Complete goal sheets with achievements for most users
- Sample check-ins and manager feedback
- Multiple goal cycles (GOAL_SETTING, Q1, Q2, Q3, Q4)
- Rich demo data for testing analytics and reporting features

## 🛠️ Development Commands

### Root Level Commands

```bash
# Install all dependencies
npm install --workspaces

# Run linting for all workspaces
npm run lint

# Format code with Prettier
npm run format

# Start frontend development server
npm run dev:frontend

# Start backend development server
npm run dev:backend

# Build frontend for production
npm run build:frontend

# Build backend for production
npm run build:backend
```

### Backend Commands

```bash
cd backend

# Development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Database commands
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:push        # Push schema changes
npm run db:studio      # Open Prisma Studio
npm run db:seed        # Seed demo data
npm run db:clear       # Clear achievements data
npm run db:reset-data  # Clear and re-seed data

# Testing
npm run test           # Run tests once
npm run test:watch     # Run tests in watch mode

# Type checking and linting
npm run type-check
npm run lint
```

### Frontend Commands

```bash
cd frontend

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking and linting
npm run type-check
npm run lint
```

## 🧪 Testing

### Backend Testing

```bash
cd backend

# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npx vitest run src/tests/scoring.property.test.ts
```

### End-to-End Testing

```bash
cd frontend

# Install Playwright browsers (first time only)
npx playwright install

# Run E2E tests
npx playwright test

# Run E2E tests with UI
npx playwright test --ui

# Run specific test file
npx playwright test e2e/admin.spec.ts
```

## 🗄️ Database Management

### Common Database Operations

```bash
cd backend

# Reset database to clean state
npm run db:clear && npm run db:seed

# Check goal status (debugging)
npm run db:check-status

# View database in browser
npm run db:studio
```

### Manual Database Reset

If you need to completely reset the database:

```bash
# Stop services
docker-compose down

# Remove database volume
docker volume rm goal-tracking-portal_postgres_data

# Restart services
docker-compose up -d

# Re-run migrations and seed
cd backend
npm run db:migrate
npm run db:seed
```

## 🔧 Configuration

### Environment Variables

#### Required Backend Variables

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret for JWT token signing
- `JWT_REFRESH_SECRET`: Secret for refresh token signing
- `PORT`: Server port (default: 3000)
- `FRONTEND_URL`: Frontend URL for CORS

#### Optional Backend Variables

- `REDIS_URL`: Redis connection string (caching)
- `AAD_*`: Azure AD configuration for SSO
- `SMTP_*`: Email notification configuration
- `TEAMS_WEBHOOK_URL`: Microsoft Teams notifications

#### Frontend Variables

- `VITE_API_URL`: Backend API base URL

### Docker Services

The `docker-compose.yml` provides:

- **PostgreSQL**: Database server on port 5432
- **Redis**: Cache server on port 6379

Both services include health checks and persistent volumes.

## 📁 Project Structure

```
goal-tracking-portal/
├── backend/                 # Node.js + Express backend
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── middleware/     # Express middleware
│   │   ├── services/       # Business logic services
│   │   ├── lib/           # Utilities and configurations
│   │   └── tests/         # Test files
│   ├── prisma/            # Database schema and migrations
│   └── package.json
├── frontend/               # React + TypeScript frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utilities and API client
│   │   └── types/         # TypeScript type definitions
│   ├── e2e/              # End-to-end tests
│   └── package.json
├── docker-compose.yml     # Database services
└── package.json          # Root workspace configuration
```

## 🚀 Production Deployment

### Environment Setup

1. **Database**: Set up PostgreSQL instance
2. **Cache**: Set up Redis instance (optional but recommended)
3. **Environment Variables**: Configure production values
4. **SSL**: Enable HTTPS for production

### Build and Deploy

```bash
# Build both applications
npm run build:backend
npm run build:frontend

# Backend deployment
cd backend
npm start

# Frontend deployment
# Deploy the frontend/dist folder to your static hosting service
```

### Production Considerations

- Use environment-specific JWT secrets
- Enable HTTPS/SSL
- Configure proper CORS origins
- Set up database backups
- Configure monitoring and logging
- Use a process manager like PM2 for the backend

## 🔍 Troubleshooting

### Common Issues

#### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps

# Check database logs
docker-compose logs postgres

# Restart database services
docker-compose restart postgres
```

#### Port Conflicts

If ports 3000, 5173, 5432, or 6379 are in use:

1. Stop conflicting services
2. Or modify ports in configuration files
3. Update environment variables accordingly

#### Permission Issues

```bash
# Fix npm permission issues
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

#### Database Schema Issues

```bash
cd backend

# Reset database schema
npm run db:push --force-reset
npm run db:seed
```

### Getting Help

1. Check the [TESTING_GUIDE.md](./TESTING_GUIDE.md) for detailed testing procedures
2. Review application logs in the terminal
3. Check browser developer console for frontend issues
4. Use Prisma Studio to inspect database state: `npm run db:studio`

## 📚 Additional Documentation

- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Comprehensive testing procedures
- [DATABASE_MANAGEMENT.md](./DATABASE_MANAGEMENT.md) - Database operations guide
- [frontend/e2e/README.md](./frontend/e2e/README.md) - E2E testing setup

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests: `npm run test`
5. Commit your changes: `git commit -m 'Add some feature'`
6. Push to the branch: `git push origin feature/your-feature`
7. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🌐 Deployment

### Production Deployment

The application is designed to be deployed with:
- **Backend**: Render (with PostgreSQL database)
- **Frontend**: Vercel

#### Quick Deploy

1. **Prepare for deployment**:
   ```bash
   # Windows
   scripts/deploy.bat
   
   # Linux/macOS
   scripts/deploy.sh
   ```

2. **Deploy Backend to Render**:
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Create new Blueprint and connect your GitHub repository
   - Render will automatically use the `render.yaml` configuration

3. **Deploy Frontend to Vercel**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Import your GitHub repository
   - Configure environment variables

#### Detailed Instructions

See [deploy.md](./deploy.md) for comprehensive deployment instructions, environment variable configuration, and troubleshooting.

### Environment Variables

#### Backend (Render)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secure random string for JWT signing
- `CORS_ORIGIN` - Frontend URL for CORS
- Optional: Azure AD, Gemini AI, SMTP settings

#### Frontend (Vercel)
- `VITE_API_BASE_URL` - Backend API URL
- Optional: Azure AD, Gemini AI settings

### Health Checks
- Backend: `https://your-backend-url.onrender.com/api/health`
- Frontend: Visit your frontend URL


### LIVE HOSTING

```bash 
      http://ec2-65-2-129-60.ap-south-1.compute.amazonaws.com/login

      Login Credentials
      Email: admin@demo.com
      Password: Admin@123

      Email: employee@demo.com
      Password: Employee@123 

      Email: manager@demo.com
      Password: Manager@123
```