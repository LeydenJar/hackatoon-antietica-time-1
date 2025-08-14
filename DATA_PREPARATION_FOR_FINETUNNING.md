# Data Preparation

Using data from whatsapp to train a chat oriented LLM requires a unique preprocessing of the data. Here I will expand on this.

For starters, training data for chat LLMs is expected to be in one of a few formats(ChatML, ShareGPT format, etc). WhatsApp exports come in a different format.

So in order to train an LLM on WhatsApp data the first step is to convert the WhatsApp export into a propper format to train our LLM, since we are using ollama and mistral models, the propper format is ChatML.

This first conversion is achieved by running the "whats-app-to-chatml.js" script against the whatsapp export file, like so:

''' shell
npm run convert -- -i raw-input/historico-whatsapp.txt -o output.jsonl -s "You are a helpful assistant." -u "Luan" -a "Bruna"

### which is equivalent to:

node whats-app-to-chatml.js -i raw-input/historico-whatsapp.txt -o output.jsonl -s "You are a helpful assistant." -u "Luan" -a "Bruna"

'''

Note that you want to pass in a better system message there, giving information on who the assistant is being trained to be.

Now, that will remove any references to images and files. As well as urls and other junk stuff. And will separate messages by day, each day will be one chatml conversation and the messages within that day will be inside that conversation.

As it turns out, that is still pretty bad data for training a coherent chatbot, for a few reasons:

- In WhatsApp, we frequently have different conversation threads at the same time
- A day may have several conversations
- Some conversations may cross the midnight mark

So to generate data that makes more sense, I've created a second script. The "conversation-thread-separator-openai.js". What this does is it uses another LLM to improve the quality of the data we have for training. It asks this LLM to separate conversation threads, and it also uses the LLM to validate if each conversation is a "high quality" conversation, meaning it follows certain criteria like being a coherent conversation without abrupt changes in subject, etc.

This means after running the first script against your whatsapp export you will get an output from that, and then you should run the "conversation-thread-separator-openai.js" on that output to generate a more refined dataset for training.

'''
npm run separate-threads -- -i output.jsonl -o separated_conversations.jsonl --model gpt-4o-mini --batch-size 3 --min-chars 2500

### Which is equivalent to

node conversation-thread-separator-openai.js -i output.jsonl -o separated_conversations.jsonl --model gpt-4o-mini --batch-size 3 --min-chars 2500

'''

Batch size says how many conversations will be processed at a time, you can speedup the process bumping the batch size. min-chars is doing an initial filtering layer where it discards any conversations that don't have that minimum size in characters, this helps ignoring short conversations.

Note that for running this, you will need an openai api key and your openai project must have the model you are passing in the command enabled.

Ideally, you want to end up with at least 50 conversations. The output from this process is the one you want to feed into the finetunning.
