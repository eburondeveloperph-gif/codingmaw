/**
 * Ollama Provisioner Service
 * Runs on the VPS to handle per-user Ollama container provisioning.
 * Listens on port 18792.
 */

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 18792;
const BASE_PORT = 11500; // Starting port for user Ollama instances
const VPS_HOST = process.env.VPS_HOST || '168.231.78.113';

// Track allocated ports (in production, use Redis or a DB)
const allocatedPorts = new Map();
let nextPort = BASE_PORT;

/**
 * POST /provision
 * Creates a new Ollama container for a user.
 */
app.post('/provision', async (req, res) => {
    const { uid, email } = req.body;

    if (!uid) {
        return res.status(400).json({ success: false, error: 'uid is required' });
    }

    try {
        // Check if already provisioned
        if (allocatedPorts.has(uid)) {
            const port = allocatedPorts.get(uid);
            return res.json({
                success: true,
                ollama_url: `http://${VPS_HOST}:${port}`,
                port,
                message: 'Already provisioned',
            });
        }

        // Allocate a new port
        const port = nextPort++;
        const containerName = `ollama-user-${uid.substring(0, 8)}`;

        console.log(`[Provision] Creating Ollama for ${uid} on port ${port}...`);

        // Run Docker container
        const dockerCmd = `docker run -d --name ${containerName} -p ${port}:11434 -v ollama-${uid}:/root/.ollama ollama/ollama`;
        await execAsync(dockerCmd);

        allocatedPorts.set(uid, port);

        console.log(`[Provision] Container ${containerName} started on port ${port}`);

        res.json({
            success: true,
            ollama_url: `http://${VPS_HOST}:${port}`,
            port,
        });
    } catch (err) {
        console.error(`[Provision] Error:`, err);
        res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
});

/**
 * POST /pull-models
 * Pulls specified models into a user's Ollama instance.
 */
app.post('/pull-models', async (req, res) => {
    const { uid, ollama_url, models } = req.body;

    if (!ollama_url || !models || !Array.isArray(models)) {
        return res.status(400).json({ success: false, error: 'ollama_url and models[] are required' });
    }

    console.log(`[Pull] Pulling models for ${uid}:`, models);

    // Respond immediately, pull in background
    res.json({ success: true, message: 'Model pull initiated' });

    // Background pull
    for (const model of models) {
        try {
            console.log(`[Pull] Pulling ${model}...`);
            const pullRes = await fetch(`${ollama_url}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: model }),
            });

            if (!pullRes.ok) {
                console.error(`[Pull] Failed to pull ${model}:`, await pullRes.text());
            } else {
                console.log(`[Pull] ${model} pulled successfully`);
            }
        } catch (err) {
            console.error(`[Pull] Error pulling ${model}:`, err);
        }
    }
});

/**
 * GET /status/:uid
 * Check if a user's Ollama is running.
 */
app.get('/status/:uid', async (req, res) => {
    const { uid } = req.params;
    const port = allocatedPorts.get(uid);

    if (!port) {
        return res.json({ running: false, provisioned: false });
    }

    try {
        const healthRes = await fetch(`http://localhost:${port}/api/tags`);
        res.json({ running: healthRes.ok, provisioned: true, port });
    } catch {
        res.json({ running: false, provisioned: true, port });
    }
});

app.listen(PORT, () => {
    console.log(`Ollama Provisioner running on port ${PORT}`);
});
