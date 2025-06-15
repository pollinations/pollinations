# OptiLLM Integration for Pollinations

This directory contains the OptiLLM integration setup for enhancing LLM inference with optimization techniques like Mixture of Agents (MOA), Best of N (BON), and other advanced approaches.

## 🎯 What is OptiLLM?

OptiLLM is an OpenAI API compatible optimizing inference proxy that implements several state-of-the-art techniques to improve accuracy and performance of LLMs:

- **MOA (Mixture of Agents)**: Uses multiple models to generate better responses
- **BON (Best of N)**: Generates multiple completions and selects the best one
- **Chain of Thought**: Enhanced reasoning capabilities
- **Self-consistency**: Multiple reasoning paths for better accuracy
- **MCTS**: Monte Carlo Tree Search for complex problem solving

## ✅ What Has Been Done

### 1. OptiLLM Installation & Setup
- ✅ Installed OptiLLM in dedicated virtual environment (`/home/ubuntu/optillm-venv`)
- ✅ Created setup script (`setup.sh`) for easy management
- ✅ Configured OptiLLM to proxy requests to `text.pollinations.ai/openai`
- ✅ Tested basic functionality and optimization techniques (BON working)

### 2. P1 Model Integration
- ✅ Added "p1" model definition in `availableModels.js`
  - Description: "GPT-4.1 with OptiLLM optimization proxy for enhanced reasoning and performance"
  - Handler: `generateTextPortkey`
  - Provider: `azure`
  - Pricing: Same as GPT-4.1
- ✅ Added MODEL_MAPPING entry: `'p1': 'optillm-p1'`
- ✅ Created portkeyConfig for `optillm-p1` (currently commented out)
- ✅ Committed changes to git repository

### 3. Testing & Validation
- ✅ Verified OptiLLM proxy works with text.pollinations.ai backend
- ✅ Tested basic requests through OptiLLM
- ✅ Tested "bon" (Best of N) optimization technique
- ✅ Confirmed proper request routing and response handling

## 🚧 What Needs to Be Done Next

### 1. Enable P1 Model (High Priority)
- [ ] Uncomment the `optillm-p1` configuration in `generateTextPortkey.js`
- [ ] Test end-to-end flow: client → pollinations → optillm → azure openai
- [ ] Verify optimization techniques work properly

### 2. Service Management (Medium Priority)
- [ ] Create systemd service for OptiLLM auto-startup
- [ ] Configure proper logging and monitoring
- [ ] Add health checks and restart policies
- [ ] Set up log rotation

### 3. Advanced Configuration (Medium Priority)
- [ ] Configure different optimization approaches for different use cases
- [ ] Add model-specific optimization settings
- [ ] Implement approach selection based on request parameters
- [ ] Add telemetry for OptiLLM usage tracking

### 4. Error Handling & Resilience (Medium Priority)
- [ ] Fix MOA (Mixture of Agents) errors - currently failing
- [ ] Add fallback to direct Azure OpenAI if OptiLLM fails
- [ ] Implement circuit breaker pattern
- [ ] Add proper error logging and alerting

### 5. Performance & Optimization (Low Priority)
- [ ] Benchmark performance impact of different approaches
- [ ] Optimize for latency vs quality trade-offs
- [ ] Cache optimization results when appropriate
- [ ] Load testing with OptiLLM proxy

### 6. Documentation & Monitoring (Low Priority)
- [ ] Document available optimization approaches
- [ ] Add usage examples for different techniques
- [ ] Create monitoring dashboard for OptiLLM metrics
- [ ] Document troubleshooting procedures

## 🚀 Quick Start

### Setup OptiLLM
```bash
cd optillm/
chmod +x setup.sh
./setup.sh setup    # Install OptiLLM
./setup.sh start     # Start the proxy
./setup.sh status    # Check status
./setup.sh test      # Send test request
```

### Enable P1 Model
1. Edit `../generateTextPortkey.js`
2. Uncomment the `optillm-p1` configuration (lines ~395-403)
3. Restart the Node.js service

### Test P1 Model
```bash
curl -X POST https://text.pollinations.ai/openai/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "p1",
    "messages": [{"role": "user", "content": "Test OptiLLM integration"}],
    "max_tokens": 100
  }'
```

### Use Optimization Techniques
```bash
# Best of N optimization
curl -X POST http://localhost:8100/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bon-openai-large",
    "messages": [{"role": "user", "content": "Your prompt here"}]
  }'

# Chain of Thought
curl -X POST http://localhost:8100/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cot_reflection-openai-large",
    "messages": [{"role": "user", "content": "Complex reasoning task"}]
  }'
```

## 📁 File Structure

```
optillm/
├── README.md           # This file
├── setup.sh           # OptiLLM management script
└── ...                 # Future config files, logs, etc.

../availableModels.js   # Contains p1 model definition
../generateTextPortkey.js # Contains optillm-p1 routing config
```

## 🔧 Configuration Details

### OptiLLM Proxy Settings
- **Port**: 8100
- **Backend**: https://text.pollinations.ai/openai
- **Model Mapping**: `p1` → `optillm-p1` → `openai-large`
- **Virtual Environment**: `/home/ubuntu/optillm-venv`

### Available Optimization Approaches
- `auto` - Automatic approach selection
- `bon` - Best of N (working ✅)
- `moa` - Mixture of Agents (needs fixing ❌)
- `cot_reflection` - Chain of Thought with reflection
- `self_consistency` - Self-consistency decoding
- `mcts` - Monte Carlo Tree Search
- `rstar` - R* algorithm
- `leap` - LEAP approach

## 🐛 Known Issues

1. **MOA (Mixture of Agents) Error**: "list index out of range" - needs investigation
2. **Service Management**: No automatic startup on reboot yet
3. **Error Handling**: No fallback mechanism if OptiLLM fails

## 📞 Support

For issues with OptiLLM integration:
1. Check OptiLLM status: `./setup.sh status`
2. View logs: `journalctl -f` (when systemd service is created)
3. Test direct connection: `./setup.sh test`
4. Restart service: `./setup.sh restart`

For more information about OptiLLM features and approaches, see:
- [OptiLLM GitHub Repository](https://github.com/codelion/optillm)
- [OptiLLM Documentation](https://github.com/codelion/optillm/blob/main/README.md)
