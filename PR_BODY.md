## Descrição

Esta PR implementa o endpoint `/api/pollen/balance` solicitado na issue #5892.

## O que foi implementado

- ✅ Novo endpoint `GET /api/pollen/balance` que retorna o saldo de pollen
- ✅ Suporte para autenticação via API key
- ✅ Retorna balance de tier (gratuito) e pack (comprado)
- ✅ CORS configurado para acesso público via API
- ✅ Documentação OpenAPI incluída
- ✅ Tratamento de erros adequado

## Resposta da API

```json
{
  "pollen": 12.5,
  "tier": 3.0,
  "pack": 9.5,
  "account_id": "user_123",
  "last_updated": "2025-12-13T21:00:00.000Z"
}
```

## Casos de Uso

Este endpoint permite que aplicações:
1. Verifiquem o balance antes de fazer requisições
2. Implementem fallback para modelos mais baratos quando o balance está baixo
3. Alertem usuários proativamente antes do balance acabar
4. Implementem rate limiting inteligente baseado no balance disponível

## Exemplo de Uso

```typescript
const response = await fetch('https://enter.pollinations.ai/api/pollen/balance', {
  headers: {
    'Authorization': `Bearer ${apiKey}`
  }
});
const balance = await response.json();
console.log(`Available pollen: ${balance.pollen}`);
```

## Testes

- [x] Endpoint retorna balance correto para API keys válidas
- [x] Retorna 401 para API keys inválidas
- [x] CORS configurado corretamente
- [x] Documentação OpenAPI gerada automaticamente

## Créditos

Desenvolvido por **Fábio Arieira** (https://fabioarieira.com)  
Full Stack Developer especializado em integrações de API e desenvolvimento de aplicações web modernas.

---

Resolves #5892
