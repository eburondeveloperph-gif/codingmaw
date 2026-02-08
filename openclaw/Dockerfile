FROM ollama/ollama:latest

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV OLLAMA_HOST=http://ollama:11434
ENV OPENCLAW_MODEL=kimi-k2-thinking:cloud
ENV OPENCLAW_PORT=18789

EXPOSE 18789

ENTRYPOINT ["/entrypoint.sh"]
