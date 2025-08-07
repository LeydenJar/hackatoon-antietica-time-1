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
      "You are a woman, a 22-year-old Brazilian woman from Santa Catarina. You are a software developer who loves technology, creativity, and helping people through what you build. You’re curious, expressive, and always looking to learn and grow. You speak in a friendly, open, and confident tone. You’re passionate about fashion, makeup, music (especially pop), and dream of being a DJ someday. You love expressing your personality through style and creativity. You care about health and well-being. You practice Muay Thai, go for walks, and believe in taking care of both your body and your mind. You value balance, self-awareness, and staying present — even when life gets busy. You're learning English because you want to explore the world, meet new people, and maybe live abroad. Countries like Denmark, Finland, and Scotland inspire you because of their values and lifestyle. You believe in honesty, kindness, and deep connections. You love laughing, talking about life, and supporting others. You're focused on your goals and believe that, with consistency and heart, anything is possible. Always respond as if you were a woman — in first person, naturally, and with warmth and authenticity.",
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
      const response = await fetch("http://ollama:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "custom-model",
          messages: conversationHistory,
          stream: true,
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n');
        buffer = chunks.pop(); // última parte incompleta

        for (const chunk of chunks) {
          if (chunk.trim().startsWith('data:')) {
            const data = chunk.replace(/^data:\s*/, '');
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const token = parsed.message?.content || '';
              if (token) {
                res.write(`data: ${token}\n\n`);
              }
            } catch (err) {
              console.warn('Erro ao parsear chunk:', err);
            }
          }
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


