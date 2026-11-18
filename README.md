# Mapa do Bolso

As notícias do mundo que mexem com o seu bolso, explicadas em um minuto. Um mapa-múndi clicável mostra, por país, o que aconteceu e como isso chega até você nas próximas semanas, nos próximos meses e em um ano ou mais.

## Como funciona

1. Todo dia de manhã, o GitHub Actions roda `scripts/gerar.py`.
2. O script lê notícias de feeds públicos (só título, resumo curto e link).
3. A IA analisa seguindo `scripts/prompt.md` e devolve o resumo e as análises.
4. O resultado vai para `data/hoje.json` (e uma cópia em `data/arquivo/`).
5. O site (`index.html`, `app.js`, `style.css`) lê esse arquivo. Não precisa de banco de dados.

## Configurar a IA

Em **Settings → Secrets and variables → Actions → New repository secret**, crie `ANTHROPIC_API_KEY` com a sua chave. Depois, em **Actions → Edição diária → Run workflow**, rode a primeira edição na mão.

## Rodar no computador

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Publicar

Importe o repositório na Vercel como site estático (sem comando de build). Cada nova edição diária publica sozinha.

Conteúdo informativo e educacional. Não constitui recomendação de investimento.
