import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import fetch from 'node-fetch';

admin.initializeApp();

const VPS_PROVISIONER_URL = process.env.VPS_PROVISIONER_URL || 'http://168.231.78.113:18792';

interface ProvisionResponse {
    success: boolean;
    ollama_url?: string;
    port?: number;
    error?: string;
}

/**
 * Triggered when a new user is created in Firebase Auth.
 * Provisions a dedicated Ollama instance and pulls required models.
 */
export const onUserCreate = functions.auth.user().onCreate(async (user: functions.auth.UserRecord) => {
    const uid = user.uid;
    const email = user.email || '';

    console.log(`[onUserCreate] New user: ${uid} (${email})`);

    try {
        // 1. Call the VPS provisioner to spin up Ollama
        const provisionRes = await fetch(`${VPS_PROVISIONER_URL}/provision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, email }),
        });

        const data = (await provisionRes.json()) as ProvisionResponse;

        if (!data.success || !data.ollama_url) {
            throw new Error(data.error || 'Provisioning failed');
        }

        // 2. Store the Ollama endpoint in RTDB
        await admin.database().ref(`users/${uid}`).update({
            ollama_url: data.ollama_url,
            ollama_port: data.port,
            models_ready: false,
            provisioned_at: admin.database.ServerValue.TIMESTAMP,
        });

        console.log(`[onUserCreate] Ollama provisioned at ${data.ollama_url}`);

        // 3. Trigger model pulls (async, don't wait)
        fetch(`${VPS_PROVISIONER_URL}/pull-models`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uid,
                ollama_url: data.ollama_url,
                models: ['emilapexsolution/eburon', 'kimi-k2-thinking:cloud'],
            }),
        }).then(async (res) => {
            if (res.ok) {
                await admin.database().ref(`users/${uid}`).update({ models_ready: true });
                console.log(`[onUserCreate] Models pulled for ${uid}`);
            }
        }).catch(console.error);

        return { success: true, ollama_url: data.ollama_url };
    } catch (err) {
        console.error(`[onUserCreate] Error:`, err);
        await admin.database().ref(`users/${uid}`).update({
            ollama_error: err instanceof Error ? err.message : String(err),
        });
        return { success: false, error: String(err) };
    }
});
