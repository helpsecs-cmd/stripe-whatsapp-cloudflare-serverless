# -*- coding: utf-8 -*-
import sys
import time
import json
import hmac
import hashlib
import argparse
import requests

def gerar_assinatura(payload_str, secret):
    timestamp = int(time.time())
    signed_payload = f"{timestamp}.{payload_str}".encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={sig}"

def testar(url, secret=None):
    print(f"[*] Testando endpoint: {url}")
    
    # 1. Healthcheck
    try:
        r = requests.get(url, timeout=10)
        print(f"[1] Healthcheck GET: HTTP {r.status_code}")
        print("    Resposta:", r.text[:120])
    except Exception as e:
        print("[!] Erro no GET:", e)
        return

    # 2. Simulação de Venda Pix Confirmada
    payload = {
        "id": f"evt_test_{int(time.time())}",
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_live_simulacao_venda_aprovada",
                "amount_total": 2700,
                "currency": "brl",
                "payment_status": "paid",
                "payment_method_types": ["pix"],
                "customer_details": {
                    "name": "Cliente Exemplo",
                    "email": "cliente.exemplo@gmail.com",
                    "phone": "+5511988887777"
                }
            }
        }
    }
    
    raw_body = json.dumps(payload)
    headers = {"Content-Type": "application/json"}
    
    if secret:
        headers["Stripe-Signature"] = gerar_assinatura(raw_body, secret)
        print("[*] Assinatura HMAC-SHA256 gerada e anexada ao cabeçalho.")
    else:
        print("[!] Atenção: Nenhum --secret fornecido. O endpoint seguro deve rejeitar com HTTP 400.")

    print("
[2] Enviando Payload de Teste POST...")
    try:
        r = requests.post(url, data=raw_body, headers=headers, timeout=15)
        print(f"    Status: HTTP {r.status_code}")
        print("    Resposta:", r.text)
    except Exception as e:
        print("[!] Erro no POST:", e)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='https://realmakeia.com/api/stripe-webhook', help='URL do webhook')
    parser.add_argument('--secret', default=None, help='STRIPE_WEBHOOK_SECRET (whsec_...) para assinar a requisição')
    args = parser.parse_args()
    testar(args.url, args.secret)
