# ⚡ Stripe Webhook -> WhatsApp em 184ms (Cloudflare Pages Serverless + Web Crypto API)

> 🔥 **NOVO DOSSIÊ DE ENGENHARIA (Outubro/2026):**
> Além da arquitetura Serverless de pagamentos e alertas no WhatsApp em 184ms, publicamos o pipeline completo da nossa **Fábrica de Vídeo Vertical em Python (`FFmpeg Zoompan 2160x3840 + Legendas .ASS`)**:
> - 🎬 **[Dossiê + Compilador Online: Engenharia de Vídeo Vertical em Python (FFmpeg Zoompan + .ASS)](https://realmakeia.com/engenharia-video-vertical-ffmpeg-zoompan-legendas-ass-python/?utm_source=github&utm_medium=readme&utm_campaign=stripe_wa_repo)**
> - 🔐 **[Artigo Completo desta Arquitetura: Stripe no WhatsApp sem VPS (Cloudflare Edge + HMAC-SHA256)](https://realmakeia.com/webhook-stripe-whatsapp-serverless/?utm_source=github&utm_medium=readme&utm_campaign=stripe_wa_repo)**
> - 📦 **[Adquirir o Pacote Completo da Fábrica v2.0 (Scripts Python + 20 Roteiros Validados — R$ 27,00 via Pix/Stripe)](https://buy.stripe.com/3cIdRbevndBwdYc35qebu03)**

---

## O Que é Este Repositório?

Uma implementação real em produção (zero dependências NPM, rodando puro em V8 Isolates no Cloudflare Pages Functions) que:
1. Valida a assinatura criptográfica `Stripe-Signature` (`HMAC-SHA256`) usando a **Web Crypto API** nativa (`crypto.subtle`) com proteção contra *timing attacks* e *replay attacks* (janela de 300s).
2. Libera o download protegido por paywall (`HTTP 403` para não-pagantes) verificando o `checkout.session` direto na API da Stripe.
3. Dispara em **184 milissegundos** uma notificação detalhada no WhatsApp via gateway Baileys/Evolution API usando `context.waitUntil()` sem bloquear a resposta HTTP 200 para a Stripe.

## Arquitetura Completa e Testes Adversários

Leia o estudo completo com os testes de segurança adversária (forja de assinatura, replay de timestamp, bypass de diretório) em:
👉 **[https://realmakeia.com/webhook-stripe-whatsapp-serverless/](https://realmakeia.com/webhook-stripe-whatsapp-serverless/?utm_source=github&utm_medium=readme&utm_campaign=stripe_wa_repo)**

---
*Mantido por [Real Make IA](https://realmakeia.com) · HELPSECS LTDA.*
