FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ── Vite build-time env vars (baked into the JS bundle at build time) ────────
# All VITE_* vars must be declared as ARG + ENV to be accessible via import.meta.env
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

ARG VITE_GEMINI_API_KEY
ENV VITE_GEMINI_API_KEY=${VITE_GEMINI_API_KEY}

ARG VITE_AAD_CLIENT_ID
ENV VITE_AAD_CLIENT_ID=${VITE_AAD_CLIENT_ID}

ARG VITE_AAD_TENANT_ID
ENV VITE_AAD_TENANT_ID=${VITE_AAD_TENANT_ID}

ARG VITE_AAD_REDIRECT_URI
ENV VITE_AAD_REDIRECT_URI=${VITE_AAD_REDIRECT_URI}

RUN npm run build

FROM nginx:alpine

# Custom nginx config — enables SPA routing (React Router) and gzip compression
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]