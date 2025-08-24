FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
RUN npx puppeteer browsers install chrome
COPY . .
EXPOSE 3000
USER node
CMD ["npm", "start"]
