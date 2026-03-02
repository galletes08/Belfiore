# PlantDelivery – React + Node + PostgreSQL

E‑commerce admin and customer frontend (React + Vite) with a Node/Express + PostgreSQL backend.

## Folder structure

```
Belfiore/
├── server/                     # Node Express API
│   ├── src/
│   │   ├── config/db.js        # PostgreSQL pool
│   │   ├── db/schema.sql       # users, products tables
│   │   ├── middleware/auth.js  # JWT check
│   │   ├── middleware/upload.js # Multer product images
│   │   ├── controllers/        # auth, products
│   │   ├── routes/             # /api/auth, /api/products
│   │   └── index.js
│   ├── scripts/create-admin.js # Create admin user
│   ├── uploads/                # Product images (created at runtime)
│   ├── .env
│   └── README.md
├── src/                        # React frontend
│   ├── api/client.js           # API + auth token helpers
│   ├── admin/                  # Admin pages (login, layout, dashboard, inventory)
│   ├── customer/               # Customer home
│   ├── App.jsx
│   └── main.jsx
├── .env                        # VITE_API_URL=http://localhost:3001
└── package.json
```

## Quick start

1. **PostgreSQL**  
   Create DB: `createdb belfiore` (or your DB name).

2. **Backend**  
   ```bash
   cd server
   npm install
   cp .env.example .env   # set DATABASE_URL, JWT_SECRET
   psql -U postgres -d belfiore -f src/db/schema.sql
   node scripts/create-admin.js admin@plant.com admin123
   npm run dev
   ```
   API runs at `http://localhost:3001`.

3. **Frontend**  
   In project root:
   ```bash
   npm install
   # .env: VITE_API_URL=http://localhost:3001
   npm run dev
   ```
   App: `http://localhost:5173`. Admin: `/admin/login` with the user you created.

## Build

- Frontend: `npm run build`
- Server: `npm start` (from `server/`)
