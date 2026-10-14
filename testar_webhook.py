# -*- coding: utf-8 -*-
import sys
import argparse
import requests

def testar(url):
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
        "id": "evt_test_001",
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
    
    print("
[2] Enviando Payload de Teste POST (Pix Pago R$ 27,00)...")
    try:
        r = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=15)
        print(f"    Status: HTTP {r.status_code}")
        print("    Resposta:", r.json())
        if r.status_code == 200 and r.json().get("success"):
            print("[SUCESSO] Webhook processou e despachou perfeitamente!")
    except Exception as e:
        print("[!] Erro no POST:", e)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='https://realmakeia.com/api/stripe-webhook', help='URL do webhook')
    args = parser.parse_args()
    testar(args.url)
