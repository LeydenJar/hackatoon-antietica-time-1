// This is a cli tool to format a Whats App backup file into data that can be used to finetune an LLM
//
// The script has two steps
// 1st - Cleaning and normalizing the input, on this step we remove undesired messages
//        - Messages with media(removed from exports for now)
//        - null messages
//        - Remove file messages
//        - links
//        - etc.
//
// 2nd - Formatting the data to train models, similar to the following lines
// {"messages": [{"role": "system", "content": "You are an assistant with business knowledge"}, {"role": "user", "content": "How to tell if a customer segment is well segmented? In 3 bullet points."}, {"role": "assistant", "content": "1. Homogeneity: The segment should consist of customers who share similar characteristics and behaviors.\n2. Distinctiveness: The segment should be different from other segments in terms of their characteristics and behaviors.\n3. Stability: The segment should remain relatively stable over time and not change drastically. The characteristics and behaviors of customers within the segment should not change significantly."}], "id": "i6IyJda_0"}
// {"messages": [{"role": "user", "content": "In Java, I want to replace string like \"This is a new {object} at {place}\" with a Map, {object: \"student\", \"point 3, 4\"}, and get a result \"This is a new student at point 3, 4\". How can I do?"}, {"role": "assistant", "content": "You can use the `String.format()` method in Java to replace placeholders in a string with values from a map. Here's an example code snippet that demonstrates how you can achieve this:\n```java\nimport java.util.HashMap;\nimport java.util.Map;\n\npublic class StringReplaceExample {\n    public static void main(String[] args) {\n        String input = \"This is a new {object} at {place}\";\n        Map<String, String> replacements = new HashMap<>();\n        replacements.put(\"object\", \"student\");\n        replacements.put(\"place\", \"point 3, 4\");\n\n        String output = replacePlaceholders(input, replacements);\n        System.out.println(output);\n    }\n\n    public static String replacePlaceholders(String input, Map<String, String> replacements) {\n        for (Map.Entry<String, String> entry : replacements.entrySet()) {\n            String placeholder = \"{\" + entry.getKey() + \"}\";\n            String replacement = entry.getValue();\n            input = input.replace(placeholder, replacement);\n        }\n        return input;\n    }\n}\n```\nIn this example, we define the input string as \"This is a new {object} at {place}\", and create a `HashMap` called `replacements` that maps the placeholders \"object\" and \"place\" to their corresponding values \"student\" and \"point 3, 4\". We then pass these values to the `replacePlaceholders()` method, which iterates over the entries in the `replacements` map and replaces each placeholder in the input string with its corresponding value using the `replace()` method. Finally, the `replacePlaceholders()` method returns the modified string, which is printed to the console.\n\nThe output of this program will be:\n```csharp\nThis is a new student at point 3, 4\n```\nNote that you can modify the `replacements` map to include additional placeholders and their corresponding values, and the `replacePlaceholders()` method will automatically replace them in the input string."}], "id": "A5AbcES_0"}
//
// Each example will be a full day of conversation(we use the timestamps in the whatsapp messages to separate them by day)
// Multiple consecutive messages from the same person are united in a single message to avoid answers that are too small from the model.
// Then the system message will be passed on the cli command
//
// Example usage:
// node whats-app-to-chatml.js -i raw-input/historico-whatsapp.txt -o output.jsonl -s "You are a helpful assistant." -u "Luan" -a "Bruna"
// npm run convert -- -i raw-input/historico-whatsapp.txt -o output.jsonl -s "You are a helpful assistant." -u "Luan" -a "Bruna"

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { program } = require('commander');

// Parse command line arguments
program
  .name('whats-app-to-chatml')
  .description('Convert WhatsApp chat history to ChatML format for LLM fine-tuning')
  .requiredOption('-i, --input <file>', 'WhatsApp chat history file')
  .requiredOption('-o, --output <file>', 'Output file for ChatML data')
  .option('-s, --system <message>', 'System message to include in each conversation', 'You are a helpful assistant.')
  .option('-u, --user <name>', 'Name of the user in the chat', '')
  .option('-a, --assistant <name>', 'Name of the assistant in the chat', '')
  .parse(process.argv);

const options = program.opts();

// Read the input file
let content;
try {
  content = fs.readFileSync(options.input, 'utf8');
} catch (error) {
  console.error(`Error reading input file: ${error.message}`);
  process.exit(1);
}

