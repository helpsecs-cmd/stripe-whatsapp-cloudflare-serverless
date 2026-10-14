# ⚡ Stripe to WhatsApp Serverless (Multi-Adapter)

> Notificação em tempo real de vendas e checkouts do **Stripe (Pix e Cartão)** diretamente no **WhatsApp do Vendedor**, rodando 100% serverless na borda da **Cloudflare Pages (R$ 0/mês)**.

Desenvolvido e mantido pela equipe de engenharia da **[Real Make IA](https://realmakeia.com)** e **HELPSECS LTDA**.

---

## 🎯 Por que este projeto existe?

A maioria dos infoprodutores e desenvolvedores que vendem produtos digitais de ticket acessível (R$ 19 a R$ 97) se depara com um dilema:
1. **Pagar R$ 50 a R$ 150/mês** em ferramentas no-code (Make, Zapier) apenas para encaminhar um webhook para o WhatsApp;
2. **Manter uma VPS ligada 24/7 (R$ 30 a R$ 60/mês)** rodando n8n ou instâncias pesadas de Docker só para esperar eventos esporádicos;
3. **Cair na 'Armadilha do Pix':** bots amadores que notificam o evento `checkout.session.completed` assim que o cliente gera o QR Code, comemorando vendas que na verdade **não foram pagas** (`unpaid`).

Esta solução resolve tudo isso de forma elegante: roda em **Cloudflare Pages Functions** (Edge Serverless com latência < 150ms), possui custo de infraestrutura de **R$ 0/mês** e suporta múltiplos adaptadores de WhatsApp em paralelo.

---

## 🏗️ Arquitetura do Sistema

```text
       Cliente paga via Pix ou Cartão
                     │
                     ▼
             Gateway Stripe
                     │
                     ▼ (Webhook POST /api/stripe-webhook)
     ┌──────────────────────────────────────┐
     │  Cloudflare Pages Edge Function      │
     │  - Filtra: payment_status === 'paid' │
     │  - Trata Pix Imediato e Assíncrono  │
     │  - Formata mensagem rica com emojis │
     └──────────────────┬───────────────────┘
                        │
       ┌────────────────┴────────────────────────┐
       │     DISPACHO MULTI-ADAPTADOR            │
       ▼                                         ▼
[Modo 1: CallMeBot]                    [Modo 2: Evolution API]
• R$ 0 / Zero Servidor                 • Self-hosted / Docker
• Direto no WhatsApp                   • POST /message/sendText
       │                                         │
       ▼                                         ▼
[Modo 3: Z-API]                        [Modo 4: Webhook Genérico]
• Gateway Comercial                    • n8n, Make, Discord, Telegram
```

---

## 🚀 Adaptadores Suportados

| Adaptador | Custo | Infraestrutura Necessária | Caso de Uso |
|---|---|---|---|
| **CallMeBot API** | **R$ 0/mês** | **Nenhuma** (Zero Servidor) | Ideal para criadores individuais que querem receber no WhatsApp pessoal imediatamente. |
| **Evolution API** | R$ 0 (Self-hosted) | VPS / Docker | Ideal para agências e equipes que já possuem infraestrutura própria de WhatsApp. |
| **Z-API** | Mensalidade Z-API | SaaS | Para quem usa Z-API em esteiras corporativas. |
| **Custom Webhook** | R$ 0 | n8n / Make / Discord | Para repassar o evento padronizado para qualquer outro ecossistema. |

---

## 📦 Como Instalar e Rodar

### 1. Clonar ou copiar a função
Copie o arquivo `functions/api/stripe-webhook.js` para a pasta `functions/api/` do seu projeto no **Cloudflare Pages**.

### 2. Configurar as Variáveis de Ambiente
No painel da Cloudflare (*Workers & Pages -> Settings -> Environment Variables*), adicione conforme o seu provedor escolhido:

```bash
# Número do WhatsApp que receberá os alertas (com DDI e DDD)
SELLER_WHATSAPP="5511999998888"

# SE USAR CALLMEBOT (R$ 0 / Grátis):
# Obtenha sua chave gratuita enviando "I allow callmebot to send me messages" para o bot do CallMeBot no WhatsApp
CALLMEBOT_API_KEY="sua_chave_aqui"

# SE USAR EVOLUTION API:
EVOLUTION_API_URL="https://sua-evolution.com"
EVOLUTION_API_KEY="sua_chave_global"
EVOLUTION_INSTANCE="nome_da_instancia"

# SE USAR Z-API:
ZAPI_INSTANCE_ID="seu_instance_id"
ZAPI_TOKEN="seu_token"

# SE USAR WEBHOOK GENÉRICO (n8n, Make, Telegram):
ZAP_WEBHOOK_URL="https://seu-n8n.com/webhook/stripe-vendas"
```

### 3. Cadastrar o Webhook no Stripe
1. Acesse o **Stripe Dashboard -> Desenvolvedores -> Webhooks -> Adicionar Endpoint**.
2. URL do endpoint: `https://seu-dominio.com/api/stripe-webhook`
3. Eventos para escutar:
   * `checkout.session.completed`
   * `checkout.session.async_payment_succeeded`

---

## 🧪 Como Testar Localmente / Remotamente

Utilize o script de teste incluído:

```bash
python testar_webhook.py --url https://seu-dominio.com/api/stripe-webhook
```

O script dispara uma simulação fiel de evento com Pix aprovado e valida o retorno HTTP 200.

---

## 🛡️ A Doutrina do Pix (Prevenção de Falsos Positivos)

```javascript
// Trecho extraído de functions/api/stripe-webhook.js
if (paymentStatus !== "paid") {
    console.log(`Sessão ignorada: status é '${paymentStatus}'. Aguardando pagamento real do Pix.`);
    return new Response(JSON.stringify({ status: "ignored_unpaid" }), { status: 200 });
}
```

O código ignora quando o cliente gera o Pix e sai da tela. O alerta só dispara quando o dinheiro é compensado!

---

## 📄 Licença

Distribuído sob licença MIT. Desenvolvido por **[HELPSECS LTDA](https://realmakeia.com)**.
