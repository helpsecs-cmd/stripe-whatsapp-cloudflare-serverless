// @ts-nocheck
/**
 * Real Make IA — Webhook Serverless: Stripe -> WhatsApp do Vendedor (Multi-Adaptador)
 * Arquitetura Serverless Cloudflare Pages Function
 * Endpoint: https://realmakeia.com/api/stripe-webhook
 * 
 * Holding HELPSECS LTDA
 * Licença: MIT
 */

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const payloadText = await request.text();
        let event;

        try {
            event = JSON.parse(payloadText);
        } catch (e) {
            return new Response(JSON.stringify({ error: "Payload JSON inválido" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const eventType = event.type || "";
        console.log(`[Stripe Webhook] Evento recebido: ${eventType} (ID: ${event.id || "sem_id"})`);

        // Processa eventos onde o pagamento está formalmente confirmado
        // 1. checkout.session.completed (Cartão imediato ou Pix pago na hora)
        // 2. checkout.session.async_payment_succeeded (Pix compensado minutos após fechar a tela)
        if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
            const session = event.data?.object || {};
            const paymentStatus = session.payment_status || "";

            // DOUTRINA DO PIX: Só notifica se o status for estritamente "paid"!
            // Se o cliente apenas abriu o checkout e gerou o Pix sem pagar, status = "unpaid".
            if (paymentStatus !== "paid") {
                console.log(`[Stripe Webhook] Sessão ${session.id} ignorada para notificação: payment_status é '${paymentStatus}' (não pago ainda).`);
                return new Response(JSON.stringify({
                    received: true,
                    status: "ignored_unpaid",
                    message: "Aguardando confirmação de pagamento do Pix"
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const customerName = session.customer_details?.name || session.shipping_details?.name || "Cliente Real Make IA";
            const customerEmail = session.customer_details?.email || "Não informado";
            const customerPhone = session.customer_details?.phone || "Não informado";
            const amountTotal = (session.amount_total ? (session.amount_total / 100).toFixed(2).replace(".", ",") : "27,00");
            const currency = (session.currency || "BRL").toUpperCase();
            const paymentMethods = (session.payment_method_types || []).join(", ") || "Pix/Cartão";
            const sessionId = session.id || "cs_live_...";

            // Monta a mensagem estruturada para o WhatsApp
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
                dispatches: dispatchResults
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Outros eventos retornam 200 OK para satisfazer o handshake do Stripe
        return new Response(JSON.stringify({
            received: true,
            event: eventType,
            status: "ack"
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("[Stripe Webhook] Erro crítico:", err);
        return new Response(JSON.stringify({ error: err.message || "Erro interno no processamento" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

// Healthcheck GET para diagnóstico e monitoramento
export async function onRequestGet() {
    return new Response(JSON.stringify({
        status: "online",
        service: "Real Make IA — Stripe to WhatsApp Webhook Serverless",
        version: "2.0.0-multi-adapter",
        architecture: "Cloudflare Pages Functions (Edge Serverless R$ 0/mês)",
        supported_providers: ["callmebot", "evolution_api", "zapi", "generic_webhook"],
        endpoint: "https://realmakeia.com/api/stripe-webhook",
        docs: "https://realmakeia.com/webhook-stripe-whatsapp-serverless/",
        timestamp: new Date().toISOString()
    }), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
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
