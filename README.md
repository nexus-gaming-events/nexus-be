# Nexus Backend API

A high-performance, type-safe REST and WebSocket API for a gaming organization platform. Built with **Node.js**, **Fastify**, **TypeScript**, and **Drizzle ORM**.

## 🚀 Features

* **Authentication:** Multi-provider OAuth2 (Google, Discord, Steam) and JWT-based session management.
* **Event Management:** Create, schedule, and manage gaming tournaments.
* **Participation System:** Role-based event joining (Player vs Spectator) with slot limits.
* **Social Graph:** Friend request system and user relationships.
* **Groups/Teams:** Create squads, manage members, and roles.
* **Real-time Chat:** WebSocket-based event chat with persistent history.
* **Documentation:** Auto-generated Swagger/OpenAPI documentation.
* **Integration Testing:** Fully isolated tests using Docker and Testcontainers.

## 🛠️ Tech Stack

* **Runtime:** Node.js
* **Framework:** Fastify
* **Language:** TypeScript
* **Database:** PostgreSQL
* **ORM:** Drizzle ORM
* **Validation:** Zod
* **Real-time:** `ws` (WebSockets)
* **Testing:** Vitest + Testcontainers

## 📋 Prerequisites

* **Node.js** (v18 or higher)
* **Docker** (Required for local database and running tests)

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
# Format: postgres://user:password@host:port/dbname
DATABASE_URL=postgres://nexus:nexuspassword@localhost:5432/nexus_db

# Authentication Secrets
JWT_SECRET=super-secret-jwt-key-change-this

# OAuth Providers (Required for real login, not needed for Dev Login)
GOOGLE_CLIENT_ID=your_google_client_id
STEAM_API_KEY=your_steam_api_key

# App Configuration
BASE_URL=http://localhost:3000
```

## 📦 Installation & Setup

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Start Local Database (Docker):**
    If you don't have a local Postgres instance, you can run one easily via Docker:
    ```bash
    docker run --name nexus-db -e POSTGRES_USER=nexus -e POSTGRES_PASSWORD=nexuspassword -e POSTGRES_DB=nexus_db -p 5432:5432 -d postgres:15-alpine
    ```

3.  **Push Database Schema:**
    Apply the Drizzle schema to your database:
    ```bash
    npm run db:push
    ```

## 🚀 Running the Application

**Development Mode:**
Starts the server with hot-reloading.
```bash
npm run dev
```

**Production Build:**
```bash
npm run build
npm start
```

## 🧪 Testing

This project uses **Testcontainers** to spin up a fresh, isolated PostgreSQL container for every test run. You must have Docker running.

```bash
npm test
```

## 📖 API Documentation (Swagger)

Once the server is running, full interactive documentation is available at:

**[http://localhost:3000/docs](http://localhost:3000/docs)**

### How to Authenticate in Swagger (Dev Mode)

1.  Go to `POST /auth/dev-login`.
2.  Click **Try it out** -> **Execute**.
3.  Copy the `token` from the response.
4.  Scroll to the top, click the **Authorize** (Lock icon) button.
5.  Paste the token and click **Authorize**.
6.  You can now test protected endpoints (Events, Groups, etc.).

## 🔌 WebSocket Chat

The chat endpoint is available at `ws://localhost:3000/chat`.

**Connection Params:**
* `token`: Valid JWT (Bearer token from auth)
* `eventId`: ID of the event to join

**Example URL:**
`ws://localhost:3000/chat?token=YOUR_JWT&eventId=1`

**Message Format:**
Send raw text strings. The server broadcasts JSON payloads:
```json
{
  "type": "MESSAGE",
  "id": 101,
  "userId": 5,
  "username": "GamerOne",
  "content": "Good luck everyone!",
  "createdAt": "2023-10-27T10:00:00.000Z"
}
```

## 📂 Project Structure

```
src/
├── db/             # Database schema and connection
├── plugins/        # Fastify plugins (Auth, etc.)
├── routes/         # API Route definitions
│   ├── auth.ts
│   ├── chat.ts
│   ├── events.ts
│   ├── friends.ts
│   └── groups.ts
├── server.ts       # App entry point
└── types/          # TypeScript definitions
tests/              # Integration tests
```
