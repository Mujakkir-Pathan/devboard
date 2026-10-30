FROM dhi.io/node:26-dev AS build

WORKDIR /app

COPY package*.json ./

RUN npm install --legacy-peer-deps

RUN npm list vite > /dev/null 2>&1 || npm install --no-save --legacy-peer-deps vite@5.4.11

COPY . .

RUN npm run build

FROM dhi.io/node:26

WORKDIR /app

COPY --from=build /app/dist ./dist

COPY --from=build /app/node_modules ./node_modules

COPY vite.preview.config.js ./vite.config.js

EXPOSE 4173

ENTRYPOINT ["node", "--no-warnings"]
CMD ["./node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "4173"]
