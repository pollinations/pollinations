#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { faker } from '@faker-js/faker';
import { program } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import { pipeline } from '@xenova/transformers';
import { fileURLToPath } from 'url';

// Get the directory name correctly in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache the embedding model
let embeddingModel = null;

// Function to get or initialize the embedding model
async function getEmbeddingModel() {
  if (!embeddingModel) {
    console.log('Loading embedding model...');
    embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Embedding model loaded successfully');
  }
  return embeddingModel;
}

// Function to generate embedding for text
async function generateEmbedding(text) {
  if (!text) return [];
  
  try {
    const model = await getEmbeddingModel();
    const output = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error('Error generating embedding:', error);
    return [];
  }
}

// Organization, project, and user structure
const organizations = {
  'acme_corp': {
    projects: ['marketplace', 'logistics', 'payments'],
    userCount: faker.number.int({ min: 1000, max: 100000 }),
    userPrefix: 'acme'
  },
  'tech_dynamics': {
    projects: ['mobile_app', 'web_platform', 'analytics'],
    userCount: faker.number.int({ min: 1000, max: 100000 }),
    userPrefix: 'tdyn'
  },
  'quantum_systems': {
    projects: ['quantum_sim', 'research_lab', 'cloud_compute'],
    userCount: faker.number.int({ min: 1000, max: 100000 }),
    userPrefix: 'qsys'
  },
  'data_pioneers': {
    projects: ['data_lake', 'ml_platform', 'bi_tools'],
    userCount: faker.number.int({ min: 1000, max: 100000 }),
    userPrefix: 'dpio'
  },
  'future_retail': {
    projects: ['pos_system', 'inventory', 'customer_portal'],
    userCount: faker.number.int({ min: 1000, max: 100000 }),
    userPrefix: 'fret'
  }
};

const environments = ['production', 'staging', 'development'];

// Generate a realistic username for an organization
function generateUsername(org) {
  const prefix = organizations[org].userPrefix;
  const userId = faker.number.int({ min: 1, max: organizations[org].userCount });
  const userName = faker.internet.username().toLowerCase();
//   return `${prefix}_${userName}_${userId}`;
  return userName;
}

// Helper function to get a random organization and one of its projects
function getRandomOrgAndProject() {
  const org = faker.helpers.arrayElement(Object.keys(organizations));
  const project = faker.helpers.arrayElement(organizations[org].projects);
  return { org, project };
}

// Parse command line arguments
program
  .option('--start-date <date>', 'Start date (YYYY-MM-DD)', '2024-01-01')
  .option('--end-date <date>', 'End date (YYYY-MM-DD)', '2024-01-31')
  .option('--events-per-day <number>', 'Number of events per day', '100')
  .option('--output <path>', 'Output file path', 'llm_events.ndjson')
  .parse(process.argv);

const options = program.opts();

// Store active chat sessions
let activeChatSessions = new Map(); // chatId -> { userId, messagesLeft }

function getOrCreateChatSession(timestamp) {
  // Clean up old sessions (older than 1 hour)
  const hourAgo = new Date(timestamp.getTime() - 60 * 60 * 1000);
  for (const [chatId, session] of activeChatSessions.entries()) {
    if (session.lastActivity < hourAgo) {
      activeChatSessions.delete(chatId);
    }
  }
  
  // 70% chance to create a new chat session
  if (activeChatSessions.size === 0 || faker.datatype.boolean(0.7)) {
    const chatId = `chat_${uuidv4()}`;
    const { org, project } = getRandomOrgAndProject();
    const userId = generateUsername(org);
    const environment = faker.helpers.arrayElement(environments);
    
    activeChatSessions.set(chatId, {
      userId,
      org,
      project,
      environment,
      messagesLeft: faker.number.int({ min: 1, max: 5 }), // Random number of messages in this chat
      lastActivity: timestamp
    });
    return { chatId, userId, org, project, environment, isNew: true };
  }
  
  // Select a random active session
  const activeChatIds = Array.from(activeChatSessions.keys());
  const selectedChatId = faker.helpers.arrayElement(activeChatIds);
  const session = activeChatSessions.get(selectedChatId);
  
  // Update session
  session.lastActivity = timestamp;
  session.messagesLeft--;
  
  // Remove session if no messages left
  if (session.messagesLeft <= 0) {
    activeChatSessions.delete(selectedChatId);
  } else {
    activeChatSessions.set(selectedChatId, session);
  }
  
  return { 
    chatId: selectedChatId, 
    userId: session.userId, 
    org: session.org,
    project: session.project,
    environment: session.environment,
    isNew: false 
  };
}

