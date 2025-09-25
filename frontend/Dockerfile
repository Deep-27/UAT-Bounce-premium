# frontend/Dockerfile
FROM node:18

WORKDIR /app

# Install dependencies first
COPY package*.json ./
RUN npm install

# Copy rest of the code
COPY . .

EXPOSE 5173

# Run dev server
CMD ["npm", "run", "dev"]
