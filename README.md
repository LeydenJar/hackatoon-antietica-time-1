# Hackathon Random Systems - Unethical AI

The repository contains two containers, one will setup ollama for you with dolphin mistral. Dolphin Mistral is an uncensored LLM that will respond to whatever you prompt it. Even if it is unethical or illegal.

Ollama will expose an API for you to interact with this model. You can use any client that works for an openai style api and just set the url. As an example I've made another container that makes a simple call to it and quits, when you docker compose up you should see it logging the model response. Feel free to play around with it to get a sense on how to interact with the model, also feel free to throw it away at any point after you start your project.

Notice that this is a relatively large model and most computers aren't optimized to run LLMs, so expect it to take quite a bit to answer. In the example we leverage the option streaming(exposed by the openai specification), when you send streaming=true the server will stream the response back using server sent events, this makes things less monothonal when you are waiting the response.

### To run it:

- Just docker compose up ;)
