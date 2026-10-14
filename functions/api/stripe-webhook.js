// @ts-nocheck
/**
 * Real Make IA — Webhook Serverless: Stripe -> WhatsApp do Vendedor (Multi-Adaptador)
 * Arquitetura Serverless Cloudflare Pages Function com Blindagem Criptográfica HMAC-SHA256
 * Endpoint: https://realmakeia.com/api/stripe-webhook
 * 
 * Holding HELPSECS LTDA
 * Licença: MIT
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, stripe-signature, Stripe-Signature"
};

// Cache de idempotência em memória por isolate (anti-duplicação de rajadas de rede)
const processedEvents = new Set();

function isEventProcessed(eventId) {
    if (!eventId) return false;
    return processedEvents.has(eventId);
}

function markEventProcessed(eventId) {
    if (!eventId) return;
    if (processedEvents.size > 2000) {
        processedEvents.clear();
    }
    processedEvents.add(eventId);
}

/**
 * Validação Criptográfica HMAC-SHA256 Oficial do Stripe usando Web Crypto API pura.
 * Zero dependências de NPM — executa nativamente em tempo real no Edge da Cloudflare.
 */
async function verifyStripeSignature(rawBody, signatureHeader, secret) {
    if (!signatureHeader || !secret) {
        return { valid: false, error: "Cabeçalho Stripe-Signature ou Secret ausente" };
    }

    const parts = signatureHeader.split(",");
    let timestamp = null;
    const signatures = [];

    for (const part of parts) {
        const [k, v] = part.trim().split("=");
        if (k === "t") timestamp = parseInt(v, 10);
        if (k === "v1") signatures.push(v);
    }

    if (!timestamp || signatures.length === 0) {
        return { valid: false, error: "Formato inválido do cabeçalho Stripe-Signature" };
    }

    // 1. Proteção Anti-Replay: janela estrita de 300 segundos (±5 minutos)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
        return { 
            valid: false, 
            error: `Timestamp fora da janela de tolerância de 300s (recebido: ${timestamp}, atual: ${now})` 
        };
    }

    // 2. Monta o payload assinado no padrão oficial: `${timestamp}.${rawBody}`
    const signedPayload = `${timestamp}.${rawBody}`;
    const encoder = new TextEncoder();

    try {
        const keyData = encoder.encode(secret);
        const cryptoKey = await crypto.subtle.importKey(
            "raw",
            keyData,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );

        const signatureBuffer = await crypto.subtle.sign(
            "HMAC",
            cryptoKey,
            encoder.encode(signedPayload)
        );

        const hashArray = Array.from(new Uint8Array(signatureBuffer));
        const expectedSignature = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        // 3. Comparação de tempo constante (anti-timing attacks)
        let match = false;
        for (const sig of signatures) {
            if (timingSafeEqual(expectedSignature, sig)) {
                match = true;
                break;
            }
        }

        if (!match) {
            return { valid: false, error: "Assinatura HMAC-SHA256 não confere com o payload" };
        }

        return { valid: true, timestamp };
    } catch (e) {
        return { valid: false, error: `Erro na execução criptográfica: ${e.message}` };
    }
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            ...corsHeaders,
            "Access-Control-Max-Age": "86400"
        }
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const payloadText = await request.text();
        const signatureHeader = request.headers.get("stripe-signature") || request.headers.get("Stripe-Signature");
        const webhookSecret = env?.STRIPE_WEBHOOK_SECRET || "whsec_ZbEvVLgAfPLelBmWNZh0eXLMIfm7qdSV";

        // BLINDAGEM 1: Exigência e Validação Criptográfica de Assinatura
        if (!signatureHeader) {
            console.warn("[Stripe Webhook] ALERTA DE SEGURANÇA: Requisição POST rejeitada sem cabeçalho Stripe-Signature.");
            return new Response(JSON.stringify({ 
                error: "Acesso negado: cabeçalho Stripe-Signature ausente. Requisições forjadas são bloqueadas.",
                status: "rejected_unauthorized"
            }), {
                status: 400,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }

        const sigVerification = await verifyStripeSignature(payloadText, signatureHeader, webhookSecret);
        if (!sigVerification.valid) {
            console.warn(`[Stripe Webhook] ALERTA DE SEGURANÇA: Assinatura inválida: ${sigVerification.error}`);
            return new Response(JSON.stringify({ 
                error: `Assinatura inválida: ${sigVerification.error}`,
                status: "rejected_bad_signature"
            }), {
                status: 400,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }

        let event;
        try {
            event = JSON.parse(payloadText);
        } catch (e) {
            return new Response(JSON.stringify({ error: "Payload JSON malformado" }), {
                status: 400,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }

        const eventId = event.id || "";
        const eventType = event.type || "";
        console.log(`[Stripe Webhook] Evento autenticado com sucesso: ${eventType} (ID: ${eventId})`);

        // BLINDAGEM 2: Idempotência / Anti-Duplicidade
        if (isEventProcessed(eventId)) {
            console.log(`[Stripe Webhook] Evento duplicado já processado (${eventId}). Retornando 200 OK sem disparar duplicatas.`);
            return new Response(JSON.stringify({
                received: true,
                event: eventId,
                status: "idempotent_duplicate_ignored"
            }), {
                status: 200,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }
        markEventProcessed(eventId);

        // Processa eventos onde o pagamento está formalmente confirmado
        // 1. checkout.session.completed (Cartão imediato ou Pix pago na hora)
        // 2. checkout.session.async_payment_succeeded (Pix compensado minutos após fechar a tela)
        if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
            const session = event.data?.object || {};
            const paymentStatus = session.payment_status || "";

            // BLINDAGEM 3: DOUTRINA DO PIX — Só notifica se payment_status === 'paid'
            if (paymentStatus !== "paid") {
                console.log(`[Stripe Webhook] Sessão ${session.id} ignorada para WhatsApp: status é '${paymentStatus}' (Pix não pago).`);
                return new Response(JSON.stringify({
                    received: true,
                    status: "ignored_unpaid",
                    message: "Aguardando compensação do Pix. Nenhum alerta falso disparado."
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            }

            const customerName = session.customer_details?.name || session.shipping_details?.name || "Cliente Real Make IA";
            const customerEmail = session.customer_details?.email || "Não informado";
            const customerPhone = session.customer_details?.phone || "Não informado";
            const amountTotal = (session.amount_total ? (session.amount_total / 100).toFixed(2).replace(".", ",") : "27,00");
            const currency = (session.currency || "BRL").toUpperCase();
            const paymentMethods = (session.payment_method_types || []).join(", ") || "Pix/Cartão";
            const sessionId = session.id || "cs_live_...";

            const zapMessage = 
`🔔 *VENDA APROVADA — Real Make IA!*
━━━━━━━━━━━━━━━━━━━━━━
💰 *Valor:* R$ ${amountTotal} ${currency}
👤 *Cliente:* ${customerName}
📧 *E-mail:* ${customerEmail}
📱 *Telefone:* ${customerPhone}
💳 *Forma:* ${paymentMethods.toUpperCase()}
📦 *Produto:* Pacote Fábrica de Vídeos IA (20 Roteiros + Scripts)
🆔 *Sessão:* \`${sessionId}\`
━━━━━━━━━━━━━━━━━━━━━━
🚀 *Entrega:* Download binário liberado no cofre!`;

            console.log("[Stripe Webhook] Mensagem pronta para despacho multicanal.");

            // Dispara pelos adaptadores ativos em paralelo
            const dispatchResults = await despacharNotificacao(zapMessage, session, env);

            return new Response(JSON.stringify({
                success: true,
                event: eventType,
                payment_status: paymentStatus,
                customer: customerEmail,
                authenticated: true,
                dispatches: dispatchResults
            }), {
                status: 200,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }

        // Outros eventos retornam 200 OK para satisfazer o handshake do Stripe
        return new Response(JSON.stringify({
            received: true,
            event: eventType,
            authenticated: true,
            status: "ack"
        }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });

    } catch (err) {
        console.error("[Stripe Webhook] Erro crítico:", err);
        return new Response(JSON.stringify({ error: err.message || "Erro interno no processamento" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
}

// Healthcheck GET para diagnóstico e monitoramento
export async function onRequestGet() {
    return new Response(JSON.stringify({
        status: "online",
        service: "Real Make IA — Stripe to WhatsApp Webhook Serverless",
        version: "3.0.0-sealed-security",
        security: {
            signature_verification: "HMAC-SHA256 (Web Crypto API)",
            anti_replay_window: "±300 seconds",
            idempotency_dedup: "Active (In-Memory Isolate)",
            pix_doctrine: "Strict payment_status === 'paid'"
        },
        supported_providers: ["callmebot", "evolution_api", "zapi", "generic_webhook"],
        endpoint: "https://realmakeia.com/api/stripe-webhook",
        docs: "https://realmakeia.com/webhook-stripe-whatsapp-serverless/",
        timestamp: new Date().toISOString()
    }), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            ...corsHeaders
        }
    });
}

/**
 * MOTOR MULTI-ADAPTADOR DE NOTIFICAÇÃO
 */
async function despacharNotificacao(mensagem, sessionData, env) {
    const resultados = [];
    const promises = [];

    const sellerNumber = env?.SELLER_WHATSAPP || env?.WHATSAPP_VENDEDOR || "5511999998888";

    // Adaptador 1: CallMeBot (Gratuito / R$ 0 / Zero Servidor)
    const callmeKey = env?.CALLMEBOT_API_KEY;
    if (callmeKey && sellerNumber) {
        const textEncoded = encodeURIComponent(mensagem);
        const cmbUrl = `https://api.callmebot.com/whatsapp.php?phone=${sellerNumber.replace(/\D/g, "")}&text=${textEncoded}&apikey=${callmeKey}`;
        promises.push(
            fetch(cmbUrl)
                .then(r => resultados.push({ provider: "callmebot", status: r.status }))
                .catch(e => resultados.push({ provider: "callmebot", error: String(e) }))
        );
    }

    // Adaptador 2: Evolution API (Self-hosted / Docker)
    const evoUrl = env?.EVOLUTION_API_URL;
    const evoKey = env?.EVOLUTION_API_KEY;
    if (evoUrl && evoKey && sellerNumber) {
        const evoEndpoint = `${evoUrl.replace(/\/$/, "")}/message/sendText/${env.EVOLUTION_INSTANCE || "default"}`;
        promises.push(
            fetch(evoEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", "apikey": evoKey },
                body: JSON.stringify({ number: sellerNumber.replace(/\D/g, ""), text: mensagem })
            })
                .then(r => resultados.push({ provider: "evolution_api", status: r.status }))
                .catch(e => resultados.push({ provider: "evolution_api", error: String(e) }))
        );
    }

    // Adaptador 3: Z-API
    const zapiId = env?.ZAPI_INSTANCE_ID;
    const zapiToken = env?.ZAPI_TOKEN;
    if (zapiId && zapiToken && sellerNumber) {
        const zapiEndpoint = `https://api.z-api.io/instances/${zapiId}/token/${zapiToken}/send-text`;
        promises.push(
            fetch(zapiEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: sellerNumber.replace(/\D/g, ""), message: mensagem })
            })
            .then(r => resultados.push({ provider: "zapi", status: r.status }))
            .catch(e => resultados.push({ provider: "zapi", error: String(e) }))
        );
    }

    // Adaptador 4: Webhook Genérico (n8n, Make, Zapier, Discord, Telegram)
    const customWebhook = env?.ZAP_WEBHOOK_URL || env?.WEBHOOK_NOTIFICACAO_URL;
    if (customWebhook) {
        promises.push(
            fetch(customWebhook, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mensagem: mensagem,
                    evento: "venda_aprovada",
                    sessao: sessionData,
                    criado_em: new Date().toISOString()
                })
            })
            .then(r => resultados.push({ provider: "custom_webhook", status: r.status }))
            .catch(e => resultados.push({ provider: "custom_webhook", error: String(e) }))
        );
    }

    if (promises.length > 0) {
        await Promise.allSettled(promises);
    } else {
        resultados.push({ provider: "logger", status: "logged_in_runtime" });
        console.log("[Despachador] Nenhuma credencial de envio configurada no Cloudflare Pages. Log gerado no console.");
    }

    return resultados;
}
