FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY app.js ./
COPY public ./public

# Expose port
EXPOSE 3000

# Run the application
CMD ["npm", "start"] 