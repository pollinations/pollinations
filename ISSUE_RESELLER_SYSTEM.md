# Feature Request: Pollen Reseller/White-Label API System

## 🎯 Resumo

Proposta para implementar um sistema de revenda/white-label que permite que projetos integrados (como IA-Books, ViralFlow, etc.) vendam polens diretamente aos seus próprios usuários, mantendo a marca e experiência do projeto integrado.

## 📋 Problema/Necessidade

Atualmente, quando um usuário de um projeto integrado (ex: IA-Books) precisa comprar polens, ele precisa:
1. Sair do projeto integrado
2. Ir para o site da Pollinations
3. Criar conta/login na Pollinations
4. Comprar polens
5. Voltar para o projeto integrado

Isso quebra a experiência do usuário e cria fricção desnecessária. Projetos integrados gostariam de oferecer a compra de polens diretamente dentro de suas próprias plataformas, mantendo a marca e experiência do usuário.

## 💡 Solução Proposta

Implementar um sistema de revenda/white-label que permite:

1. **Projetos registrados como revendedores** podem criar checkouts de pollen para seus usuários
2. **Usuários finais** compram polens sem sair do projeto integrado
3. **Pollens são alocados automaticamente** à conta do usuário final
4. **Sistema de comissão/margem** para revendedores (opcional)

## 🏗️ Arquitetura Proposta

```
┌─────────────────┐
│  Projeto (ex:   │
│   IA-Books)     │
└────────┬────────┘
         │
         │ POST /api/pollen/reseller/checkout
         │ { amount, target_user_id, ... }
         ▼
┌─────────────────┐
│  Pollinations   │
│     API         │
└────────┬────────┘
         │
         │ Cria checkout no Polar
         ▼
┌─────────────────┐
│  Polar Checkout │
│  (White-label)  │
└────────┬────────┘
         │
         │ Usuário paga
         ▼
┌─────────────────┐
│  Webhook Polar  │
│  (checkout.succeeded)
└────────┬────────┘
         │
         │ Aloca pollen via Events API
         ▼
┌─────────────────┐
│  Usuário Final  │
│  Recebe Pollen  │
└─────────────────┘
```

## 🔧 Especificação Técnica

### 1. Endpoint de Checkout para Revendedores

**POST** `/api/pollen/reseller/checkout`

**Autenticação:** API Key do revendedor (Secret Key com flag `isReseller: true`)

**Request Body:**
```json
{
  "amount": 10,
  "target_user_id": "user_123",
  "target_user_email": "user@example.com",
  "target_user_name": "João Silva",
  "success_url": "https://iabooks.com.br/purchase/success",
  "cancel_url": "https://iabooks.com.br/purchase/cancel",
  "metadata": {
    "source": "iabooks",
    "project_name": "IA-Books",
    "custom_data": {}
  }
}
```

**Response:**
```json
{
  "checkout_url": "https://polar.sh/checkout/xxx",
  "checkout_id": "checkout_xxx",
  "expires_at": "2025-12-13T22:00:00Z"
}
```

### 2. Webhook Handler

**POST** `/api/webhooks/polar`

Processa eventos do Polar e aloca pollen quando checkout é bem-sucedido.

### 3. Sistema de Registro de Revendedores

- Endpoint para registrar projetos como revendedores
- Validação de domínio/URL
- Configuração de comissão/margem (opcional)
- Dashboard para revendedores verem vendas

### 4. Alocação de Pollen

Usar Polar Events API com valores negativos para "grant" créditos:

```typescript
await polar.events.create({
  customerId: targetUserId,
  meterId: pollenPackMeterId,
  amount: -pollenAmount, // Negativo = adiciona crédito
  metadata: {
    source: "reseller",
    reseller_id: resellerId,
    checkout_id: checkoutId,
  },
});
```

## 📊 Casos de Uso

### Caso 1: IA-Books vende polens aos seus usuários

1. Usuário do IA-Books quer criar mais livros, mas está sem pollen
2. Clica em "Comprar Polens" dentro do IA-Books
3. IA-Books chama API da Pollinations com dados do usuário
4. Usuário é redirecionado para checkout (pode ser white-label)
5. Após pagamento, pollen é alocado automaticamente
6. Usuário volta para IA-Books e pode continuar criando livros

