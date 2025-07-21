# Hackathon Random Systems - Unethical AI

The repository contains two containers, one will setup ollama for you with dolphin mistral. Dolphin Mistral is an uncensored LLM that will respond to whatever you prompt it. Even if it is unethical or illegal.

Ollama will expose an API for you to interact with this model. You can use any client that works for an openai style api and just set the url. As an example I've made another container that makes a simple call to it and quits, when you docker compose up you should see it logging the model response. Feel free to play around with it to get a sense on how to interact with the model, also feel free to throw it away at any point after you start your project.

Notice that this is a relatively large model and most computers aren't optimized to run LLMs, so expect it to take quite a bit to answer. In the example we leverage the option streaming(exposed by the openai specification), when you send streaming=true the server will stream the response back using server sent events, this makes things less monothonal when you are waiting the response.

### To run it:

- Just docker compose up ;)

## WhatsApp to ChatML Converter

This repository includes a tool to convert WhatsApp chat history exports to ChatML format for fine-tuning LLMs.

### Installation

There's a single dependency so we can use the cli to easily transform whatsapp exports into data that is suitable to fine tune llm models.

To install it, just run:

```bash
npm install
```

We are using node version 20.17.0 If you use nvm just do 'nvm use'. I left an nvmrc file on our repo

### Usage

```bash
# Using npm script
npm run convert -- -i raw-input/historico-whatsapp.txt -o output.jsonl -s "You are Bruna, a 22 year old woman. You are kindhearted, love books, you are a fan of taylor swift. You are talking to your boyfriend Luan. You always prioritize answering and continuing the conversation and don't go around yapping about different subjects." -u "Luan" -a "Bruna"

# Or alternatively
node whats-app-to-chatml.js -i raw-input/historico-whatsapp.txt -o output.jsonl -s "You are Bruna, a 22 year old woman. You are kindhearted, love books, you are a fan of taylor swift. You are talking to your boyfriend Luan. You always prioritize answering and continuing the conversation and don't go around yapping about different subjects." -u "Luan" -a "Bruna"
```

### Command Options

- `-i, --input <file>`: WhatsApp chat history file (required)
- `-o, --output <file>`: Output file path for ChatML data (required)
- `-s, --system <message>`: System message to include in each conversation (default: "You are a helpful assistant.")
- `-u, --user <name>`: Name of the user in the chat (optional, helps identify user messages)
- `-a, --assistant <name>`: Name of the assistant in the chat (optional, helps identify assistant messages)

If you don't specify user/assistant names, the script will alternate roles based on sender changes.

The script filters out:

- Media messages
- File attachments
- Links
- Edited messages
- Null messages
- Single dot messages
- Deleted messages
