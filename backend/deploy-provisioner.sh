#!/bin/bash
# Deploy the Ollama Provisioner service to the VPS

VPS_HOST="168.231.78.113"
VPS_USER="root"
SERVICE_DIR="/opt/ollama-provisioner"

echo "═══════════════════════════════════════════"
echo "  Deploying Ollama Provisioner to VPS"
echo "═══════════════════════════════════════════"

# Copy the provisioner script
scp backend/services/ollamaProvisioner.js ${VPS_USER}@${VPS_HOST}:${SERVICE_DIR}/index.js

# SSH and install/restart
ssh ${VPS_USER}@${VPS_HOST} << 'EOF'
cd /opt/ollama-provisioner

# Install dependencies if not present
if [ ! -f package.json ]; then
  npm init -y
  npm install express node-fetch
fi

# Create systemd service if not exists
if [ ! -f /etc/systemd/system/ollama-provisioner.service ]; then
  cat > /etc/systemd/system/ollama-provisioner.service << 'SERVICE'
[Unit]
Description=Ollama Provisioner Service
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ollama-provisioner
ExecStart=/usr/bin/node index.js
Restart=always
Environment=PORT=18792 VPS_HOST=168.231.78.113

[Install]
WantedBy=multi-user.target
SERVICE
  systemctl daemon-reload
  systemctl enable ollama-provisioner
fi

# Restart the service
systemctl restart ollama-provisioner
systemctl status ollama-provisioner --no-pager
EOF

echo ""
echo "Done! Provisioner running at http://${VPS_HOST}:18792"
