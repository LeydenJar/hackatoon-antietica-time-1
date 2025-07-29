# 🚀 Como Rodar o Chat com IA

## Opção 1: Usando Docker (Recomendado)

### 1. Iniciar tudo com Docker Compose
```bash
docker-compose up -d
```

### 2. Acessar a interface
Abra seu navegador e vá para: `http://localhost:3000`

## Opção 2: Rodar localmente

### 1. Instalar dependências
```bash
npm install
```

### 2. Iniciar o servidor
```bash
npm start
```

### 3. Acessar a interface
Abra seu navegador e vá para: `http://localhost:3000`

## 🔧 O que está rodando

- **Ollama**: Container Docker rodando na porta 11434
- **Interface Web**: Servidor Express rodando na porta 3000
- **Modelo**: `custom-model` (seu modelo personalizado)

## 📝 Notas importantes

- Certifique-se de que o Docker está rodando
- O Ollama precisa estar funcionando para a interface responder
- A interface se conecta automaticamente ao modelo `custom-model`
- Se der erro, verifique se o container Ollama está saudável

## 🐛 Troubleshooting

Se a interface não responder:
1. Verifique se o Docker está rodando
2. Execute `docker-compose logs` para ver os logs
3. Verifique se o modelo `custom-model` está carregado no Ollama 