// Helper functions
function randomHex(length = 8) {
  return faker.string.hexadecimal({ length, prefix: '' }).toLowerCase();
}

// Generate fake tracebacks for different error types
function generateTraceback(errorType) {
  if (!errorType) return '';
  
  const tracebackTemplates = {
    'RateLimitError': `Traceback (most recent call last):
  File "/usr/local/lib/python3.9/site-packages/openai/api_requestor.py", line 628, in _handle_error_response
    raise self._make_status_error_from_response(err_resp) from None
openai.error.RateLimitError: Rate limit reached for ${faker.helpers.arrayElement(['gpt-4', 'gpt-3.5-turbo'])} in organization org-${randomHex(10)} on tokens per min. Limit: 90000 / min. Current: 91200 / min.`,
    
    'Timeout': `Traceback (most recent call last):
  File "/usr/local/lib/python3.9/site-packages/httpx/_client.py", line 1551, in _send_single_request
    resp = self._transport.handle_request(request)
  File "/usr/local/lib/python3.9/site-packages/httpx/_transports/default.py", line 76, in handle_request
    resp = self._pool.handle_request(request)
  File "/usr/local/lib/python3.9/site-packages/httpcore/_sync/connection_pool.py", line 253, in handle_request
    raise exc from None
httpcore.ConnectTimeout: Connect timeout occurred while connecting to ${faker.internet.ip()}:443`,
    
    'AuthenticationError': `Traceback (most recent call last):
  File "/usr/local/lib/python3.9/site-packages/openai/api_requestor.py", line 628, in _handle_error_response
    raise self._make_status_error_from_response(err_resp) from None
openai.error.AuthenticationError: Incorrect API key provided: sk-${randomHex(16)}. You can find your API key at https://platform.openai.com/account/api-keys.`
  };
  
  return tracebackTemplates[errorType] || `Traceback (most recent call last):
  File "/app/llm_service.py", line 142, in process_request
    response = await client.chat.completions.create(**params)
  File "/usr/local/lib/python3.9/site-packages/openai/resources/chat/completions.py", line 98, in create
    return await self._post("chat/completions", body=body, options=options)
  File "/usr/local/lib/python3.9/site-packages/openai/_base_client.py", line 1015, in _post
    return await self._request(
  File "/usr/local/lib/python3.9/site-packages/openai/_base_client.py", line 834, in _request
    raise error
${errorType}: An unexpected error occurred during the API request.`;
}

