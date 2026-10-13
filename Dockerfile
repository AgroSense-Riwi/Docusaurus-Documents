FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN DOCUSAURUS_BASE_URL=/ npm run build

FROM nginx:alpine AS runtime

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
