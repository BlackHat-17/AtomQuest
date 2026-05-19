FROM node:18-alpine

WORKDIR /app

COPY . .

WORKDIR /app/backend

RUN npm install

RUN npx prisma generate

RUN npm run build

EXPOSE 8000

CMD ["npm", "start"]