# Use the official Playwright image which includes all necessary browser dependencies
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

# Set working directory
WORKDIR /app

# Copy package manifests first for better caching
COPY package*.json ./

# Install all dependencies (including devDependencies for the build step)
# Using 'npm ci' for reproducible builds
RUN npm ci

# Copy the rest of the application source
COPY . .

# Build the TypeScript application
RUN npm run build

# Expose the port defined in the app
EXPOSE 3005

# Run the compiled application directly using Node for better performance in production
# This avoids the overhead of npm and the redundant build step in 'npm run dev'
CMD ["node", "dist/index.js"]




