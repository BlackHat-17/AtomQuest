# Production Deployment Checklist

Use this checklist to ensure a successful production deployment.

## Pre-Deployment

### Code Preparation
- [ ] All features tested locally
- [ ] No console.log statements in production code
- [ ] Environment variables properly configured
- [ ] Database migrations ready
- [ ] Build process tested locally
- [ ] Git repository up to date

### Security
- [ ] Strong JWT secret generated (32+ characters)
- [ ] Database credentials secured
- [ ] CORS origins properly configured
- [ ] No sensitive data in environment files committed to Git
- [ ] API rate limiting considered
- [ ] Input validation in place

## Backend Deployment (Render)

### Database Setup
- [ ] PostgreSQL database created on Render
- [ ] Database connection string obtained
- [ ] Database migrations planned

### Service Configuration
- [ ] Web service created and connected to GitHub
- [ ] Build command configured: `cd backend && npm ci && npm run build`
- [ ] Start command configured: `cd backend && npm start`
- [ ] Health check endpoint working: `/api/health`

### Environment Variables
- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `DATABASE_URL` set to PostgreSQL connection string
- [ ] `JWT_SECRET` generated and set
- [ ] `CORS_ORIGIN` set to frontend URL
- [ ] `FRONTEND_URL` set to frontend URL
- [ ] Optional variables configured (Azure AD, Gemini, SMTP)

### Post-Deployment
- [ ] Service deployed successfully
- [ ] Health check endpoint responding
- [ ] Database migrations run: `npx prisma migrate deploy`
- [ ] Database seeded: `npx prisma db seed`
- [ ] API endpoints responding correctly

## Frontend Deployment (Vercel)

### Project Setup
- [ ] GitHub repository connected to Vercel
- [ ] Build settings configured
- [ ] Root directory set to `frontend`
- [ ] Build command: `npm run build`
- [ ] Output directory: `dist`

### Environment Variables
- [ ] `VITE_API_BASE_URL` set to backend URL
- [ ] Optional variables configured (Azure AD, Gemini)

### Post-Deployment
- [ ] Frontend deployed successfully
- [ ] Application loads without errors
- [ ] API calls working (check browser network tab)
- [ ] Authentication flow working
- [ ] All major features functional

## Testing

### Functional Testing
- [ ] Login/logout working
- [ ] User roles (Employee, Manager, Admin) working
- [ ] Goal creation and management
- [ ] Achievement logging
- [ ] Manager approval workflows
- [ ] Admin analytics and reports
- [ ] AI features (if enabled)

### Performance Testing
- [ ] Page load times acceptable
- [ ] API response times reasonable
- [ ] Database queries optimized
- [ ] No memory leaks observed

### Cross-Browser Testing
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari (if applicable)
- [ ] Edge
- [ ] Mobile browsers

## Monitoring & Maintenance

### Monitoring Setup
- [ ] Error tracking configured
- [ ] Performance monitoring in place
- [ ] Database monitoring enabled
- [ ] Uptime monitoring configured

### Backup Strategy
- [ ] Database backup strategy defined
- [ ] Backup restoration tested
- [ ] Data retention policy established

### Documentation
- [ ] Deployment process documented
- [ ] Environment variables documented
- [ ] Troubleshooting guide created
- [ ] User documentation updated

## Go-Live

### Final Checks
- [ ] All checklist items completed
- [ ] Stakeholders notified
- [ ] Support team briefed
- [ ] Rollback plan prepared

### Launch
- [ ] DNS updated (if using custom domain)
- [ ] SSL certificates configured
- [ ] CDN configured (if applicable)
- [ ] Users notified of new system

### Post-Launch
- [ ] Monitor for errors and performance issues
- [ ] Collect user feedback
- [ ] Address any immediate issues
- [ ] Plan for future updates and maintenance

## Troubleshooting

### Common Issues
- **CORS Errors**: Check `CORS_ORIGIN` environment variable
- **Database Connection**: Verify `DATABASE_URL` and network access
- **Build Failures**: Check dependencies and build commands
- **Authentication Issues**: Verify JWT secret and token handling
- **API Errors**: Check backend logs and environment variables

### Support Contacts
- Backend Issues: Check Render service logs
- Frontend Issues: Check Vercel deployment logs
- Database Issues: Check Render PostgreSQL logs
- General Issues: Check application logs and browser console

---

**Note**: Keep this checklist updated as the application evolves and new requirements emerge.