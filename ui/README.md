# Quax UI

React 19 + Vite frontend with TanStack Router and shadcn/ui.

## Stack

| Component | Technology |
|-----------|------------|
| Framework | React 19 |
| Build Tool | Vite 7 |
| Language | TypeScript 5.9 |
| Router | TanStack Router |
| State (Server) | TanStack Query (React Query) |
| State (Client) | Zustand |
| Styling | Tailwind CSS 4 |
| UI Components | shadcn/ui + Radix UI |
| Icons | Lucide React |
| Notifications | Sonner |
| Charts | Recharts |

## Features

- **Authentication**: JWT-based auth with automatic token refresh
- **Protected Routes**: Route guards with role-based access control
- **Admin Dashboard**: 
  - User management (CRUD, block, role change)
  - API key management (create, revoke, rotate)
  - System statistics and monitoring
  - Real-time log viewing with level control
- **Settings**:
  - Profile management with avatar upload
  - Password change
  - Session management
- **Responsive Design**: Mobile-first, works on all devices
- **Dark Mode**: Automatic system preference detection
- **Type Safety**: Full TypeScript coverage with generated route types

## Quick Start

```bash
# Install dependencies
bun install

# Copy environment template
cp .env.example .env
# Edit .env - set VITE_API_URL

# Start development server
bun run dev
```

App available at `http://localhost:8073`

## Project Structure

```
src/
├── features/              # Feature-based modules
│   ├── auth/              # Authentication (login, register)
│   │   ├── components/    # LoginForm, RegisterForm
│   │   ├── hooks/         # useLogin, useRegister
│   │   ├── types/         # Auth types
│   │   └── stores/        # Auth store
│   ├── admin/             # Admin dashboard
│   │   ├── components/    # AdminDashboard, UsersTable, ApiKeysTable
│   │   ├── hooks/         # useUsers, useApiKeys, useStats
│   │   ├── types/         # Admin types
│   │   └── routes/        # Admin route components
│   ├── settings/          # Settings pages
│   │   ├── components/    # ProfileSettings, SecuritySettings
│   │   └── hooks/         # useUpdateProfile, useChangePassword
│   └── home/              # Landing page
│       └── components/    # HeroSection, FeaturesSection
├── components/            # Shared components
│   ├── ui/                # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   └── layout/            # Layout components
│       ├── AppLayout.tsx
│       ├── AppSidebar.tsx
│       └── BreadcrumbNav.tsx
├── routes/                # TanStack Router file-based routes
│   ├── __root.tsx         # Root layout
│   ├── index.tsx          # Landing page
│   ├── login.tsx          # Login page
│   ├── register.tsx       # Register page
│   ├── app/
│   │   ├── route.tsx      # App layout (protected)
│   │   ├── index.tsx      # Dashboard
│   │   ├── admin/
│   │   │   ├── route.tsx  # Admin layout
│   │   │   ├── index.tsx  # Admin dashboard
│   │   │   ├── users.tsx  # User management
│   │   │   └── api-keys.tsx # API key management
│   │   └── settings/
│   │       ├── route.tsx  # Settings layout
│   │       ├── profile.tsx
│   │       └── security.tsx
│   └── ...
├── lib/                   # Utilities and services
│   ├── api/
│   │   ├── axios-instance.ts  # Configured axios instance
│   │   ├── services/          # API service functions
│   │   │   ├── auth-services.ts
│   │   │   ├── user-services.ts
│   │   │   └── admin-services.ts
│   │   └── types.ts           # API response types
│   └── utils.ts           # Utility functions
├── stores/                # Zustand stores
│   ├── use-auth-store.ts
│   └── use-ui-store.ts
├── providers/             # React providers
│   ├── AuthProvider.tsx
│   ├── ThemeProvider.tsx
│   └── TanStackProvider.tsx
└── hooks/                 # Custom React hooks
    └── use-api-error-parser.ts
```

## Routing

Uses TanStack Router with file-based routing:

