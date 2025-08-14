#!/usr/bin/env node

// Script to separate ChatML conversations into coherent threads using OpenAI GPT
// This script takes the output from whats-app-to-chatml.js and improves conversation separation
// by using OpenAI GPT to identify topic changes and conversation boundaries

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { program } = require('commander');
require('dotenv').config();

// Parse command line arguments
program
  .name('conversation-thread-separator-openai')
  .description('Separate ChatML conversations into coherent threads using OpenAI GPT analysis')
  .requiredOption('-i, --input <file>', 'Input JSONL file with ChatML conversations')
  .requiredOption('-o, --output <file>', 'Output JSONL file with separated conversations')
  .option('--model <name>', 'OpenAI model to use', 'gpt-4o-mini')
  .option('--batch-size <number>', 'Number of conversations to process in parallel', '3')
  .option('--min-chars <number>', 'Minimum character length for conversations to process', '800')
  .option('--min-exchanges-per-conversation <number>', 'Minimum number of exchanges a conversation must have to be appended to the output file (counted after processing)', '3')
  .parse(process.argv);

const options = program.opts();

// Check for OpenAI API key
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  console.error('Please create a .env file with your OpenAI API key:');
  console.error('OPENAI_API_KEY=your_api_key_here');
  process.exit(1);
}

// Helper function to generate random ID
function generateId() {
  return crypto.randomBytes(4).toString('hex') + '_0';
}

// Function to call OpenAI API using chat completions format
async function callOpenAI(prompt, model = options.model) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent analysis
        max_tokens: 4000,
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error(`Error calling OpenAI: ${error.message}`);
    throw error;
  }
}

// Function to validate conversation quality
async function validateConversationQuality(conversation, conversationType = 'thread-separated') {
  const startTime = Date.now();
  const messages = conversation.messages.filter(m => m.role !== 'system');
  
  console.log(`    🔍 Starting validation of ${conversationType} conversation (${messages.length} messages)...`);
  
  if (messages.length < options.minExchangesPerConversation) {
    const duration = Date.now() - startTime;
    console.log(`    ❌ Validation failed: Too few messages (${messages.length}) - ${duration}ms`);
    return false; // Need at least one exchange
  }
  
  // Create conversation text for quality analysis
  const conversationText = messages.map((msg, index) => {
    const content = msg.content.replace(/\n/g, '\\n');
    return `${index + 1}. {"role": "${msg.role}", "content": "${content}"}`;
  }).join('\n');

  const qualityPrompt = `You are evaluating the quality of a ChatML conversation. The objective is to finetune an LLM to have similar personality to the assistant of the conversation

A HIGH-QUALITY conversation should be:
1. COHERENT - All messages relate to the same topic/context
2. NATURAL - The flow makes sense, responses are relevant to what was said before
3. COMPLETE - Not just random fragments, but a meaningful exchange
4. CONTEXTUALLY CONSISTENT - References and pronouns make sense within the thread

A LOW-QUALITY conversation might be:
1. Random fragments that don't connect
2. Messages that seem to be responses to missing context
3. Abrupt topic changes that don't make sense
4. References to things not mentioned in the conversation
5. Single-word responses without context
6. Changes in subject in the same message, or on line breaks

If the conversation has any messages that don't make sense or don't connect to the messages previous to it then it should be considered low quality

CONVERSATION TO EVALUATE:
${conversationText}

Evaluate this conversation and respond with ONLY one word:
- "KEEP" if it's a high-quality, coherent conversation worth keeping for training
- "DISCARD" if it's low-quality, fragmented, or doesn't make sense as a standalone conversation

Response:`;

  try {
    const response = await callOpenAI(qualityPrompt);
    const decision = response.trim().toUpperCase();
    const duration = Date.now() - startTime;
    const result = decision === 'KEEP';
    
    const resultIcon = result ? '✅' : '❌';
    const resultText = result ? 'KEEP' : 'DISCARD';
    console.log(`    ${resultIcon} Validation complete: ${resultText} (${conversationType}) - ${duration}ms`);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`    ❌ Validation error: ${error.message} - ${duration}ms`);
    return false; // Discard on error to be safe
  }
}

