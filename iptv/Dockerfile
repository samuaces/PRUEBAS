# Imagen para publicar Cookie Play en cualquier hosting que acepte Docker
# (Render, Railway, Fly.io, un VPS…). Sin dependencias: solo Node.
FROM node:22-alpine

WORKDIR /app
COPY . .

# Los datos (listas, favoritos, historial) viven aqui: monta un disco
# persistente en /app/data para que sobrevivan a los despliegues.
RUN mkdir -p /app/data

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787

EXPOSE 8787

# ACCESS_PIN es obligatoria al publicar en internet: sin ella la app queda abierta.
CMD ["node", "server.js"]
