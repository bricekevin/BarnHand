# Frontend Dockerfile for BarnHand React Application
FROM node:20-alpine as base

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Development stage
FROM base as development
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Production build stage
FROM base as build
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine as production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]