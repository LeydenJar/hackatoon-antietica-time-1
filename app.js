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

// Start server
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
}); 