// Function to analyze conversation and identify thread boundaries
async function analyzeConversationThreads(conversation) {
  const analysisStartTime = Date.now();
  const messages = conversation.messages.filter(m => m.role !== 'system');
  
  console.log(`🔍 Starting thread analysis for conversation with ${messages.length} messages...`);

  const prompt = `You are analyzing ChatML training data from a WhatsApp conversation between two people (user=Luan and assistant=Bruna). Your task is to separate mixed conversations into coherent threads and edit messages as needed to ensure each thread makes perfect sense for chatbot training.

IMPORTANT CONTEXT:
- Multiple conversation topics are mixed together
- Some messages may contain content from multiple threads that should be separated
- You should edit messages for temporal coherence (e.g., "I'm calling uber" and "I'm in the uber" in same message should be adjusted)
- Each output thread must be a complete, coherent conversation that makes sense on its own
- Messages that don't fit any coherent thread should be omitted

YOUR TASKS:
1. Identify distinct conversation threads by topic/context
2. For each thread, provide the COMPLETE conversation including the system message
3. Edit message content as needed to maintain coherence within each thread
4. Ensure temporal consistency (e.g., don't have "leaving now" and "arrived" in the same message)
5. Remove content that doesn't belong to the thread's topic
6. Cut out any messages that aren't connected to the previous messagesin the same conversation

EXAMPLES:

Example 1 - Simple thread separation with content editing:
Input conversation:
{"messages": [
  {"role": "system", "content": "You are Bruna, talking to your boyfriend Luan."},
  {"role": "assistant", "content": "Cheguei na depilação"},
  {"role": "user", "content": "Uhuuuuu"},
  {"role": "assistant", "content": "Agora só esperar\nQue chiqueeeeeeee"},
  {"role": "user", "content": "Que máximo isso\nNão vejo a hora de ter um dispositivo de som\nImagina uma automação pra casa"},
  {"role": "assistant", "content": "Depilação feita\nSiiim mt legal seria\nPerfeito"},
  {"role": "user", "content": "Aeeeee\nAcabouuu"},
  {"role": "assistant", "content": "Mt legal\nPedindo um uber\nEstou no uber\nIndo"},
  {"role": "user", "content": "Belê\nTo no aguardo"},
  {"role": "assistant", "content": "Faz um cafezinho aí"},
  {"role": "user", "content": "Faço"},
  {"role": "assistant", "content": "Chegueii\nAbre pra mim"}
]}

Response:
[
  {
    "messages": [
      {"role": "system", "content": "You are Bruna, talking to your boyfriend Luan."},
      {"role": "assistant", "content": "Cheguei na depilação"},
      {"role": "user", "content": "Uhuuuuu"},
      {"role": "assistant", "content": "Agora só esperar\nQue chiqueeeeeeee"},
      {"role": "user", "content": "Que máximo isso"},
      {"role": "assistant", "content": "Depilação feita"},
      {"role": "user", "content": "Aeeeee\nAcabouuu"},
      {"role": "assistant", "content": "Mt legal\nPedindo um uber"},
      {"role": "user", "content": "Belê\nTo no aguardo"},
      {"role": "assistant", "content": "Faz um cafezinho aí"},
      {"role": "user", "content": "Faço"},
      {"role": "assistant", "content": "Chegueii\nAbre pra mim"}
    ]
  },
  {
    "messages": [
      {"role": "system", "content": "You are Bruna, talking to your boyfriend Luan."},
      {"role": "user", "content": "Não vejo a hora de ter um dispositivo de som\nImagina uma automação pra casa"},
      {"role": "assistant", "content": "Siiim mt legal seria\nPerfeito"}
    ]
  }
]

Example 2 - Single coherent thread:
Input conversation:
{"messages": [
  {"role": "system", "content": "You are Bruna, talking to your boyfriend Luan."},
  {"role": "assistant", "content": "Já tô aqui na depilação\nAguardando"},
  {"role": "user", "content": "Arrasou"},
  {"role": "assistant", "content": "Feito\nAgr vou pegar um uber para ir pra casa\ntá mt quente gente"},
  {"role": "user", "content": "Boaa"},
  {"role": "assistant", "content": "Peguei o uber"}
]}

Response:
[
  {
    "messages": [
      {"role": "system", "content": "You are Bruna, talking to your boyfriend Luan."},
      {"role": "assistant", "content": "Já tô aqui na depilação\nAguardando"},
      {"role": "user", "content": "Arrasou"},
      {"role": "assistant", "content": "Feito\nAgr vou pegar um uber para ir pra casa\ntá mt quente gente"},
      {"role": "user", "content": "Boaa"},
      {"role": "assistant", "content": "Peguei o uber"}
    ]
  }
]

Example 3 - Merge assistant messages around trivial user interjection and simplify noisy openings:
Input conversation:
{"messages": [
  {"role": "system", "content": "You are Bruna, talking to your boyfriend Luan."},
  {"role": "assistant", "content": "Jdkskdkks\nFalso engano\nTA LOTADO\nQuase não tinha lugar para sentar\nMdsss\nPessoal n tem nd pra fazer né?\nTá maluco"},
  {"role": "user", "content": "Caralho\nVou pedir alguma coisa\nChegou a pegar ali a encomenda?"},
  {"role": "assistant", "content": "Não tinha ngm ali\nVou amanhã\nHuuum\nPede uma coisa pra mim 🥹"},
  {"role": "user", "content": "Que sabor vc quer?"},
  {"role": "assistant", "content": "Pode ser\nPega uma de costela pra mim\nNa real"},
  {"role": "user", "content": "Boa"},
  {"role": "assistant", "content": "Pega tudo de calabresa com cebola\nPq se não vem mt mirrada\nPode ser?"}
]}

Response:
[
  {
    "messages": [
      {"role": "system", "content": "You are Bruna, talking to your boyfriend Luan."},
      {"role": "assistant", "content": "TA LOTADO\nQuase não tinha lugar para sentar\nMdsss\nPessoal n tem nd pra fazer né?\nTá maluco"},
      {"role": "user", "content": "Caralho\nVou pedir alguma coisa\nChegou a pegar ali a encomenda?"},
      {"role": "assistant", "content": "Não tinha ngm ali\nVou amanhã\nHuuum\nPede uma coisa pra mim 🥹"},
      {"role": "user", "content": "Que sabor vc quer?"},
      {"role": "assistant", "content": "Pode ser. Na real, pega tudo de calabresa com cebola, pq se não vem mt mirrada. Pode ser?"}
    ]
  }
]

Example 4 - Drop trailing off-topic small talk:
Input conversation:
{"messages": [
  {"role": "system", "content": "You are Bruna, talking to your boyfriend Luan."},
  {"role": "assistant", "content": "Pensei nessa mesmo\n400 pila para tirar as estrias a sessão\nÉ caro, mas achei q seria mais"},
  {"role": "user", "content": "Quantas sessões precisa?"},
  {"role": "assistant", "content": "Ela falou q de 3 a 6, mas eu queria fazer 1 primeiro e ver como é! Eu acho q na 1 e 2 sessão já resolve pq as minhas estão mt vermelhas\nEla disse q consegue fazer 3 sessões para mim por 10 x 105\nDá até um desconto daí\nE é uma por mês"},
  {"role": "user", "content": "E qual é o tratamento? É bom?\nTop"},
  {"role": "assistant", "content": "Parece q sim, é um microagulhamento ali na região com um serum\nPelo q eu pesquisei é bem indicado\nMas vou pesquisar melhor"},
  {"role": "user", "content": "O valor ta razoável\nAchei bacana"},
  {"role": "assistant", "content": "Tb achei\nAcho q vale a pena\nPreciso só pensar um pouco mais\nVer o financeiro\nKkkk\nMas acho q esse ano vou fazer\nQueria fazer antes da viagem\nPara ir mais bonita\nMas não sei se vai dar"},
  {"role": "user", "content": "Bom almoço\nTambém to indo almoçar aqui\nAmo vc"},
  {"role": "assistant", "content": "Saudadeeee\n🥹🥹🥹🥹🥹\nHj vou parar na mãe dps do trabalho\nDar um abraço nela e ver como ela tá"}
]}

Response:
[
  {
    "messages": [
      {"role": "system", "content": "You are Bruna, talking to your boyfriend Luan."},
      {"role": "assistant", "content": "Pensei nessa mesmo\n400 pila para tirar as estrias a sessão\nÉ caro, mas achei q seria mais"},
      {"role": "user", "content": "Quantas sessões precisa?"},
      {"role": "assistant", "content": "Ela falou q de 3 a 6, mas eu queria fazer 1 primeiro e ver como é! Eu acho q na 1 e 2 sessão já resolve pq as minhas estão mt vermelhas\nEla disse q consegue fazer 3 sessões para mim por 10 x 105\nDá até um desconto daí\nE é uma por mês"},
      {"role": "user", "content": "E qual é o tratamento? É bom?\nTop"},
      {"role": "assistant", "content": "Parece q sim, é um microagulhamento ali na região com um serum\nPelo q eu pesquisei é bem indicado\nMas vou pesquisar melhor"},
      {"role": "user", "content": "O valor ta razoável\nAchei bacana"},
      {"role": "assistant", "content": "Tb achei\nAcho q vale a pena\nPreciso só pensar um pouco mais\nVer o financeiro\nKkkk\nMas acho q esse ano vou fazer\nQueria fazer antes da viagem\nPara ir mais bonita\nMas não sei se vai dar"}
    ]
  }
]

CONVERSATION TO ANALYZE:
${JSON.stringify(conversation, null, 2)}

INSTRUCTIONS:
- Always include the system message in each thread
- Edit message content to maintain thread coherence
- If a user interjection doesn't add information (e.g., "Boa", "Ok"), drop it and merge the assistant's messages around it
- Remove irrelevant parts of messages that don't belong to the thread
- Ensure temporal consistency within each thread
- A thread needs at least 2 non-system messages (one exchange)
- Focus on creating high-quality, coherent conversations for training

Respond with ONLY a JSON array of conversation objects, where each object has a "messages" array containing the complete thread.

JSON Response:`;

  try {
    console.log(`  🤖 Calling OpenAI GPT for thread analysis (${messages.length} messages)...`);
    const llmStartTime = Date.now();
    const response = await callOpenAI(prompt);
    const llmDuration = Date.now() - llmStartTime;
    console.log(`  🤖 OpenAI analysis complete - ${llmDuration}ms`);
    
    // Extract JSON array from response - look for array of conversation objects
    let parsedThreads;
    try {
      // Try to find and parse JSON array in the response
      const jsonMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (!jsonMatch) {
        console.warn('Could not find JSON array in OpenAI response, keeping original conversation');
        return [conversation];
      }
      
      parsedThreads = JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.warn(`Could not parse OpenAI response as JSON: ${error.message}, keeping original conversation`);
      return [conversation];
    }
    
    // Validate the response
    if (!Array.isArray(parsedThreads) || parsedThreads.length === 0) {
      console.warn('Invalid thread array, keeping original conversation');
      return [conversation];
    }

    console.log(`  📊 OpenAI returned ${parsedThreads.length} potential thread(s)`);

    const separatedConversations = [];

    for (let i = 0; i < parsedThreads.length; i++) {
      const threadData = parsedThreads[i];
      
      // Validate thread structure
      if (!threadData || !threadData.messages || !Array.isArray(threadData.messages)) {
        console.log(`  ⚠️  Skipping invalid thread ${i + 1}: Missing or invalid messages array`);
        continue;
      }

      const threadMessages = threadData.messages;
      console.log(`  🧵 Processing thread ${i + 1} with ${threadMessages.length} messages`);

      // Validate thread has minimum required messages and proper structure
      const nonSystemMessages = threadMessages.filter(m => m.role !== 'system');
      if (nonSystemMessages.length < options.minExchangesPerConversation) {
        console.log(`  ❌ Thread ${i + 1} rejected: Too few messages (${nonSystemMessages.length})`);
        continue;
      }

      if (!threadMessages.some(m => m.role === 'user') || !threadMessages.some(m => m.role === 'assistant')) {
        console.log(`  ❌ Thread ${i + 1} rejected: Missing user or assistant messages`);
        continue;
      }

      // Ensure system message is present (add if missing)
      const hasSystemMessage = threadMessages.some(m => m.role === 'system');
      if (!hasSystemMessage) {
        const originalSystemMessage = conversation.messages.find(m => m.role === 'system');
        if (originalSystemMessage) {
          threadMessages.unshift(originalSystemMessage);
          console.log(`  🔧 Added missing system message to thread ${i + 1}`);
        }
      }

      const candidateConversation = {
        messages: threadMessages,
        id: generateId()
      };
      
      // Validate quality before adding
      const isHighQuality = await validateConversationQuality(candidateConversation, 'thread-separated');
      if (isHighQuality) {
        separatedConversations.push(candidateConversation);
        const userCount = threadMessages.filter(m => m.role === 'user').length;
        const assistantCount = threadMessages.filter(m => m.role === 'assistant').length;
        console.log(`  ✅ Thread ${i + 1} accepted: ${threadMessages.length} total messages (${userCount} user, ${assistantCount} assistant)`);
      } else {
        console.log(`  ❌ Thread ${i + 1} rejected: Quality validation failed`);
      }
    }

    // Log the final outcome
    if (separatedConversations.length > 1) {
      console.log(`  🎯 SUCCESS: Extracted ${separatedConversations.length} high-quality threads from original conversation`);
      return separatedConversations;
    } else if (separatedConversations.length === 1) {
      console.log(`  📝 Single thread extracted, but checking if original is better...`);
    } else {
      console.log(`  ⚠️  No high-quality threads extracted, validating original conversation...`);
    }

    // If no high-quality threads were extracted, validate the original conversation
    if (separatedConversations.length === 0) {
      console.log(`  🔄 Validating original conversation as fallback...`);
      const isOriginalHighQuality = await validateConversationQuality(conversation, 'original');
      if (isOriginalHighQuality) {
        console.log(`  ✅ KEEPING original conversation (no better threads found)`);
        return [conversation];
      } else {
        console.log(`  ❌ DISCARDING original conversation (low quality)`);
        return [];
      }
    }

    return separatedConversations;

  } catch (error) {
    console.error(`Error analyzing conversation: ${error.message}`);
    return [conversation]; // Return original on error
  } finally {
    const analysisEndTime = Date.now();
    const analysisDuration = analysisEndTime - analysisStartTime;
    console.log(`🔍 Thread analysis complete for this conversation. Total duration: ${analysisDuration}ms`);
  }
}