async function generateLlmEvent(timestamp, forceError = false) {
  // Get or create chat session
  const { chatId, userId, org, project, environment, isNew } = getOrCreateChatSession(timestamp);
  
  // Basic metadata
  const messageId = `msg_${uuidv4()}`;
  
  // Model and provider
  const provider = faker.helpers.arrayElement(['openai', 'anthropic']);
  const model = provider === 'openai' 
    ? faker.helpers.arrayElement(['gpt-4', 'gpt-3.5-turbo']) 
    : faker.helpers.arrayElement(['claude-3-opus', 'claude-3-sonnet']);
  
  // Token usage
  const promptTokens = faker.number.int({ min: 50, max: 500 });
  const completionTokens = faker.number.int({ min: 100, max: 1000 });
  const totalTokens = promptTokens + completionTokens;
  
  // Performance metrics
  const duration = faker.number.float({ min: 0.1, max: 5.0, multipleOf: 0.001 });
  const llmApiDurationMs = duration * 1000;
  const responseTime = faker.number.float({ min: 0.01, max: 0.1, multipleOf: 0.001 });
  
  // Cost calculation (simplified)
  let cost;
  if (model === 'gpt-4') {
    cost = (promptTokens * 0.00003) + (completionTokens * 0.00006);
  } else if (model === 'gpt-3.5-turbo') {
    cost = (promptTokens * 0.000001) + (completionTokens * 0.000002);
  } else if (model === 'claude-3-opus') {
    cost = (promptTokens * 0.00003) + (completionTokens * 0.00006);
  } else { // claude-3-sonnet
    cost = (promptTokens * 0.000015) + (completionTokens * 0.00003);
  }
  
  // Status and other flags
  const status = forceError ? 'error' : faker.helpers.arrayElement(['success', 'error'], [0.9, 0.1]);
  const stream = faker.datatype.boolean();
  const callType = faker.helpers.arrayElement(['chat', 'completion']);
  
  // Exception handling
  let exception = '';
  let traceback = '';
  
  if (status === 'error') {
    exception = faker.helpers.arrayElement(['RateLimitError', 'Timeout', 'AuthenticationError', 'ServiceUnavailableError']);
    traceback = generateTraceback(exception);
  }
  
  // Cache hit should be false if there's an exception
  const cacheHit = exception ? false : faker.datatype.boolean();
  
  // Calculate end time (adding duration to start time)
  const endTime = new Date(timestamp);
  endTime.setSeconds(endTime.getSeconds() + duration);
  
  // Response ID and object
  const responseId = `res_${faker.number.int({ min: 1, max: 10000 })}`;
  
  // Generate messages array based on whether this is a new chat or continuation
  const messages = [];
  
  if (isNew) {
    // New chat might have a system message
    if (faker.datatype.boolean()) {
      messages.push({
        role: "system",
        content: faker.helpers.arrayElement([
          "You are a helpful assistant.",
          "You are an AI assistant that helps with programming questions.",
          "You are a data analysis expert who provides clear, concise explanations.",
          "You are a creative writing assistant who helps with generating ideas and refining text.",
          "You are a knowledgeable assistant who provides factual information and cites sources when possible."
        ])
      });
    }
  }
  
  // Add user message
  const userPrompt = faker.helpers.arrayElement([
    "Tell me about machine learning",
    "How do I optimize my React application?",
    "What's the best way to learn Python?",
    "Explain quantum computing in simple terms",
    "Write a short poem about technology",
    "What are the key differences between SQL and NoSQL databases?",
    "How can I improve my website's SEO?",
    "Explain the concept of blockchain in simple terms",
    "What are some effective time management techniques?",
    "How does climate change affect biodiversity?",
    "What are the main features of TypeScript compared to JavaScript?",
    "Can you explain how CRISPR gene editing works?",
    "What are the best practices for API design?",
    "How do neural networks learn?",
    "What's the difference between supervised and unsupervised learning?",
    "How can I set up a CI/CD pipeline for my project?",
    "What are the principles of responsive web design?",
    "Explain the concept of microservices architecture",
    "What are some effective strategies for data visualization?",
    "How do I implement authentication in a web application?"
  ]);
  
  messages.push({
    role: "user",
    content: userPrompt
  });
  
  // Generate assistant response content based on the prompt
  let assistantResponse = "";
  if (userPrompt.includes("machine learning")) {
    assistantResponse = "Machine learning is a branch of artificial intelligence that focuses on building systems that learn from data. It uses statistical techniques to enable computers to improve at tasks with experience. The most common types include supervised learning, unsupervised learning, and reinforcement learning.";
  } else if (userPrompt.includes("React")) {
    assistantResponse = "To optimize your React application, consider: 1) Using React.memo for component memoization, 2) Implementing code splitting with React.lazy, 3) Virtualizing long lists with react-window, 4) Using the production build, and 5) Employing proper state management techniques.";
  } else if (userPrompt.includes("Python")) {
    assistantResponse = "The best way to learn Python is through a combination of structured courses and practical projects. Start with basics from resources like Codecademy or Python.org, then build small projects that interest you. Practice regularly, join communities like Stack Overflow or Reddit's r/learnpython, and consider contributing to open source.";
  } else if (userPrompt.includes("quantum computing")) {
    assistantResponse = "Quantum computing uses quantum mechanics principles to process information. While classical computers use bits (0 or 1), quantum computers use quantum bits or 'qubits' that can exist in multiple states simultaneously through superposition. This allows them to solve certain complex problems much faster than classical computers.";
  } else if (userPrompt.includes("poem")) {
    assistantResponse = "Silicon dreams in digital light,\nCode weaves patterns through the night.\nConnections span across the earth,\nInnovation gives new ideas birth.\nTechnology's pulse, humanity's art,\nBridging futures, never apart.";
  } else if (userPrompt.includes("SQL and NoSQL")) {
    assistantResponse = "SQL databases are relational, using structured tables with predefined schemas and SQL for queries. They excel at complex queries and maintaining data integrity through ACID properties. NoSQL databases are non-relational with flexible schemas, designed for specific data models (document, key-value, wide-column, graph). They prioritize scalability and performance over consistency, following the BASE model instead of ACID.";
  } else if (userPrompt.includes("SEO")) {
    assistantResponse = "To improve your website's SEO: 1) Research and use relevant keywords, 2) Create high-quality, original content, 3) Optimize meta tags and descriptions, 4) Ensure mobile-friendliness and fast loading times, 5) Build quality backlinks, 6) Use semantic HTML and proper heading structure, 7) Create an XML sitemap, 8) Register with Google Search Console and Analytics to track performance.";
  } else if (userPrompt.includes("blockchain")) {
    assistantResponse = "Blockchain is a distributed digital ledger technology that records transactions across many computers. Each 'block' contains transaction data and a cryptographic hash of the previous block, creating a chain that's extremely difficult to alter. This design makes blockchain secure, transparent, and resistant to modification, making it useful for cryptocurrencies, smart contracts, supply chain tracking, and more.";
  } else if (userPrompt.includes("time management")) {
    assistantResponse = "Effective time management techniques include: 1) Prioritizing tasks using methods like the Eisenhower Matrix, 2) Time-blocking your calendar, 3) Setting SMART goals, 4) Using the Pomodoro Technique (25-minute focused work periods with short breaks), 5) Minimizing multitasking, 6) Delegating when possible, 7) Using productivity tools and apps, 8) Regular planning and reviewing of goals and progress.";
  } else if (userPrompt.includes("climate change")) {
    assistantResponse = "Climate change affects biodiversity through multiple pathways: 1) Habitat loss as ecosystems shift or disappear, 2) Phenological mismatches where life cycle events become desynchronized, 3) Range shifts as species move to more suitable areas, 4) Increased extinction risk for species that cannot adapt quickly enough, 5) Ocean acidification harming marine organisms, 6) More frequent extreme weather events disrupting ecosystems, and 7) Changes in species interactions and community structures.";
  } else if (userPrompt.includes("TypeScript")) {
    assistantResponse = "TypeScript adds several features to JavaScript: 1) Static typing with type annotations, interfaces, and generics, 2) Early error detection during development rather than runtime, 3) Better IDE support with improved autocompletion and refactoring tools, 4) Object-oriented programming features like classes, interfaces, and access modifiers, 5) Enhanced code organization through namespaces and modules, 6) Compatibility with existing JavaScript code, and 7) Transpilation to different JavaScript versions.";
  } else if (userPrompt.includes("CRISPR")) {
    assistantResponse = "CRISPR gene editing works by using a guide RNA to direct the Cas9 enzyme (a molecular 'scissors') to a specific DNA sequence. Once there, Cas9 cuts both strands of DNA at the target location. The cell then repairs this break, either by joining the cut ends (which can disable a gene) or by inserting new DNA provided during the editing process. This technology allows scientists to add, remove, or alter genetic material with unprecedented precision and efficiency.";
  } else if (userPrompt.includes("API design")) {
    assistantResponse = "Best practices for API design include: 1) Using RESTful principles with appropriate HTTP methods, 2) Implementing consistent naming conventions and URL structures, 3) Providing comprehensive documentation with examples, 4) Using proper HTTP status codes, 5) Implementing versioning to manage changes, 6) Including pagination for large data sets, 7) Ensuring proper error handling with informative messages, 8) Implementing authentication and rate limiting, and 9) Making the API stateless for better scalability.";
  } else if (userPrompt.includes("neural networks")) {
    assistantResponse = "Neural networks learn through a process called backpropagation. First, input data passes through the network, producing an output (forward pass). This output is compared to the desired output, calculating an error. Then, the algorithm works backward, adjusting each connection weight proportionally to its contribution to the error (backward pass). This process repeats with many examples, gradually minimizing the error function and improving the network's predictions through gradient descent.";
  } else if (userPrompt.includes("supervised and unsupervised")) {
    assistantResponse = "In supervised learning, algorithms are trained on labeled data, learning to map inputs to known outputs (like classifying images or predicting values). The algorithm receives feedback on its accuracy during training. In unsupervised learning, algorithms work with unlabeled data, identifying patterns and structures without predefined outputs. Common unsupervised tasks include clustering, dimensionality reduction, and anomaly detection. Semi-supervised learning combines both approaches, using some labeled and some unlabeled data.";
  } else if (userPrompt.includes("CI/CD")) {
    assistantResponse = "To set up a CI/CD pipeline: 1) Choose a version control system like Git, 2) Select a CI/CD tool (Jenkins, GitHub Actions, GitLab CI, etc.), 3) Create a configuration file defining your pipeline stages, 4) Set up automated testing (unit, integration, end-to-end), 5) Configure build processes for your application, 6) Implement automated deployment to staging/production environments, 7) Add monitoring and rollback capabilities, and 8) Integrate security scanning tools. Start simple and gradually enhance your pipeline as needed.";
  } else if (userPrompt.includes("responsive web design")) {
    assistantResponse = "Principles of responsive web design include: 1) Fluid grid layouts that use relative units (%, em, rem) instead of fixed pixels, 2) Flexible images and media that scale with their containers, 3) Media queries to apply different styles based on device characteristics, 4) Mobile-first approach, designing for small screens first then enhancing for larger ones, 5) Touchscreen-friendly navigation and interaction elements, 6) Performance optimization for various network conditions, and 7) Testing across multiple devices and browsers.";
  } else if (userPrompt.includes("microservices")) {
    assistantResponse = "Microservices architecture breaks applications into small, independent services that each handle a specific business function. These services communicate via APIs, can be developed and deployed independently, and often use different technologies best suited to their function. Benefits include improved scalability, resilience, and development agility. Challenges include increased operational complexity, distributed system issues, and potential performance overhead from service communication.";
  } else if (userPrompt.includes("data visualization")) {
    assistantResponse = "Effective data visualization strategies include: 1) Choosing the right chart type for your data and message, 2) Minimizing chart junk and maximizing data-ink ratio, 3) Using color purposefully to highlight important information, 4) Providing clear titles, labels, and legends, 5) Maintaining consistent scales and avoiding misleading representations, 6) Making visualizations interactive when appropriate, 7) Considering accessibility for all users, and 8) Telling a coherent story with your data rather than just displaying numbers.";
  } else if (userPrompt.includes("authentication")) {
    assistantResponse = "To implement authentication in a web application: 1) Choose an authentication method (session-based, JWT, OAuth, etc.), 2) Use HTTPS to secure all authentication traffic, 3) Implement secure password storage with hashing and salting, 4) Create login/registration endpoints with proper validation, 5) Set up protected routes/middleware to verify authentication, 6) Implement features like password reset and account recovery, 7) Consider multi-factor authentication for enhanced security, and 8) Use existing authentication libraries rather than building from scratch when possible.";
  } else {
    assistantResponse = "Thank you for your question. To provide a comprehensive answer, I'd need to research this topic further. Could you provide more specific details about what you're looking to learn? This would help me give you the most relevant and accurate information.";
  }
  
  // Add assistant message for successful responses
  if (status === 'success') {
    messages.push({
      role: "assistant",
      content: assistantResponse
    });
  }
  
  // Sample choices for the response with realistic content
  const choices = status === 'success' ? [
    {
      index: 0,
      message: {
        role: "assistant",
        content: assistantResponse
      },
      finish_reason: faker.helpers.arrayElement(["stop", "length", "content_filter"])
    }
  ] : [];
  
  // For OpenAI format, add logprobs if it's a completion
  if (provider === 'openai' && callType === 'completion' && status === 'success') {
    choices[0].logprobs = null;
  }
  
  // For chat completions, sometimes add a function call
  if (provider === 'openai' && callType === 'chat' && status === 'success' && faker.datatype.boolean(0.2)) {
    choices[0].message.function_call = {
      name: "get_weather",
      arguments: JSON.stringify({
        location: faker.location.city(),
        unit: "celsius"
      })
    };
    choices[0].finish_reason = "function_call";
  }
  
  // Generate the event with proper nesting
  const event = {
    start_time: timestamp.toISOString().replace('T', ' ').substring(0, 19),
    proxy_metadata: {
      organization: org,
      project: project,
      environment: environment,
      chat_id: chatId
    },
    user: userId,
    message_id: messageId,
    model: model,
    response: {
      id: responseId,
      object: 'chat.completion',
      created: Math.floor(timestamp.getTime() / 1000),
      model: model,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens
      },
      choices: choices
    },
    standard_logging_object_response_time: responseTime,
    duration: duration,
    cost: cost,
    exception: exception,
    traceback: traceback,
    standard_logging_object_status: status,
    messages: messages,
    provider: provider,
    llm_api_duration_ms: llmApiDurationMs,
    end_time: endTime.toISOString().replace('T', ' ').substring(0, 19),
    id: `id_${faker.number.int({ min: 1, max: 10000 })}`,
    stream: stream,
    call_type: callType,
    api_key: `sk-${randomHex(16)}`,
    log_event_type: 'llm',
    cache_hit: cacheHit
  };
  
  // Add embedding to the event
  const textForEmbedding = status === 'error' ? userPrompt : `${userPrompt} ${assistantResponse}`;
  const embedding = await generateEmbedding(textForEmbedding);
  event.embedding = embedding;
  
  return event;
}

