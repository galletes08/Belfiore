# Email verification setup

Customer signup now sends a one-time verification link. The `users` row is created only after the link is opened.

Add these values to `server/.env`:

```env
FRONTEND_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-kennethbriangalletes@gmail.com
SMTP_PASSWORD=your-kgalletes090909
SMTP_FROM=Belfiore <kennethbriangalletes@gmail.com>
```

For Gmail, use a Google app password, not your normal Gmail password. For production, set `FRONTEND_URL` to the deployed frontend URL and use the SMTP credentials from your mail provider.

The server creates `pending_registrations` automatically. The SQL schema also includes the table for fresh database setup.
