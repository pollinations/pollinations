Olá! 👋

Implementei o endpoint de pollen balance solicitado nesta issue. Criei uma PR com a solução completa:

**O que foi implementado:**
- ✅ Endpoint `GET /api/pollen/balance` que retorna o saldo de pollen
- ✅ Suporte para autenticação via API key (Bearer token)
- ✅ Retorna balance separado de tier (gratuito) e pack (comprado)
- ✅ CORS configurado para acesso público
- ✅ Documentação OpenAPI incluída
- ✅ Tratamento de erros adequado

**Resposta da API:**
```json
{
  "pollen": 12.5,
  "tier": 3.0,
  "pack": 9.5,
  "account_id": "user_123",
  "last_updated": "2025-12-13T21:00:00.000Z"
}
```

**Exemplo de uso:**
```typescript
const response = await fetch('https://enter.pollinations.ai/api/pollen/balance', {
  headers: { 'Authorization': `Bearer ${apiKey}` }
});
const balance = await response.json();
```

Isso permitirá que aplicações verifiquem o balance antes de fazer requisições e implementem fallback para modelos mais baratos quando o balance está baixo, exatamente como você mencionou na issue! 🚀

A PR está pronta para revisão. Qualquer feedback é bem-vindo!

---

**Desenvolvido por:** Fábio Arieira  
**Website:** https://fabioarieira.com