function generateSpikePeriods(startDate, endDate) {
  const spikes = [];
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  
  // Generate 2-4 spikes per week
  const totalWeeks = Math.ceil((endTime - startTime) / (7 * 24 * 60 * 60 * 1000));
  const totalSpikes = totalWeeks * faker.number.int({ min: 2, max: 4 });
  
  for (let i = 0; i < totalSpikes; i++) {
    // Random timestamp within the range
    const spikeStart = new Date(faker.number.int({ 
      min: startTime,
      max: endTime - (60 * 60 * 1000) // Ensure at least 1 hour before end
    }));
    
    // Duration between 5 minutes and 1 hour
    const durationMinutes = faker.helpers.arrayElement([5, 15, 30, 60]);
    const spikeEnd = new Date(spikeStart.getTime() + (durationMinutes * 60 * 1000));
    
    spikes.push({
      start: spikeStart,
      end: spikeEnd,
      type: faker.helpers.arrayElement(['traffic', 'error']),
      multiplier: faker.number.int({ min: 3, max: 5 }), // Traffic spikes are 3-5x normal
      errorRate: faker.number.float({ min: 0.4, max: 0.7 }) // Error spikes have 40-70% error rate
    });
  }
  
  return spikes.sort((a, b) => a.start.getTime() - b.start.getTime());
}

