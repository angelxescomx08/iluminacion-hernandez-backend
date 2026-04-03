# Referencia de endpoints HTTP

Descripción técnica de las rutas expuestas por el servidor Express. Pensada para desarrolladores que consumen la API.

**Ámbito:** rutas definidas en este repositorio y el prefijo Better Auth montado en la app. No sustituye el catálogo completo de Better Auth; para rutas adicionales de autenticación véase la [documentación oficial de Better Auth](https://www.better-auth.com/docs).

---

## URL base y puerto

| Variable | Uso |
|----------|-----|
| `PORT` | Puerto del servidor (por defecto `3000`). |
| `BETTER_AUTH_URL` | URL pública del API usada por Better Auth (p. ej. `http://localhost:3000`). Debe coincidir con el origen que usan el front y OAuth. |

**Ejemplo de base:** `http://localhost:3000` (ajusta host y puerto en despliegue).

---

## Convenciones comunes

### CORS y credenciales

- Orígenes permitidos: variable `ALLOWED_ORIGINS` (lista separada por comas).
- Better Auth también usa `TRUSTED_ORIGINS` para comprobaciones CSRF/origen.
- Para cookies de sesión, el cliente debe enviar peticiones con **`credentials: 'include'`** (fetch) o equivalente.

### Cuerpo JSON

- Rutas que esperan JSON requieren cabecera `Content-Type: application/json`.
- Tamaño máximo del cuerpo: **1 MB** (`express.json`).

### Orden de middlewares relevante

- Las rutas bajo **`/api/auth/*`** se procesan **antes** del parser JSON global (requisito de Better Auth en Express).
- El resto de rutas JSON pasan por `express.json` después.

### Respuestas de error habituales

| Código | Cuándo |
|--------|--------|
| `404` | Ruta no registrada. Cuerpo JSON: `{ "error": "No encontrado" }`. |
| `500` | Error no controlado. En producción (`NODE_ENV=production`) el mensaje expuesto al cliente es genérico; el detalle puede persistirse en base de datos según la configuración de logging de errores. |

---

## Endpoints de la aplicación

### `GET /api/hello`

| | |
|---|---|
| **Descripción** | Comprobación simple del API (saludo). |
| **Autenticación** | No. |
| **Cuerpo** | No aplica. |
| **Respuesta exitosa** | `200` — JSON con al menos la propiedad de mensaje de saludo definida por el caso de uso (p. ej. `{ "message": "Hola mundo" }`). |

---

## Autenticación REST explícita (`/api/v1/auth`)

Estas rutas delegan en la API interna de Better Auth (`auth.api`) y reenvían cabeceras y cuerpo de respuesta (incluidas cookies de sesión cuando corresponda).

**Prefijo:** `/api/v1/auth`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/register/email` | Registro con email y contraseña. |
| `POST` | `/login/email` | Inicio de sesión con email y contraseña. |
| `POST` | `/login/google` | Inicio con proveedor Google (el servidor fuerza `provider: "google"`). |
| `POST` | `/logout` | Cierre de sesión. |
| `GET` | `/session` | Consulta la sesión actual; responde JSON (sin envolver en la misma forma que las respuestas `asResponse` de los POST). |

### `POST /api/v1/auth/register/email`

Reenvía el cuerpo a Better Auth `sign-up/email`. Campos habituales (según versión de Better Auth):

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|--------|
| `name` | string | sí | Nombre mostrado. |
| `email` | string | sí | Email válido. |
| `password` | string | sí | Política de longitud/complejidad la define Better Auth. |
| `image` | string | no | URL de imagen. |
| `callbackURL` | string | no | Redirección tras flujos que la usen. |
| `rememberMe` | boolean | no | Persistencia de sesión. |

Campos adicionales de usuario configurados en el servidor (p. ej. `role`) se aceptan si Better Auth los tiene definidos como `additionalFields` con entrada permitida.

**Respuesta:** la que devuelva Better Auth (código HTTP, JSON y posibles `Set-Cookie`).

### `POST /api/v1/auth/login/email`

Reenvía a `sign-in/email`.

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `email` | string | sí |
| `password` | string | sí |

Opcionales típicos: `callbackURL`, `rememberMe`.

### `POST /api/v1/auth/login/google`

Reenvía a `sign-in/social` con `provider: "google"`. El cuerpo puede incluir opciones admitidas por Better Auth para OAuth social, por ejemplo:

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|--------|
| `callbackURL` | string | no | URL de retorno tras el flujo. |
| `errorCallbackURL` | string | no | Manejo de error en el proveedor. |

**Configuración del servidor:** requiere `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. En la consola de Google Cloud, la URI de redirección autorizada debe incluir:

`{BETTER_AUTH_URL}/api/auth/callback/google`

### `POST /api/v1/auth/logout`

Cierra la sesión asociada a las cookies/cabeceras enviadas. Cuerpo normalmente vacío.

### `GET /api/v1/auth/session`

Devuelve el estado de sesión en JSON (objeto con datos de sesión y usuario, o valor nulo si no hay sesión), según Better Auth.

**Cabeceras:** envía las cookies de sesión del navegador (o las que el cliente almacene).

---

## Better Auth: prefijo `/api/auth/*`

| | |
|---|---|
| **Montaje** | Todas las peticiones cuyo path coincide con `/api/auth/*` las gestiona el handler oficial de Better Auth (`toNodeHandler`). |
| **Compatibilidad** | Pensado para el cliente `better-auth` y para callbacks OAuth (p. ej. `/api/auth/callback/google`). |

### Comprobación de disponibilidad

| Método | Ruta | Respuesta esperada |
|--------|------|---------------------|
| `GET` | `/api/auth/ok` | Indicador de que el servicio de auth responde (p. ej. `{ "status": "ok" }` según versión). |

El resto de rutas (`sign-up`, `sign-in`, gestión de cuenta, etc.) están definidas por Better Auth. Lista actualizada y detalle de cuerpos en:

- [Better Auth — documentación](https://www.better-auth.com/docs)
- [Better Auth — uso básico (email / social)](https://www.better-auth.com/docs/basic-usage)

---

## Variables de entorno relacionadas con la API

| Variable | Relación con endpoints |
|----------|-------------------------|
| `ALLOWED_ORIGINS` | CORS para orígenes del front. |
| `TRUSTED_ORIGINS` | Orígenes confiables para Better Auth. |
| `BETTER_AUTH_SECRET` | Secreto criptográfico (mínimo 32 caracteres recomendado). |
| `BETTER_AUTH_URL` | URL base pública del backend para auth y callbacks. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Habilitan login Google si ambas están definidas. |

---

## Changelog de esta referencia

Actualiza este archivo cuando añadas o cambies rutas en `express-app` o en los routers montados.