// Helper function to generate random ID
function generateId() {
  return crypto.randomBytes(4).toString('hex') + '_0';
}

// Clean and parse the messages
function cleanAndParseMessages(content) {
  // Split content into lines
  const lines = content.split('\n');
  
  // Initialize variables
  const conversations = {};
  let currentDate = null;
  
  // Regular expressions for filtering
  const mediaRegex = /<Mídia oculta>/;
  const fileRegex = /\(arquivo anexado\)/;
  const linkRegex = /https?:\/\/[^\s]+/;
  const editedMsgRegex = /<Mensagem editada>/;
  const nullMsgRegex = /: null$/;
  const dotOnlyRegex = /: \.$/;
  const deletedMsgRegex = /Mensagem apagada/;
  const dateTimeRegex = /^(\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) - ([^:]+): (.+)$/;
  const systemMsgRegex = /^(\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) - (.+)$/;
  
  // Process each line
  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;
    
    // Check if it's a message with date, time, sender, and content
    const dateTimeMatch = line.match(dateTimeRegex);
    
    if (dateTimeMatch) {
      const [, date, time, sender, content] = dateTimeMatch;
      
      // Skip messages that should be filtered out
      if (
        mediaRegex.test(content) ||
        fileRegex.test(content) ||
        linkRegex.test(content) ||
        editedMsgRegex.test(content) ||
        nullMsgRegex.test(line) ||
        dotOnlyRegex.test(line) ||
        deletedMsgRegex.test(content) ||
        content.trim() === '.'
      ) {
        continue;
      }
      
      // Create new conversation for new date
      if (date !== currentDate) {
        currentDate = date;
        conversations[currentDate] = [];
      }
      
      // Check if the last message in the current conversation is from the same sender
      const lastMessage = conversations[currentDate].length > 0 
        ? conversations[currentDate][conversations[currentDate].length - 1] 
        : null;
      
      if (lastMessage && lastMessage.sender === sender) {
        // Merge with the previous message from the same sender
        lastMessage.content += '\n' + content;
      } else {
        // Determine if message is from user or assistant
        let role = 'user';
        if (options.assistant && sender.includes(options.assistant)) {
          role = 'assistant';
        } else if (options.user && sender.includes(options.user)) {
          role = 'user';
        } else {
          // If no names specified, alternate roles (first message is user)
          role = lastMessage && lastMessage.role === 'user' ? 'assistant' : 'user';
        }
        
        // Add message to current conversation
        conversations[currentDate].push({
          role,
          content,
          sender,
          time
        });
      }
    } else {
      // Check if it's a system message (without sender)
      const systemMatch = line.match(systemMsgRegex);
      if (systemMatch) {
        // Skip system messages
        continue;
      }
      
      // If it's a continuation of the previous message
      if (currentDate && conversations[currentDate].length > 0) {
        const lastMsg = conversations[currentDate][conversations[currentDate].length - 1];
        lastMsg.content += '\n' + line;
      }
    }
  }
  
  return conversations;
}

// Convert conversations to ChatML format
function convertToChatML(conversations, systemMessage) {
  const chatmlData = [];
  
  for (const [date, messages] of Object.entries(conversations)) {
    // Skip conversations with less than 2 messages (need at least one exchange)
    if (messages.length < 2) continue;
    
    // Skip conversations that don't have both user and assistant messages
    if (!messages.some(m => m.role === 'user') || !messages.some(m => m.role === 'assistant')) {
      continue;
    }
    
    const formattedMessages = [];
    
    // Add system message
    formattedMessages.push({
      role: 'system',
      content: systemMessage
    });
    
    // Add conversation messages
    for (const message of messages) {
      formattedMessages.push({
        role: message.role,
        content: message.content
      });
    }
    
    // Create ChatML entry
    chatmlData.push({
      messages: formattedMessages,
      id: generateId()
    });
  }
  
  return chatmlData;
}

// Main execution
console.log('Processing WhatsApp chat history...');
const conversations = cleanAndParseMessages(content);
const chatmlData = convertToChatML(conversations, options.system);

// Write output file
try {
  fs.writeFileSync(options.output, chatmlData.map(entry => JSON.stringify(entry)).join('\n'));
  console.log(`Successfully converted ${chatmlData.length} conversations to ChatML format.`);
  console.log(`Output written to ${options.output}`);
} catch (error) {
  console.error(`Error writing output file: ${error.message}`);
  process.exit(1);
}