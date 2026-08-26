FROM node:20-slim

LABEL org.opencontainers.image.title="SyncMyDep"
LABEL org.opencontainers.image.description="Automated dependency synchronization and lockfile auto-fixer across npm, pnpm, yarn, bun, and deno."
LABEL org.opencontainers.image.source="https://github.com/nivinvysakh/syncmydep"
LABEL org.opencontainers.image.licenses="MIT"

# Install required system tools (git, curl, unzip for bun/deno)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack for native pnpm and yarn support
RUN corepack enable && corepack prepare pnpm@9 --activate

# Install Bun and Deno
RUN curl -fsSL https://bun.sh/install | bash
RUN curl -fsSL https://deno.land/install.sh | sh

# Configure environment PATH for bun and deno
ENV PATH="/root/.bun/bin:/root/.deno/bin:${PATH}"

# Set default working directory for mounted repositories
WORKDIR /workspace

# Copy built distribution files to /app
COPY dist/ /app/dist/
COPY dist-cli/ /app/dist-cli/
COPY package.json /app/

# Set CLI action entrypoint
ENTRYPOINT ["node", "/app/dist-cli/index.js"]
