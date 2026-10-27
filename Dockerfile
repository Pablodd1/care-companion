FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY dist ./dist

EXPOSE 3000
CMD ["node", "dist/boot.js"]
