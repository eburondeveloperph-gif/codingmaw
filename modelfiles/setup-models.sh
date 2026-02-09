#!/bin/bash
# Setup CodeMax models on self-hosted Ollama server
# Usage: ssh into the server and run this script

set -e

echo "═══════════════════════════════════════════"
echo "  CodeMax Model Setup — Eburon AI"
echo "═══════════════════════════════════════════"

# Pull base model for translategemma if not present
echo ""
echo ">> Pulling gemma3:4b for TranslateGemma..."
ollama pull gemma3:4b || echo "WARNING: gemma3:4b pull failed, trying gemma2:2b..."
ollama pull gemma2:2b 2>/dev/null || true

echo ""
echo ">> Creating codemax-qwen from qwen3-coder-next:cloud..."
ollama create codemax-qwen -f /tmp/modelfiles/codemax-qwen.Modelfile

echo ""
echo ">> Creating codemax-kimi from kimi-k2-thinking:cloud..."
ollama create codemax-kimi -f /tmp/modelfiles/codemax-kimi.Modelfile

echo ""
echo ">> Creating codemax-llama from llama3.2:1b..."
ollama create codemax-llama -f /tmp/modelfiles/codemax-llama.Modelfile

echo ""
echo ">> Creating translategemma from gemma3:4b..."
ollama create translategemma -f /tmp/modelfiles/translategemma.Modelfile

echo ""
echo "═══════════════════════════════════════════"
echo "  All models created! Listing..."
echo "═══════════════════════════════════════════"
ollama list

echo ""
echo "Done! Models available:"
echo "  - codemax-qwen    (code generation, premium)"
echo "  - codemax-kimi    (deep reasoning + code)"
echo "  - codemax-llama   (fast, lightweight)"
echo "  - translategemma  (multilingual translation)"
