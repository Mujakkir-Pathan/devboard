FROM node:22 AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .
RUN npm run build 

FROM nginx:alpine

WORKDIR /app

COPY --from=build /app/dist /usr/share/nginx/html

