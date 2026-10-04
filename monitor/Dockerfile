FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY monitor ./monitor
RUN mkdir -p /var/lib/mka-monitor && chown node:node /var/lib/mka-monitor
ENV MONITOR_STATE_FILE=/var/lib/mka-monitor/state.json
USER node

CMD ["npm", "run", "monitor"]