# Quax API

Production-ready Rust backend with Axum, SQLx, and JWT authentication.

## Stack

| Layer | Technology |
|-------|------------|
| Web Framework | Axum 0.8 |
| Database | PostgreSQL 16 + SQLx 0.8 |
| Cache | Redis 7 (optional) |
| Auth | JWT + Argon2 |
| Async Runtime | Tokio 1.49 |
| Logging | Tracing + Structured JSON |
| Validation | Validator |

## Features

- **Authentication**: JWT access token (Bearer) + refresh token (httpOnly cookie)
- **Token Rotation**: Refresh tokens rotated on each use
- **Session Blacklisting**: Redis-based token revocation (optional, graceful degradation)
- **API Keys**: Machine-to-machine authentication with scoped permissions
- **Admin Dashboard**: User management, API key management, system statistics
- **File Uploads**: Local filesystem storage with configurable base URL
- **Rate Limiting**: Per-IP rate limiting via `DashMap`
- **Request Tracing**: Request ID + structured HTTP logging
- **Bootstrap System**: Automatic initial admin creation
- **Graceful Degradation**: Works without Redis (cache/blacklist disabled)

## Quick Start

```bash
cp .env.example .env
# Edit .env — set JWT secrets and DATABASE_URL

cargo sqlx migrate run
cargo run
```

API available at `http://localhost:8080`

## Project Structure

```
src/
├── feature/
│   ├── auth/              # Authentication (register, login, refresh)
│   │   ├── handlers/      # Request handlers
│   │   ├── types/         # DTOs and claims
│   │   ├── utils/         # JWT utilities
│   │   ├── service.rs     # Business logic
│   │   ├── repository.rs  # Data access
│   │   └── routes.rs      # Route definitions
│   ├── user/              # User profile management
│   │   ├── handlers/
│   │   ├── types/
│   │   ├── avatar.rs      # Avatar upload handling
│   │   ├── repository.rs
│   │   └── routes.rs
│   └── admin/             # Admin operations
│       ├── user/          # User management
│       ├── api_key/       # API key management
│       ├── stats/         # System statistics
│       └── log/           # Log management
├── infrastructure/
│   ├── web/
│   │   ├── middleware/    # Auth, rate limit, request ID, API key
│   │   └── response/      # ApiSuccess, ApiError, error codes
│   ├── persistence/       # Database pool, Redis, cache traits
│   ├── storage/           # File upload providers (local, S3)
│   ├── config.rs          # Configuration management
│   ├── env.rs             # Environment loading
│   └── logging.rs         # Structured logging setup
├── types/                 # Shared domain types
├── bootstrap.rs           # Initial admin setup
├── state.rs               # Application state
└── routes.rs              # Route aggregation
```

## API Endpoints

### Health
```
GET   /healthz                # Liveness probe
GET   /api/v1/health          # Detailed health check
```

### Authentication
```
POST  /api/v1/auth/register   # Register new user
POST  /api/v1/auth/login      # Login → sets refresh_token cookie
POST  /api/v1/auth/refresh    # Rotate tokens → new access + refresh
POST  /api/v1/auth/logout     # Clear refresh token cookie
```

### User
```
GET   /api/v1/user/me              # Get current user profile
PATCH /api/v1/user/me              # Update profile
PATCH /api/v1/user/me/avatar       # Upload avatar (multipart/form-data)
DELETE /api/v1/user/me/avatar      # Remove avatar
```

### Admin

#### Statistics
```
GET   /api/v1/admin/stats          # System statistics
```

#### Users
```
GET   /api/v1/admin/users          # List all users
GET   /api/v1/admin/users/:id      # Get user by ID
PATCH /api/v1/admin/users/:id      # Update user
DELETE /api/v1/admin/users/:id     # Delete user
POST  /api/v1/admin/users/:id/block # Toggle user block status
POST  /api/v1/admin/users/:id/role  # Change user role
```

#### API Keys
```
GET   /api/v1/admin/api-keys              # List API keys
POST  /api/v1/admin/api-keys              # Create new API key
GET   /api/v1/admin/api-keys/:id          # Get API key
PATCH /api/v1/admin/api-keys/:id          # Update API key
DELETE /api/v1/admin/api-keys/:id         # Delete API key
POST  /api/v1/admin/api-keys/:id/revoke   # Revoke API key
POST  /api/v1/admin/api-keys/:id/refresh  # Refresh (rotate) API key
```

