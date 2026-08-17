# Node 伺服器：提供網頁 + 接收報名並寄信
FROM node:20-alpine

WORKDIR /app

# 先只複製套件清單，這樣改網頁時不用重新安裝套件，部署比較快
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 伺服器程式與靜態網頁
COPY server.js ./
COPY public ./public

# 不要用 root 執行
USER node

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