### Caso 2: ViralFlow oferece pacotes de polens

1. ViralFlow oferece pacotes: "10 vídeos" = 5 polens
2. Usuário compra pacote dentro do ViralFlow
3. Pollen é alocado e usuário pode gerar vídeos imediatamente

### Caso 3: Projeto educacional com créditos

1. Plataforma educacional vende créditos de IA para alunos
2. Alunos compram créditos dentro da plataforma
3. Créditos são convertidos em pollen automaticamente

## ✅ Benefícios

### Para Projetos Integrados:
- ✅ Melhor UX: usuários não precisam sair da plataforma
- ✅ Controle da experiência de compra
- ✅ Possibilidade de markup/preço customizado
- ✅ Integração seamless

### Para Pollinations:
- ✅ Mais vendas através de parceiros
- ✅ Maior adoção da API
- ✅ Ecossistema mais forte
- ✅ Novos canais de distribuição

### Para Usuários Finais:
- ✅ Experiência mais fluida
- ✅ Não precisa criar múltiplas contas
- ✅ Compra direta onde usa o serviço

## 🔒 Considerações de Segurança

1. **Validação de Revendedores:**
   - Apenas projetos aprovados podem usar a API
   - Verificação de domínio/URL
   - Rate limiting por revendedor

2. **Validação de Usuários:**
   - Verificar se `target_user_id` existe ou criar automaticamente
   - Validar email do usuário final
   - Prevenir fraude/abuse

3. **Webhooks:**
   - Assinatura de webhooks do Polar
   - Validação de eventos
   - Idempotência (evitar duplicação)

4. **Comissões:**
   - Sistema transparente de comissões
   - Tracking de vendas por revendedor
   - Relatórios para revendedores

## 📝 Exemplo de Implementação

### No Projeto Integrado (IA-Books):

```typescript
// services/pollinationsReseller.ts

export async function createPollenCheckout(
  userId: string,
  userEmail: string,
  amount: number
): Promise<string> {
  const response = await fetch('https://enter.pollinations.ai/api/pollen/reseller/checkout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESELLER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      target_user_id: userId,
      target_user_email: userEmail,
      success_url: `${window.location.origin}/purchase/success`,
      cancel_url: `${window.location.origin}/purchase/cancel`,
      metadata: {
        source: 'iabooks',
        project_name: 'IA-Books',
      },
    }),
  });

  const data = await response.json();
  return data.checkout_url; // Redireciona usuário para checkout
}
```

## 🚀 Plano de Implementação

### Fase 1: MVP
- [ ] Endpoint de checkout para revendedores
- [ ] Webhook handler básico
- [ ] Alocação de pollen via Events API
- [ ] Sistema de registro manual de revendedores

### Fase 2: Melhorias
- [ ] Dashboard para revendedores
- [ ] Sistema de comissões
- [ ] Relatórios de vendas
- [ ] White-label checkout (opcional)

### Fase 3: Avançado
- [ ] API de preços customizados
- [ ] Sistema de afiliados
- [ ] Analytics avançado
- [ ] Multi-currency support

## 💬 Discussão

Esta funcionalidade seria extremamente valiosa para projetos como:
- **IA-Books** (https://iabooks.com.br)
- **ViralFlow** (https://fabioarieira.com/viralflow)
- E outros projetos que integram a API da Pollinations

Permitiria que esses projetos ofereçam uma experiência completa aos seus usuários, aumentando a adoção da API e criando um ecossistema mais forte.

## 📚 Referências

- Polar.sh Events API: https://polar.sh/docs/guides/grant-meter-credits-after-purchase
- Polar.sh Webhooks: https://polar.sh/docs/guides/webhooks
- Exemplo de uso atual: `/api/polar/checkout/:slug` em `enter.pollinations.ai/src/routes/polar.ts`

---

**Proposto por:** Fábio Arieira  
**Website:** https://fabioarieira.com  
**Projetos:** IA-Books (https://iabooks.com.br), ViralFlow (https://fabioarieira.com/viralflow)