#### Logs
```
GET   /api/v1/admin/logs           # Query logs (with filters)
GET   /api/v1/admin/log-level      # Get current log level
PATCH /api/v1/admin/log-level      # Change log level dynamically
```

### Media (Static Files)
```
GET   /media/*                     # Serve uploaded files
```

## Environment Variables

### Required
```env
RUST_ENV=development|production
SERVER_PORT=8080
DATABASE_URL=postgres://user:pass@host:5432/dbname

JWT_ACCESS_SECRET=min-32-chars-secret
JWT_REFRESH_SECRET=different-32-chars-secret
JWT_ACCESS_EXPIRY_SECS=3600
JWT_REFRESH_EXPIRY_SECS=604800
```

### Optional
```env
# Redis (optional - graceful degradation if not set)
REDIS_URL=redis://localhost:6379

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:8073,http://127.0.0.1:8073

# Upload
UPLOAD_DIR=./uploads
UPLOAD_BASE_URL=http://localhost:8080/media
MAX_AVATAR_SIZE=2097152

# Bootstrap
BOOTSTRAP_ENABLED=true
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=changeme
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_NAME=Administrator

# Cookies
COOKIE_SAMESITE=strict|lax|none
COOKIE_SECURE=true|false
COOKIE_HTTPONLY=true|false
```

See `.env.example` for full reference.

## Docker

### Local Development

```bash
# Start PostgreSQL and Redis
docker compose up -d postgres redis

# Or with profiles
docker compose --profile db up -d

# Full stack with Caddy
docker compose --profile db --profile caddy up -d
```

### Production Build

```bash
# Build optimized image
docker build -t quax-api:latest .

# Run with environment file
docker run -d --env-file .env -p 8080:8080 quax-api:latest
```

## Commands

### Development
```bash
cargo run                    # Start dev server
cargo build --release        # Production build
cargo clippy                 # Lint check
cargo fmt                    # Format code
```

### Database
```bash
cargo sqlx migrate run       # Run pending migrations
cargo sqlx migrate revert    # Revert last migration
cargo sqlx prepare           # Generate query metadata for offline builds
```

### Scripts
```bash
./scripts/migrate-reset.sh       # Reset database (with confirmation)
./scripts/migrate-reset-hard.sh  # Hard reset (no confirmation)
./scripts/reset-admin.sh         # Reset admin password via SQL
```

## Testing

### Unit Tests (No Docker Required)
```bash
cargo test --lib
```

### Integration Tests (Requires Docker)
```bash
# Full test suite with testcontainers
cargo test

# Specific test
cargo test test_full_auth_flow
```

### Test Structure
```
tests/
├── common/
│   └── mod.rs            # Shared test utilities
├── auth_flow.rs          # Authentication flow tests
├── redis_test.rs         # Redis integration tests
└── blacklist_test.rs     # Token blacklist tests
```

## Security Features

- **Password Hashing**: Argon2id with OWASP recommended parameters
- **JWT Security**: 
  - Separate secrets for access/refresh tokens
  - Short-lived access tokens (1 hour default)
  - Long-lived refresh tokens with rotation (7 days default)
- **Session Blacklisting**: Redis-based revocation for logout/token theft
- **API Keys**: Scoped permissions, hashed storage, expiration support
- **Rate Limiting**: Sliding window rate limiting per IP
- **File Uploads**: 
  - MIME type validation
  - Size limits (2MB default for avatars)
  - Path traversal protection
  - UUID-based filenames
- **Cookies**: httpOnly, secure in production, SameSite strict
- **CORS**: Configurable allowed origins

## Architecture Decisions

### Why Refresh Token Rotation?
Refresh tokens are rotated on each use to prevent replay attacks. If an attacker steals a refresh token, it becomes invalid after the legitimate user uses it. This provides better security than long-lived static refresh tokens.

### Why Optional Redis?
Redis is used for session blacklisting and caching, but the application works without it (graceful degradation). This simplifies local development and reduces infrastructure requirements for small deployments.

### Why Feature-Based Structure?
Code is organized by feature rather than layer (handlers, service, repository co-located). This makes it easier to understand and modify related code, and scales better as the application grows.

### Why SQLx Over ORM?
SQLx provides compile-time checked SQL with zero runtime overhead. It offers the safety of an ORM with the flexibility and performance of raw SQL.

## License

[MIT](../LICENSE)
