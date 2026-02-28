FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copy source
COPY . .

# Expose port
ENV PORT=3000
EXPOSE 3000

# Run
CMD ["bun", "run", "src/server.ts"]
