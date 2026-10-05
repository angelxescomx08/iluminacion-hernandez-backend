# Servidor de producción: acceso, variables y reinicio

> Última revisión: 4 de octubre de 2026. Esta guía es la misma en los repos de backend y frontend.

El backend y el frontend corren en un solo servidor EC2 (Amazon Linux) y los administra PM2.

## El servidor

| Dato | Valor |
| --- | --- |
| IP | `78.13.114.168` |
| Usuario SSH | `ec2-user` |
| Llave | `clave-mexico-servidor-web.pem` (en la raíz de cada proyecto; git la ignora con `*.pem`) |
| Node | v24 |
| Backend | proceso PM2 `backend-api` · carpeta `/home/ec2-user/apps/backend` · puerto 3000 |
| Frontend | proceso PM2 `astro-front` · carpeta `/home/ec2-user/apps/frontend` · puerto 4321 |
| Logs de PM2 | `/home/ec2-user/.pm2/logs/` |

> ⚠️ La llave `.pem` da acceso total al servidor. Nunca la subas a GitHub ni la mandes por chat o correo.

## Acceder por SSH desde Windows

Abre PowerShell y conéctate con la ruta completa de la llave:

```powershell
ssh -i "C:\Users\USER\Desktop\web\node\backend-iluminacion-hernandez\clave-mexico-servidor-web.pem" ec2-user@78.13.114.168
```

- La primera vez pregunta si confías en el servidor: escribe `yes`.
- Para salir del servidor escribe `exit`.

Si aparece **UNPROTECTED PRIVATE KEY FILE**, quita a otros usuarios los permisos sobre la llave (solo una vez) y vuelve a intentar:

```powershell
icacls "C:\Users\USER\Desktop\web\node\backend-iluminacion-hernandez\clave-mexico-servidor-web.pem" /inheritance:r /grant:r "$($env:USERNAME):R"
```

Para correr un solo comando sin quedarte dentro del servidor, escríbelo entre comillas al final:

```powershell
ssh -i "C:\Users\USER\Desktop\web\node\backend-iluminacion-hernandez\clave-mexico-servidor-web.pem" ec2-user@78.13.114.168 "pm2 list"
```

## Variables de entorno

### Backend

Cada vez que arranca, el backend lee sus variables de `/home/ec2-user/apps/backend/.env` (con `dotenv`). **Un cambio en ese archivo no se aplica hasta que reinicias el proceso.**

Para editarlo, ya dentro del servidor:

```bash
cd ~/apps/backend
nano .env
```

Guarda con `Ctrl+O` y luego `Enter`, y sal con `Ctrl+X`. Después reinicia (ver la sección siguiente).

Para ver qué variables hay sin mostrar sus valores:

```bash
cut -d= -f1 ~/apps/backend/.env
```

**Stripe:** desde el 4 de octubre de 2026, `STRIPE_SECRET_KEY` usa la llave de producción (`sk_live_...`). `STRIPE_CURRENCY` vale `mxn`.

### Frontend

El frontend no usa variables de Stripe. Su `PUBLIC_API_URL` (`https://api.iluminacion-hernandez.com`) queda fija al compilar, en el paso *Build Project* del workflow de GitHub Actions. Cambiarla en el servidor no sirve: hay que cambiarla en el workflow y volver a desplegar.

## Reiniciar y verificar

Ya dentro del servidor:

```bash
pm2 restart backend-api --update-env   # o astro-front para el frontend
pm2 save
```

| Comando | Qué hace |
| --- | --- |
| `pm2 restart backend-api` | Apaga y vuelve a encender el backend; al arrancar lee de nuevo el `.env` |
| `--update-env` | También actualiza las variables que PM2 tiene guardadas |
| `pm2 save` | Guarda la lista de procesos para que PM2 los levante solo si el servidor se reinicia |

Todo en un solo comando desde PowerShell:

```powershell
ssh -i "C:\Users\USER\Desktop\web\node\backend-iluminacion-hernandez\clave-mexico-servidor-web.pem" ec2-user@78.13.114.168 "pm2 restart backend-api --update-env && pm2 save"
```

Para verificar:

```bash
pm2 list
pm2 logs backend-api --lines 30 --nostream
```

- En `pm2 list`, el proceso debe aparecer como `online` y con un uptime de pocos segundos.
- En los logs debe salir `Servidor escuchando en http://localhost:3000` y **no** el aviso `STRIPE_SECRET_KEY ausente`.
- Usa `pm2` con el usuario `ec2-user` y sin `sudo`: con `sudo` no aparecen los procesos.

## Despliegue automático (GitHub Actions)

Cada push a `main` en cualquiera de los dos repos ejecuta su workflow (`.github/workflows/deploy.yml`):

1. Compila el proyecto en GitHub.
2. Sube el build al servidor por SCP (`~/apps/backend` o `~/apps/frontend`).
3. Instala las dependencias. En el backend también corre las migraciones (`pnpm run db:migrate`).
4. Reinicia el proceso con PM2 (`backend-api` o `astro-front`) y corre `pm2 save`.

El workflow **no toca el `.env` del servidor**: las variables nuevas del backend se agregan a mano. Usa los secrets `EC2_SSH_KEY` y `EC2_HOST` de cada repo.

## Pendientes (4 de octubre de 2026)

- [ ] Agregar `RESEND_API_KEY`, `CONTACT_TO_EMAIL` y `CONTACT_FROM_EMAIL` al `.env` del backend. Sin ellas, el formulario de contacto responde 503.
- [x] Catálogo Coolfan (34 productos) cargado en producción con Stripe live e imágenes en S3 el 4 de octubre de 2026.
