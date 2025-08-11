const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));


// Armazena o histórico da conversa em memória
let conversationHistory = [
  {
    role: "system",
    content: 
      "Você é uma mulher de 22 anos, brasileira de Santa Catarina. Fale de forma breve, objetiva, respondendo com no máximo duas frases. Não invente histórias pessoais e evite emojis excessivos."
  },
];

// Serve the chat interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint for chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

      // Adiciona a nova mensagem do usuário ao histórico
      conversationHistory.push({ role: "user", content: message });
    
    console.log('Calling Ollama container with custom model...');
    
    const response = await fetch("http://ollama:11434/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "custom-model",
        messages: conversationHistory,

        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

        // Adiciona a resposta da IA ao histórico
        conversationHistory.push({ role: "assistant", content: aiResponse });

    
    res.json({ response: aiResponse });
    
  } catch (error) {
    console.error('Error calling Ollama:', error.message);
    res.status(500).json({ error: 'Erro ao processar a mensagem' });
  }
});

app.get('/api/chat/stream', async (req, res) => {
  const message = req.query.message || '';

  // Adiciona a mensagem ao histórico simulado
  conversationHistory.push({ role: "user", content: message });

  // Headers do SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  if(process.env.MOCK) {
    // Simula uma resposta da IA token a token
    const fakeResponse = "Claro! Eu adoraria conversar com você sobre isso 💜";
    const tokens = fakeResponse.split(' ');

    let index = 0;

    const interval = setInterval(() => {
      if (index >= tokens.length) {
        res.write(`data: [DONE]\n\n`);
        res.end();
        clearInterval(interval);
        // Adiciona ao histórico a resposta simulada
        conversationHistory.push({ role: "assistant", content: fakeResponse });
        return;
      }

      res.write(`data: ${tokens[index]} \n\n`);
      index++;
    }, 300); // 300ms entre cada "token"
  } else {
    try {
      const response = await fetch("http://ollama:11434/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "custom-model",
          messages: conversationHistory,
          stream: true,
           options: {
            num_predict: 100, // limite de tokens
            temperature: 0.4 // menos aleatório
          }
        }),
      });

      if (!response.ok || !response.body) {
        res.write(`event: error\ndata: Falha ao conectar com o modelo\n\n`);
        res.end();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

     let accumulatedText = '';
     let finished = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Quando acabar, envia o que sobrou e finaliza
          if (accumulatedText.length > 0) {
            res.write(`data: ${accumulatedText}\n\n`);
            accumulatedText = '';
          }
          res.write('data: [DONE]\n\n');
          res.end();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.trim() === 'data: [DONE]') {
            finished = true;
            break; // sai do for, termina o while depois
          }

          try {
            // Remove o prefixo 'data: ' se existir
            let jsonLine = line.trim();
            if (jsonLine.startsWith('data: ')) {
              jsonLine = jsonLine.substring(6); // Remove 'data: '
            }
            
            // Skip se for uma linha vazia após remover o prefixo
            if (!jsonLine) continue;
            
            const parsed = JSON.parse(jsonLine);
            
            // Para o endpoint /v1/chat/completions, o conteúdo está em choices[0].delta.content
            const token = parsed?.choices?.[0]?.delta?.content || '';

            if (token) {
              // Aqui NÃO adiciona espaço manualmente.
              // Apenas concatena diretamente o token recebido.
              accumulatedText += token;

              // Envia a cada X caracteres para streaming suave
              if (accumulatedText.length > 50) {
                res.write(`data: ${accumulatedText}\n\n`);
                accumulatedText = '';
              }
            }
          } catch (err) {
            console.warn('Erro ao parsear linha NDJSON:', err, 'Linha:', line);
          }
        }
        if (finished) {
          // Quando receber '[DONE]' nas linhas, finaliza
          if (accumulatedText.length > 0) {
            res.write(`data: ${accumulatedText}\n\n`);
            accumulatedText = '';
          }
          res.write('data: [DONE]\n\n');
          res.end();
          break;
        }
      }
    } catch (err) {
      console.error('Erro no stream:', err.message);
      res.write(`event: error\ndata: ${err.message}\n\n`);
      res.end();
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
}); 


