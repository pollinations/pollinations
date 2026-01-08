# 🛠️ Function Calling and Tool Use

> **Enable AI models to call functions and use tools for structured, reliable outputs**

---

## 📋 Table of Contents

- [Function Calling Basics](#function-calling-basics)
- [Tool Definitions](#tool-definitions)
- [Structured Outputs](#structured-outputs)
- [Multiple Function Calls](#multiple-function-calls)
- [Error Handling](#error-handling)
- [Advanced Patterns](#advanced-patterns)
- [Real-World Examples](#real-world-examples)

---

## 🚀 Quick Start

### Basic Function Call

```python
from blossom_ai import BlossomClient

with BlossomClient() as client:
    # Define a tool for getting weather
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get current weather for a location",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "City and country, e.g. London, UK"
                        },
                        "unit": {
                            "type": "string",
                            "enum": ["celsius", "fahrenheit"],
                            "default": "celsius"
                        }
                    },
                    "required": ["location"]
                }
            }
        }
    ]
    
    # Ask the model to use the tool
    response = client.text.generate(
        prompt="What's the weather like in Paris?",
        tools=tools,
        tool_choice="auto"
    )
    
    # Check if the model wants to call a function
    if response.tool_calls:
        for tool_call in response.tool_calls:
            if tool_call.function.name == "get_weather":
                # Extract arguments
                import json
                args = json.loads(tool_call.function.arguments)
                
                # Call your actual function
                weather = get_weather(args['location'], args.get('unit', 'celsius'))
                
                # Send result back to model
                final_response = client.text.generate(
                    prompt=f"The weather in {args['location']} is {weather}",
                    tools=tools
                )
                print(final_response.text)
```

### Simple Tool Example

```python
# Define a calculator tool
calculator_tool = {
    "type": "function",
    "function": {
        "name": "calculate",
        "description": "Perform mathematical calculations",
        "parameters": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "Mathematical expression to evaluate"
                }
            },
            "required": ["expression"]
        }
    }
}

# Use the tool
response = client.text.generate(
    prompt="What's 15 * 7 + 23?",
    tools=[calculator_tool]
)

# Handle the function call
if response.tool_calls:
    for tool_call in response.tool_calls:
        args = json.loads(tool_call.function.arguments)
        result = eval(args['expression'])  # In production, use a safe evaluator
        print(f"Calculation result: {result}")
```

---

## 🔧 Tool Definitions

### Function Schema

```python
def create_tool_schema(name, description, parameters):
    """Helper to create tool schemas"""
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": parameters
        }
    }

# Example: Database query tool
db_tool = create_tool_schema(
    name="query_database",
    description="Execute SQL query on customer database",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "SQL SELECT statement"
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of results",
                "default": 100
            }
        },
        "required": ["query"]
    }
)
```

### Complex Parameter Types

```python
# Tool with nested objects and arrays
inventory_tool = {
    "type": "function",
    "function": {
        "name": "search_inventory",
        "description": "Search product inventory",
        "parameters": {
            "type": "object",
            "properties": {
                "filters": {
                    "type": "object",
                    "properties": {
                        "category": {"type": "string"},
                        "price_range": {
                            "type": "object",
                            "properties": {
                                "min": {"type": "number"},
                                "max": {"type": "number"}
                            }
                        },
                        "in_stock": {"type": "boolean"}
                    }
                },
                "sort_by": {
                    "type": "string",
                    "enum": ["price", "name", "rating", "availability"]
                },
                "include_variants": {
                    "type": "boolean",
                    "default": False
                }
            },
            "required": []
        }
    }
}
```

### Multiple Tools

```python
# Define multiple tools for a travel assistant
travel_tools = [
    {
        "type": "function",
        "function": {
            "name": "search_flights",
            "description": "Search for flights",
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {"type": "string"},
                    "destination": {"type": "string"},
                    "departure_date": {"type": "string"},
                    "return_date": {"type": "string"},
                    "passengers": {"type": "integer", "default": 1}
                },
                "required": ["origin", "destination", "departure_date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "book_hotel",
            "description": "Book a hotel",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                    "check_in": {"type": "string"},
                    "check_out": {"type": "string"},
                    "guests": {"type": "integer", "default": 1},
                    "room_type": {
                        "type": "string",
                        "enum": ["standard", "deluxe", "suite"]
                    }
                },
                "required": ["location", "check_in", "check_out"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather_forecast",
            "description": "Get weather forecast",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                    "days": {"type": "integer", "default": 7}
                },
                "required": ["location"]
            }
        }
    }
]
```

---

## 🏗️ Structured Outputs

### Forcing JSON Output

```python
# Define a tool that returns structured data
json_schema = {
    "type": "function",
    "function": {
        "name": "extract_information",
        "description": "Extract structured information from text",
        "parameters": {
            "type": "object",
            "properties": {
                "entities": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {"type": "string", "enum": ["person", "location", "date", "amount"]},
                            "value": {"type": "string"},
                            "confidence": {"type": "number", "minimum": 0, "maximum": 1}
                        },
                        "required": ["type", "value"]
                    }
                },
                "sentiment": {
                    "type": "string",
                    "enum": ["positive", "negative", "neutral"]
                },
                "summary": {"type": "string"}
            },
            "required": ["entities", "sentiment", "summary"]
        }
    }
}

# Extract structured information
text = """
John Smith met with Sarah Johnson in New York on December 15th, 2024.
They discussed the quarterly budget of $50,000 and were generally positive
about the company's performance.
"""

response = client.text.generate(
    prompt=f"Extract structured information from: {text}",
    tools=[json_schema],
    tool_choice={"type": "function", "function": {"name": "extract_information"}}
)

# Parse the structured output
if response.tool_calls:
    for tool_call in response.tool_calls:
        data = json.loads(tool_call.function.arguments)
        print(f"Entities: {data['entities']}")
        print(f"Sentiment: {data['sentiment']}")
        print(f"Summary: {data['summary']}")
```

### Schema Validation

```python
from pydantic import BaseModel, validator
from typing import List, Literal

class ExtractedEntity(BaseModel):
    type: Literal["person", "location", "date", "amount"]
    value: str
    confidence: float
    
    @validator('confidence')
    def validate_confidence(cls, v):
        if not 0 <= v <= 1:
            raise ValueError('Confidence must be between 0 and 1')
        return v

class InformationExtraction(BaseModel):
    entities: List[ExtractedEntity]
    sentiment: Literal["positive", "negative", "neutral"]
    summary: str

# Use Pydantic model to validate function call results
def validate_extraction_result(tool_call):
    data = json.loads(tool_call.function.arguments)
    
    try:
        validated = InformationExtraction(**data)
        return validated
    except Exception as e:
        print(f"Validation error: {e}")
        return None
```

---

## 🔀 Multiple Function Calls

### Parallel Function Calls

```python
# Model can call multiple functions in one response
multi_tool_prompt = """
I need to plan a trip from New York to London departing on March 15th
and returning on March 22nd. Also book a hotel in London and check the weather.
"""

response = client.text.generate(
    prompt=multi_tool_prompt,
    tools=travel_tools
)

# Handle multiple function calls
if response.tool_calls:
    for tool_call in response.tool_calls:
        args = json.loads(tool_call.function.arguments)
        
        if tool_call.function.name == "search_flights":
            flights = search_flights(**args)
            print(f"Found flights: {flights}")
        
        elif tool_call.function.name == "book_hotel":
            hotel = book_hotel(**args)
            print(f"Hotel booked: {hotel}")
        
        elif tool_call.function.name == "get_weather_forecast":
            weather = get_weather_forecast(**args)
            print(f"Weather forecast: {weather}")
```

### Sequential Function Calls

```python
# Chain function calls where one depends on another
def plan_complete_trip(origin, destination, departure_date, return_date):
    """Plan a complete trip with sequential function calls"""
    
    # Step 1: Search for flights
    flight_response = client.text.generate(
        prompt=f"Search flights from {origin} to {destination} on {departure_date}",
        tools=[travel_tools[0]]  # Only flights tool
    )
    
    flights = None
    if flight_response.tool_calls:
        args = json.loads(flight_response.tool_calls[0].function.arguments)
        flights = search_flights(**args)
    
    # Step 2: Book hotel
    hotel_response = client.text.generate(
        prompt=f"Book a hotel in {destination} from {departure_date} to {return_date}",
        tools=[travel_tools[1]]  # Only hotel tool
    )
    
    hotel = None
    if hotel_response.tool_calls:
        args = json.loads(hotel_response.tool_calls[0].function.arguments)
        hotel = book_hotel(**args)
    
    # Step 3: Get weather
    weather_response = client.text.generate(
        prompt=f"What's the weather like in {destination}?",
        tools=[travel_tools[2]]  # Only weather tool
    )
    
    weather = None
    if weather_response.tool_calls:
        args = json.loads(weather_response.tool_calls[0].function.arguments)
        weather = get_weather_forecast(**args)
    
    return {
        "flights": flights,
        "hotel": hotel,
        "weather": weather
    }
```

---

## ❌ Error Handling

### Function Call Validation

```python
def safe_function_call(tool_call, available_functions):
    """Safely execute function calls with validation"""
    
    function_name = tool_call.function.name
    
    # Check if function exists
    if function_name not in available_functions:
        return {
            "error": f"Unknown function: {function_name}",
            "available_functions": list(available_functions.keys())
        }
    
    try:
        # Parse arguments
        args = json.loads(tool_call.function.arguments)
        
        # Get the function
        func = available_functions[function_name]
        
        # Call with arguments
        result = func(**args)
        
        return {"success": True, "result": result}
        
    except json.JSONDecodeError as e:
        return {
            "error": f"Invalid JSON in function arguments: {e}",
            "arguments": tool_call.function.arguments
        }
    
    except TypeError as e:
        return {
            "error": f"Invalid function arguments: {e}",
            "arguments": args
        }
    
    except Exception as e:
        return {
            "error": f"Function execution failed: {e}",
            "function": function_name,
            "arguments": args
        }

# Available functions
available_functions = {
    "get_weather": get_weather,
    "search_flights": search_flights,
    "book_hotel": book_hotel,
    "calculate": lambda expression: eval(expression)  # Use safe_eval in production
}

# Safe function execution
if response.tool_calls:
    for tool_call in response.tool_calls:
        result = safe_function_call(tool_call, available_functions)
        
        if "error" in result:
            print(f"Error: {result['error']}")
        else:
            print(f"Success: {result['result']}")
```

### Retry Logic

```python
import asyncio
from typing import List, Dict, Any

class FunctionCallHandler:
    def __init__(self, client, available_functions):
        self.client = client
        self.available_functions = available_functions
    
    async def execute_with_retry(
        self,
        tool_calls: List[Any],
        max_retries: int = 3,
        retry_delay: float = 1.0
    ) -> List[Dict[str, Any]]:
        """Execute function calls with retry logic"""
        
        results = []
        
        for tool_call in tool_calls:
            for attempt in range(max_retries):
                try:
                    result = await self.execute_single(tool_call)
                    results.append(result)
                    break  # Success, move to next tool call
                    
                except Exception as e:
                    if attempt == max_retries - 1:
                        # Final attempt failed
                        results.append({
                            "error": str(e),
                            "tool_call": tool_call.function.name,
                            "final_attempt": True
                        })
                    else:
                        # Wait before retry
                        await asyncio.sleep(retry_delay * (attempt + 1))
        
        return results
    
    async def execute_single(self, tool_call):
        """Execute a single function call"""
        function_name = tool_call.function.name
        
        if function_name not in self.available_functions:
            raise ValueError(f"Unknown function: {function_name}")
        
        args = json.loads(tool_call.function.arguments)
        func = self.available_functions[function_name]
        
        # Handle both sync and async functions
        if asyncio.iscoroutinefunction(func):
            result = await func(**args)
        else:
            result = func(**args)
        
        return {
            "tool_call_id": tool_call.id,
            "function": function_name,
            "arguments": args,
            "result": result
        }
```

---

## 🚀 Advanced Patterns

### Tool Chaining

```python
class ToolChain:
    """Chain multiple tools together"""
    
    def __init__(self, client, tools):
        self.client = client
        self.tools = {tool["function"]["name"]: tool for tool in tools}
    
    def execute_chain(self, prompt, tool_names):
        """Execute a chain of tools in sequence"""
        
        current_prompt = prompt
        results = {}
        
        for tool_name in tool_names:
            if tool_name not in self.tools:
                raise ValueError(f"Tool {tool_name} not found")
            
            # Generate with specific tool
            response = self.client.text.generate(
                prompt=current_prompt,
                tools=[self.tools[tool_name]],
                tool_choice={"type": "function", "function": {"name": tool_name}}
            )
            
            if response.tool_calls:
                tool_call = response.tool_calls[0]
                results[tool_name] = {
                    "arguments": json.loads(tool_call.function.arguments),
                    "response": response
                }
                
                # Update prompt for next tool
                current_prompt = f"Based on {tool_name} results, proceed with next step"
        
        return results

# Usage
chain = ToolChain(client, travel_tools)

results = chain.execute_chain(
    prompt="Plan a trip from NYC to London",
    tool_names=["search_flights", "book_hotel", "get_weather_forecast"]
)
```

### Conditional Tool Selection

```python
class ConditionalToolSelector:
    """Select tools based on context"""
    
    def __init__(self, client):
        self.client = client
        self.tool_registry = {}
    
    def register_tool(self, name, tool_schema, condition_func):
        """Register a tool with a condition function"""
        self.tool_registry[name] = {
            "schema": tool_schema,
            "condition": condition_func
        }
    
    def select_tools(self, context):
        """Select appropriate tools based on context"""
        selected_tools = []
        
        for name, tool_info in self.tool_registry.items():
            if tool_info["condition"](context):
                selected_tools.append(tool_info["schema"])
        
        return selected_tools
    
    def generate_with_selection(self, prompt, context):
        """Generate with dynamically selected tools"""
        tools = self.select_tools(context)
        
        if not tools:
            # No tools selected, regular generation
            return self.client.text.generate(prompt=prompt)
        
        return self.client.text.generate(
            prompt=prompt,
            tools=tools,
            tool_choice="auto"
        )

# Usage
selector = ConditionalToolSelector(client)

# Register tools with conditions
selector.register_tool(
    "get_weather",
    weather_tool,
    lambda ctx: "weather" in ctx.get("keywords", []) or 
                any(city in ctx.get("text", "") for city in ["london", "paris", "new york"])
)

selector.register_tool(
    "search_flights",
    travel_tools[0],
    lambda ctx: "flight" in ctx.get("keywords", []) or "travel" in ctx.get("keywords", [])
)

# Generate with conditional tool selection
context = {
    "text": "I want to visit London",
    "keywords": ["visit", "london"]
}

response = selector.generate_with_selection(
    prompt="What's the weather like in London?",
    context=context
)
```

---

## 💼 Real-World Examples

### Customer Support Bot

```python
class CustomerSupportBot:
    def __init__(self, client):
        self.client = client
        self.setup_tools()
    
    def setup_tools(self):
        """Setup tools for customer support"""
        
        self.support_tools = [
            {
                "type": "function",
                "function": {
                    "name": "lookup_order",
                    "description": "Look up order details by order number",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "order_number": {"type": "string"},
                            "customer_email": {"type": "string"}
                        },
                        "required": ["order_number"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "process_refund",
                    "description": "Process a refund for an order",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "order_number": {"type": "string"},
                            "amount": {"type": "number"},
                            "reason": {"type": "string"}
                        },
                        "required": ["order_number", "amount", "reason"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "check_inventory",
                    "description": "Check product availability",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "product_id": {"type": "string"},
                            "quantity": {"type": "integer", "default": 1}
                        },
                        "required": ["product_id"]
                    }
                }
            }
        ]
    
    def handle_customer_message(self, message):
        """Handle customer message with tool support"""
        
        response = self.client.text.generate(
            prompt=f"Customer: {message}\nSupport Agent:",
            tools=self.support_tools,
            tool_choice="auto"
        )
        
        # Handle any tool calls
        if response.tool_calls:
            for tool_call in response.tool_calls:
                result = self.execute_support_function(tool_call)
                
                # Generate follow-up response with function results
                follow_up = self.client.text.generate(
                    prompt=f"Function result: {result}\nRespond to customer:",
                    tools=self.support_tools
                )
                
                return follow_up.text
        
        return response.text
    
    def execute_support_function(self, tool_call):
        """Execute customer support functions"""
        
        args = json.loads(tool_call.function.arguments)
        
        if tool_call.function.name == "lookup_order":
            return self.lookup_order(**args)
        elif tool_call.function.name == "process_refund":
            return self.process_refund(**args)
        elif tool_call.function.name == "check_inventory":
            return self.check_inventory(**args)
        
        return {"error": "Unknown function"}
    
    def lookup_order(self, order_number, customer_email=None):
        # Implement actual order lookup
        return {"status": "shipped", "tracking": "123456789"}
    
    def process_refund(self, order_number, amount, reason):
        # Implement actual refund processing
        return {"refund_id": "RF123", "status": "processed"}
    
    def check_inventory(self, product_id, quantity=1):
        # Implement actual inventory check
        return {"available": True, "stock": 50}

# Usage
support_bot = CustomerSupportBot(client)

response = support_bot.handle_customer_message(
    "I need to check my order status, it's ORD-12345"
)
print(response)
```

### Data Analysis Assistant

```python
class DataAnalysisAssistant:
    def __init__(self, client):
        self.client = client
        self.setup_analysis_tools()
    
    def setup_analysis_tools(self):
        """Setup tools for data analysis"""
        
        self.analysis_tools = [
            {
                "type": "function",
                "function": {
                    "name": "load_dataset",
                    "description": "Load a dataset from file or URL",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "source": {"type": "string"},
                            "format": {
                                "type": "string",
                                "enum": ["csv", "json", "excel"]
                            }
                        },
                        "required": ["source", "format"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "describe_data",
                    "description": "Get descriptive statistics",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "dataset_id": {"type": "string"},
                            "columns": {
                                "type": "array",
                                "items": {"type": "string"}
                            }
                        },
                        "required": ["dataset_id"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_visualization",
                    "description": "Create data visualization",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "dataset_id": {"type": "string"},
                            "chart_type": {
                                "type": "string",
                                "enum": ["line", "bar", "scatter", "histogram"]
                            },
                            "x_column": {"type": "string"},
                            "y_column": {"type": "string"}
                        },
                        "required": ["dataset_id", "chart_type", "x_column", "y_column"]
                    }
                }
            }
        ]
    
    def analyze_data(self, user_request):
        """Analyze data based on user request"""
        
        response = self.client.text.generate(
            prompt=f"Analyze this data: {user_request}",
            tools=self.analysis_tools,
            tool_choice="auto"
        )
        
        return self.process_analysis_response(response)
    
    def process_analysis_response(self, response):
        """Process analysis response and execute tools"""
        
        if not response.tool_calls:
            return response.text
        
        results = []
        
        for tool_call in response.tool_calls:
            result = self.execute_analysis_tool(tool_call)
            results.append(result)
        
        # Generate summary with results
        summary = self.client.text.generate(
            prompt=f"Analysis results: {results}\nProvide a summary:",
            tools=self.analysis_tools
        )
        
        return summary.text
    
    def execute_analysis_tool(self, tool_call):
        """Execute data analysis tools"""
        
        args = json.loads(tool_call.function.arguments)
        
        if tool_call.function.name == "load_dataset":
            return self.load_dataset(**args)
        elif tool_call.function.name == "describe_data":
            return self.describe_data(**args)
        elif tool_call.function.name == "create_visualization":
            return self.create_visualization(**args)
        
        return {"error": "Unknown analysis tool"}
    
    def load_dataset(self, source, format):
        # Implement dataset loading
        import pandas as pd
        
        if format == "csv":
            df = pd.read_csv(source)
        elif format == "json":
            df = pd.read_json(source)
        elif format == "excel":
            df = pd.read_excel(source)
        
        return {
            "dataset_id": f"dataset_{hash(source)}",
            "shape": df.shape,
            "columns": list(df.columns)
        }
    
    def describe_data(self, dataset_id, columns=None):
        # Implement data description
        return {
            "mean": 10.5,
            "std": 2.3,
            "min": 5.0,
            "max": 15.0
        }
    
    def create_visualization(self, dataset_id, chart_type, x_column, y_column):
        # Implement visualization creation
        return {
            "chart_id": f"chart_{hash(dataset_id + chart_type)}",
            "type": chart_type,
            "columns": [x_column, y_column]
        }

# Usage
analyzer = DataAnalysisAssistant(client)

analysis = analyzer.analyze_data(
    "Load the sales data from sales.csv and create a line chart of revenue over time"
)
print(analysis)
```

---

## 📚 Further Reading

- [Text Generation Basics](TEXT_GENERATION.md)
- [Advanced Text Parameters](TEXT_ADVANCED.md)
- [JSON Mode](JSON_MODE.md)
- [Chat and Conversations](CHAT.md)
- [Error Handling](ERROR_HANDLING.md)