```
routes/
├── __root.tsx            # Root layout (applies to all routes)
├── index.tsx             # / (landing page)
├── login.tsx             # /login
├── register.tsx          # /register
├── app/
│   ├── route.tsx         # /app (protected layout)
│   ├── index.tsx         # /app (dashboard)
│   ├── admin/
│   │   ├── route.tsx     # /app/admin (admin-only)
│   │   ├── index.tsx     # /app/admin
│   │   ├── users.tsx     # /app/admin/users
│   │   └── api-keys.tsx  # /app/admin/api-keys
│   └── settings/
│       ├── route.tsx     # /app/settings
│       ├── profile.tsx   # /app/settings/profile
│       └── security.tsx  # /app/settings/security
```

Route configuration is automatic based on file structure. Generated types provide full type safety for navigation and params.

## State Management

### Server State (TanStack Query)

```typescript
// Fetch users with caching
const { data: users, isLoading } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
});

// Mutations with automatic cache invalidation
const updateUser = useMutation({
  mutationFn: updateUserApi,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  },
});
```

### Client State (Zustand)

```typescript
// Auth store
const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setUser: (user) => set({ user }),
      setAccessToken: (token) => set({ accessToken: token }),
      logout: () => set({ user: null, accessToken: null }),
    }),
    { name: 'auth-storage' }
  )
);
```

## API Integration

Axios instance with interceptors for:
- Automatic token attachment
- Token refresh on 401
- Error handling

```typescript
// lib/api/services/auth-services.ts
export const authServices = {
  login: (credentials: LoginCredentials) => 
    api.post<AuthResponse>('/auth/login', credentials),
  
  register: (data: RegisterData) =>
    api.post<AuthResponse>('/auth/register', data),
    
  refreshToken: () =>
    api.post<TokenResponse>('/auth/refresh', null, {
      withCredentials: true, // Sends httpOnly cookie
    }),
};
```

## Authentication Flow

1. **Login**: POST credentials → receive access token + refresh cookie
2. **Storage**: Access token in Zustand (memory), refresh in httpOnly cookie
3. **API Calls**: Access token attached via Authorization header
4. **Token Expiry**: Axios interceptor catches 401 → refresh endpoint → retry original request
5. **Logout**: Clear local state, backend clears cookie

## Environment Variables

```env
# Required
VITE_API_URL=http://localhost:8080
```

## Commands

```bash
# Development
bun run dev                  # Start dev server
bun run dev --host           # Expose to network

# Production
bun run build                # Build for production
bun run preview              # Preview production build

# Code Quality
bun run lint                 # ESLint check
bun run tsc -b               # TypeScript type check
```

## Component Usage

### shadcn/ui Components

```typescript
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function MyComponent() {
  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Title</DialogTitle>
        </DialogHeader>
        <Input placeholder="Enter text" />
        <Button>Submit</Button>
      </DialogContent>
    </Dialog>
  );
}
```

### Form Handling

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function LoginForm() {
  const form = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Input {...form.register("email")} />
      <Input type="password" {...form.register("password")} />
      <Button type="submit">Login</Button>
    </form>
  );
}
```

## File Upload

```typescript
const uploadAvatar = useMutation({
  mutationFn: async (file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    
    return api.patch("/user/me/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
});
```

## Styling

Uses Tailwind CSS with CSS variables for theming:

```css
/* Tailwind utility classes */
<div className="flex items-center justify-between p-4 bg-card rounded-lg border">

/* CSS variables (automatic dark mode) */
background-color: hsl(var(--card));
border-color: hsl(var(--border));
```

## Building for Production

```bash
# Build
bun run build

# Output in dist/
# - Static files ready for CDN/Vercel
# - Can be served with nginx (see Dockerfile)
```

### Docker Build

```bash
# Build production image
docker build -t quax-ui:latest .

# Run
docker run -d -p 80:80 quax-ui:latest
```

## Troubleshooting

### TypeScript Errors
```bash
# Regenerate route types
bun run tsc -b
```

### HMR Not Working
```bash
# Clear Vite cache
rm -rf node_modules/.vite
bun run dev
```

## License

[MIT](../LICENSE)