// Function to append results to output file as they're processed
function appendToOutputFile(conversations, outputFile) {
  const lines = conversations.map(conv => JSON.stringify(conv)).join('\n');
  if (lines) {
    fs.appendFileSync(outputFile, lines + '\n');
  }
}

// Function to process conversations in batches and write progressively
async function processConversations(conversations, outputFile) {
  const batchSize = parseInt(options.batchSize);
  let totalProcessed = 0;
  let totalGenerated = 0;
  let totalDiscarded = 0;
  
  console.log(`Processing ${conversations.length} conversations in batches of ${batchSize}...`);
  console.log(`Results will be written progressively to: ${outputFile}`);
  console.log(`Quality filtering is enabled - low-quality conversations will be discarded\n`);
  
  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(conversations.length / batchSize);
    
    console.log(`Processing batch ${batchNum}/${totalBatches}...`);
    
    // Process batch in parallel
    const batchPromises = batch.map(async (conv, index) => {
      const convIndex = i + index + 1;
      try {
        const separated = await analyzeConversationThreads(conv);
        const kept = separated.length;
        const discarded = separated.length === 0 ? 1 : 0; // If no threads kept, original was discarded
        
        if (kept > 0) {
          console.log(`  ✓ Conversation ${convIndex}: ${kept} high-quality threads kept`);
          // Write results immediately to file
          appendToOutputFile(separated, outputFile);
        } else {
          console.log(`  ✗ Conversation ${convIndex}: discarded (low quality)`);
        }
        
        return { kept, discarded };
      } catch (error) {
        console.error(`  ✗ Error processing conversation ${convIndex}: ${error.message}`);
        // Don't write anything on error - let it be discarded
        return { kept: 0, discarded: 1 };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    const batchKept = batchResults.reduce((sum, result) => sum + result.kept, 0);
    const batchDiscarded = batchResults.reduce((sum, result) => sum + result.discarded, 0);
    
    totalProcessed += batch.length;
    totalGenerated += batchKept;
    totalDiscarded += batchDiscarded;
    
    console.log(`  Batch complete: ${batchKept} kept, ${batchDiscarded} discarded from ${batch.length} originals`);
    console.log(`  Total progress: ${totalProcessed}/${conversations.length} processed, ${totalGenerated} kept, ${totalDiscarded} discarded\n`);
    
    // Small delay between batches to avoid overwhelming the API
    if (i + batchSize < conversations.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return { totalGenerated, totalDiscarded };
}

// Main execution
async function main() {
  try {
    // Read input file
    console.log(`Reading input file: ${options.input}`);
    const inputContent = fs.readFileSync(options.input, 'utf8');
    const inputLines = inputContent.trim().split('\n').filter(line => line.trim());
    
    console.log(`Found ${inputLines.length} total lines in input file`);
    
    // Filter lines by character length before parsing
    const longEnoughLines = inputLines.filter(line => line.length >= parseInt(options.minChars));
    const filteredOutCount = inputLines.length - longEnoughLines.length;
    
    console.log(`Filtered out ${filteredOutCount} lines with less than ${options.minChars} characters`);
    console.log(`Will process ${longEnoughLines.length} conversations (${((longEnoughLines.length / inputLines.length) * 100).toFixed(1)}% of original)`);
    
    // Parse JSONL
    const conversations = longEnoughLines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        console.error(`Error parsing line ${index + 1}: ${error.message}`);
        return null;
      }
    }).filter(conv => conv !== null);
    
    console.log(`Successfully parsed ${conversations.length} conversations for processing`);
    
    // Test OpenAI connection
    console.log('Testing OpenAI connection...');
    try {
      await callOpenAI('Test connection. Respond with "OK".');
      console.log('OpenAI connection successful');
    } catch (error) {
      console.error('Failed to connect to OpenAI. Please check your API key and internet connection.');
      process.exit(1);
    }
    
    // Create/clear the output file
    fs.writeFileSync(options.output, ''); // Create empty file
    console.log(`Created output file: ${options.output}`);
    
    // Process conversations and write progressively
    const { totalGenerated, totalDiscarded } = await processConversations(conversations, options.output);
    
    console.log(`Success! Processed ${conversations.length} original conversations:`);
    console.log(`✓ ${totalGenerated} high-quality conversations kept`);
    console.log(`✗ ${totalDiscarded} low-quality conversations discarded`);
    console.log(`Quality ratio: ${((totalGenerated / conversations.length) * 100).toFixed(1)}% of original data kept`);
    console.log(`Improvement ratio: ${(totalGenerated / (conversations.length - totalDiscarded)).toFixed(2)}x more conversations from kept data`);
    console.log(`\nYou can monitor progress by checking the output file:`);
    console.log(`tail -f ${options.output}`);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Check if we're running as main module
if (require.main === module) {
  main();
}

module.exports = { analyzeConversationThreads, callOpenAI }; 