# TMOS API Endpoint Design

## Authentication
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/refresh
- GET /api/auth/profile

## Users
- GET /api/users
- GET /api/users/:id
- POST /api/users
- PATCH /api/users/:id
- DELETE /api/users/:id

## Roles and Permissions
- GET /api/roles
- GET /api/permissions
- POST /api/roles
- PATCH /api/roles/:id

## Channels
- GET /api/channels
- GET /api/channels/:id
- POST /api/channels
- PATCH /api/channels/:id
- DELETE /api/channels/:id

## Live Streams
- GET /api/streams
- GET /api/streams/:id
- POST /api/streams
- PATCH /api/streams/:id
- DELETE /api/streams/:id

## Media Assets
- GET /api/assets
- GET /api/assets/:id
- POST /api/assets
- PATCH /api/assets/:id
- DELETE /api/assets/:id

## Playlists and Schedules
- GET /api/playlists
- GET /api/schedules
- POST /api/playlists
- POST /api/schedules

## Programs and Categories
- GET /api/programs
- GET /api/categories
- POST /api/programs
- POST /api/categories

## Analytics and Alerts
- GET /api/analytics
- GET /api/alerts
- POST /api/alerts

## AI Conversations
- GET /api/ai/conversations
- POST /api/ai/conversations
- POST /api/ai/conversations/:id/messages

## Audit Logs and Settings
- GET /api/audit-logs
- GET /api/settings
- PATCH /api/settings
