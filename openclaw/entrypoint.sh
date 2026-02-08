#!/bin/bash
set -e

echo "🧠 Eburon Agent Gateway (OpenClaw) starting..."
echo "   Model: ${OPENCLAW_MODEL:-kimi-k2-thinking:cloud}"
echo "   Ollama: ${OLLAMA_HOST:-http://localhost:11434}"
echo "   Port:  ${OPENCLAW_PORT:-18789}"

# Wait for Ollama to be reachable
echo "⏳ Waiting for Ollama..."
until curl -sf "${OLLAMA_HOST:-http://localhost:11434}/api/tags" > /dev/null 2>&1; do
  sleep 2
done
echo "✅ Ollama is reachable"

# Ensure the model is available
echo "📥 Ensuring model ${OPENCLAW_MODEL:-kimi-k2-thinking:cloud} is available..."
ollama pull "${OPENCLAW_MODEL:-kimi-k2-thinking:cloud}" 2>/dev/null || true

# Launch OpenClaw agent gateway
echo "🚀 Launching OpenClaw with model ${OPENCLAW_MODEL:-kimi-k2-thinking:cloud}..."
exec ollama launch openclaw --model "${OPENCLAW_MODEL:-kimi-k2-thinking:cloud}"
