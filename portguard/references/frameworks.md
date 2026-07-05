# Framework Port Wiring

Use these examples after `portguard assign --json` has selected a stable port.
Replace `3124` with the assigned value.

## JavaScript Frameworks

Next.js:

```json
{
  "scripts": {
    "dev": "next dev -p 3124"
  }
}
```

Vite, React Router, SvelteKit, Vue, and most Vite-based tools:

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 3124 --strictPort"
  }
}
```

Astro:

```json
{
  "scripts": {
    "dev": "astro dev --host 127.0.0.1 --port 3124"
  }
}
```

Nuxt:

```json
{
  "scripts": {
    "dev": "nuxt dev --host 127.0.0.1 --port 3124"
  }
}
```

Remix classic dev server:

```json
{
  "scripts": {
    "dev": "remix dev --port 3124"
  }
}
```

Create React App:

```json
{
  "scripts": {
    "dev": "PORT=3124 react-scripts start"
  }
}
```

## Other Common Servers

Django:

```bash
python manage.py runserver 127.0.0.1:3124
```

Rails:

```bash
bin/rails server -b 127.0.0.1 -p 3124
```

FastAPI / Uvicorn:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 3124
```

Vercel CLI:

```json
{
  "scripts": {
    "dev": "vercel dev --listen 3124"
  }
}
```

## Rules For Agents

- Prefer CLI flags over relying on undocumented environment variables.
- Add strict-port behavior when the framework supports it.
- If the project already has a `.env.local`, avoid writing secrets. A plain
  `PORT=3124` value is fine when the framework actually reads it.
- After changing a script, run the dev server once and verify the printed URL
  matches the assigned port.