async function generateEvents(startDate, endDate, eventsPerDay) {
  const events = [];
  const currentDate = new Date(startDate);
  const endDateObj = new Date(endDate);
  
  // Calculate total days for progress reporting
  const totalDays = Math.ceil((endDateObj - currentDate) / (24 * 60 * 60 * 1000)) + 1;
  let currentDay = 1;
  let totalEventsGenerated = 0;
  
  console.log(`Starting event generation for ${totalDays} days from ${startDate} to ${endDate}`);
  console.log('Loading embedding model...');
  await getEmbeddingModel();
  console.log('Embedding model loaded successfully');
  
  // Generate random spike periods
  const spikePeriods = generateSpikePeriods(startDate, endDate);
  console.log('Generated spike periods:', spikePeriods.map(spike => ({
    type: spike.type,
    start: spike.start.toISOString(),
    end: spike.end.toISOString(),
    duration: `${(spike.end - spike.start) / (60 * 1000)} minutes`
  })));
  
  while (currentDate <= endDateObj) {
    const dateString = currentDate.toISOString().split('T')[0];
    console.log(`Processing day ${currentDay}/${totalDays}: ${dateString}`);
    
    // Determine number of events for this day based on day of week
    const dayOfWeek = currentDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Base multiplier: weekends have 40% of weekday traffic
    let dayMultiplier = isWeekend ? 0.4 : 1.0;
    
    // Calculate actual events for this day
    const dailyEvents = Math.round(eventsPerDay * dayMultiplier);
    console.log(`  Generating ${dailyEvents} events for ${isWeekend ? 'weekend' : 'weekday'} day`);
    
    // Generate random events for this day
    let dayEventsGenerated = 0;
    
    for (let i = 0; i < dailyEvents; i++) {
      // Random time within the current day, with business hour weighting
      const timestamp = new Date(currentDate);
      
      // Business hours (9-17) have more events
      let hour;
      if (isWeekend) {
        // Weekend hours are more evenly distributed
        hour = faker.number.int({ min: 0, max: 23 });
      } else {
        // Weekday hours - 70% chance of business hours
        const isBusinessHours = faker.datatype.boolean(0.7);
        if (isBusinessHours) {
          hour = faker.number.int({ min: 9, max: 17 });
        } else {
          // Early morning or evening
          hour = faker.helpers.arrayElement([
            faker.number.int({ min: 0, max: 8 }),
            faker.number.int({ min: 18, max: 23 })
          ]);
        }
      }
      
      timestamp.setHours(hour);
      timestamp.setMinutes(faker.number.int({ min: 0, max: 59 }));
      timestamp.setSeconds(faker.number.int({ min: 0, max: 59 }));
      
      // Check if this timestamp falls within a spike period
      const spike = spikePeriods.find(s => 
        timestamp >= s.start && timestamp <= s.end
      );
      
      // Adjust event generation based on spike type
      if (spike) {
        if (spike.type === 'traffic') {
          // Generate multiple events for this timestamp
          for (let j = 0; j < spike.multiplier; j++) {
            const event = await generateLlmEvent(timestamp, false);
            events.push(event);
            dayEventsGenerated++;
            totalEventsGenerated++;
          }
          continue;
        } else if (spike.type === 'error') {
          // Force error based on spike error rate
          const forceError = faker.datatype.boolean(spike.errorRate);
          const event = await generateLlmEvent(timestamp, forceError);
          events.push(event);
          dayEventsGenerated++;
          totalEventsGenerated++;
          continue;
        }
      }
      
      // Normal event generation
      const event = await generateLlmEvent(timestamp, false);
      events.push(event);
      dayEventsGenerated++;
      totalEventsGenerated++;
    }
    
    console.log(`  Completed day ${currentDay}/${totalDays}: Generated ${dayEventsGenerated} events`);
    console.log(`  Total events so far: ${totalEventsGenerated}`);
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
    currentDay++;
  }
  
  console.log(`Event generation complete. Total events: ${totalEventsGenerated}`);
  
  // Sort events by timestamp
  console.log('Sorting events by timestamp...');
  events.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  
  return events;
}

function saveToNdjson(events, outputFile) {
  const outputPath = path.resolve(outputFile);
  const outputDir = path.dirname(outputPath);
  
  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write events to file
  const ndjson = events.map(event => JSON.stringify(event)).join('\n');
  fs.writeFileSync(outputPath, ndjson);
}

// Main execution
async function main() {
  const startDate = options.startDate;
  const endDate = options.endDate;
  const eventsPerDay = parseInt(options.eventsPerDay, 10);
  const outputFile = options.output;
  
  console.log(`Generating LLM events from ${startDate} to ${endDate}...`);
  
  const events = await generateEvents(startDate, endDate, eventsPerDay);
  
  saveToNdjson(events, outputFile);
  console.log(`Generated ${events.length} events and saved to ${outputFile}`);
}

await main();