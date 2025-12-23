# 📋 JSON Mode - Structured Data Generation

> **Generate reliable, well-formed JSON output for structured data processing**

---

## 📋 Table of Contents

- [JSON Mode Basics](#json-mode-basics)
- [Schema Definition](#schema-definition)
- [Complex JSON Structures](#complex-json-structures)
- [Error Handling](#error-handling)
- [Validation](#validation)
- [Real-World Examples](#real-world-examples)

---

## 🚀 Quick Start

### Basic JSON Mode

```python
from blossom_ai import BlossomClient

with BlossomClient() as client:
    # Generate JSON response
    response = client.text.generate(
        prompt="List 5 popular programming languages with their release years",
        response_format={"type": "json_object"}
    )
    
    # Parse the JSON response
    import json
    data = json.loads(response.text)
    print(data)
    # Output: {"languages": [{"name": "Python", "year": 1991}, ...]}
```

### JSON with Schema

```python
# Define JSON schema
json_schema = {
    "type": "object",
    "properties": {
        "languages": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "year": {"type": "integer"},
                    "paradigm": {"type": "string"}
                },
                "required": ["name", "year"]
            }
        }
    },
    "required": ["languages"]
}

response = client.text.generate(
    prompt="List programming languages",
    response_format={
        "type": "json_object",
        "schema": json_schema
    }
)

data = json.loads(response.text)
print(data["languages"][0]["name"])  # "Python"
```

---

## 🏗️ Schema Definition

### Simple Schemas

```python
# Simple object schema
user_schema = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "age": {"type": "integer", "minimum": 0},
        "email": {"type": "string", "format": "email"},
        "active": {"type": "boolean"}
    },
    "required": ["name", "email"]
}

# Generate user data
response = client.text.generate(
    prompt="Create a user profile for a software developer",
    response_format={"type": "json_object", "schema": user_schema}
)

user_data = json.loads(response.text)
print(f"User: {user_data['name']}, Email: {user_data['email']}")
```

### Array Schemas

```python
# Array of objects
product_list_schema = {
    "type": "object",
    "properties": {
        "products": {
            "type": "array",
            "minItems": 3,
            "maxItems": 10,
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "name": {"type": "string"},
                    "price": {"type": "number", "minimum": 0},
                    "category": {"type": "string"},
                    "in_stock": {"type": "boolean"}
                },
                "required": ["id", "name", "price"]
            }
        },
        "total_count": {"type": "integer"}
    },
    "required": ["products", "total_count"]
}

response = client.text.generate(
    prompt="Generate a product catalog with 5 electronic items",
    response_format={"type": "json_object", "schema": product_list_schema}
)

catalog = json.loads(response.text)
print(f"Total products: {catalog['total_count']}")
for product in catalog['products']:
    print(f"- {product['name']}: ${product['price']}")
```

### Nested Schemas

```python
# Complex nested structure
company_schema = {
    "type": "object",
    "properties": {
        "company": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "founded": {"type": "integer"},
                "employees": {"type": "integer", "minimum": 1},
                "departments": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "manager": {"type": "string"},
                            "budget": {"type": "number", "minimum": 0},
                            "teams": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "team_name": {"type": "string"},
                                        "members": {"type": "integer"},
                                        "projects": {
                                            "type": "array",
                                            "items": {"type": "string"}
                                        }
                                    },
                                    "required": ["team_name", "members"]
                                }
                            }
                        },
                        "required": ["name", "manager"]
                    }
                }
            },
            "required": ["name", "founded", "employees"]
        }
    },
    "required": ["company"]
}

response = client.text.generate(
    prompt="Create a tech company profile",
    response_format={"type": "json_object", "schema": company_schema}
)

company = json.loads(response.text)
print(f"Company: {company['company']['name']}")
print(f"Departments: {len(company['company']['departments'])}")
```

---

## 🔧 Complex JSON Structures

### Enum and Pattern Validation

```python
# Schema with enums and patterns
order_schema = {
    "type": "object",
    "properties": {
        "order_id": {
            "type": "string",
            "pattern": "^ORD-[0-9]{6}$"
        },
        "status": {
            "type": "string",
            "enum": ["pending", "processing", "shipped", "delivered", "cancelled"]
        },
        "priority": {
            "type": "string",
            "enum": ["low", "medium", "high", "urgent"]
        },
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sku": {
                        "type": "string",
                        "pattern": "^[A-Z]{3}-[0-9]{4}$"
                    },
                    "quantity": {"type": "integer", "minimum": 1},
                    "price": {"type": "number", "minimum": 0}
                },
                "required": ["sku", "quantity", "price"]
            }
        },
        "customer_email": {
            "type": "string",
            "format": "email"
        }
    },
    "required": ["order_id", "status", "items", "customer_email"]
}

response = client.text.generate(
    prompt="Generate a sample order",
    response_format={"type": "json_object", "schema": order_schema}
)

order = json.loads(response.text)
print(f"Order {order['order_id']}: {order['status']}")
```

### OneOf and AnyOf

```python
# Schema with conditional types
media_schema = {
    "type": "object",
    "properties": {
        "media": {
            "oneOf": [
                {
                    "type": "object",
                    "properties": {
                        "type": {"const": "image"},
                        "url": {"type": "string"},
                        "width": {"type": "integer"},
                        "height": {"type": "integer"},
                        "format": {"enum": ["jpg", "png", "gif", "webp"]}
                    },
                    "required": ["type", "url"]
                },
                {
                    "type": "object",
                    "properties": {
                        "type": {"const": "video"},
                        "url": {"type": "string"},
                        "duration": {"type": "number"},
                        "resolution": {"type": "string"}
                    },
                    "required": ["type", "url", "duration"]
                },
                {
                    "type": "object",
                    "properties": {
                        "type": {"const": "audio"},
                        "url": {"type": "string"},
                        "duration": {"type": "number"},
                        "bitrate": {"type": "integer"}
                    },
                    "required": ["type", "url", "duration"]
                }
            ]
        }
    },
    "required": ["media"]
}

response = client.text.generate(
    prompt="Create a media item (image, video, or audio)",
    response_format={"type": "json_object", "schema": media_schema}
)

media = json.loads(response.text)
print(f"Media type: {media['media']['type']}")
```

### Conditional Schemas

```python
# Schema with conditional requirements
event_schema = {
    "type": "object",
    "properties": {
        "event_type": {
            "type": "string",
            "enum": ["meeting", "conference", "webinar", "workshop"]
        },
        "title": {"type": "string"},
        "date": {"type": "string", "format": "date"},
        "duration": {"type": "integer", "minimum": 30},
        "attendees": {"type": "integer", "minimum": 1},
        "location": {"type": "string"},
        "virtual_link": {"type": "string"},
        "recording_available": {"type": "boolean"}
    },
    "allOf": [
        {
            "if": {
                "properties": {"event_type": {"const": "virtual"}},
                "required": ["event_type"]
            },
            "then": {
                "required": ["virtual_link"]
            },
            "else": {
                "required": ["location"]
            }
        }
    ],
    "required": ["event_type", "title", "date", "duration"]
}
```

---

## ❌ Error Handling

### JSON Parsing Errors

```python
import json
from blossom_ai.exceptions import JSONGenerationError

def safe_json_generate(prompt, schema, client, max_attempts=3):
    """Generate JSON with error handling and retry logic"""
    
    for attempt in range(max_attempts):
        try:
            response = client.text.generate(
                prompt=prompt,
                response_format={"type": "json_object", "schema": schema}
            )
            
            # Try to parse JSON
            data = json.loads(response.text)
            
            # Basic validation
            if not isinstance(data, dict):
                raise ValueError("Response is not a JSON object")
            
            return data
            
        except json.JSONDecodeError as e:
            if attempt == max_attempts - 1:
                raise JSONGenerationError(f"Failed to generate valid JSON after {max_attempts} attempts: {e}")
            
            # Add instruction to fix JSON
            prompt += f"\n\nIMPORTANT: Ensure the response is valid JSON. Previous error: {e}"
            
        except Exception as e:
            if attempt == max_attempts - 1:
                raise JSONGenerationError(f"JSON generation failed: {e}")
    
    raise JSONGenerationError("Max retry attempts exceeded")

# Usage with error handling
try:
    data = safe_json_generate(
        prompt="Generate user profile data",
        schema=user_schema,
        client=client
    )
    print(f"Generated data: {data}")
except JSONGenerationError as e:
    print(f"Generation failed: {e}")
```

### Schema Validation

```python
from jsonschema import validate, ValidationError

def validate_json_response(response_text, schema):
    """Validate JSON response against schema"""
    
    try:
        data = json.loads(response_text)
        validate(instance=data, schema=schema)
        return {"valid": True, "data": data}
    
    except json.JSONDecodeError as e:
        return {"valid": False, "error": f"Invalid JSON: {e}"}
    
    except ValidationError as e:
        return {"valid": False, "error": f"Schema validation failed: {e}"}

# Usage
response = client.text.generate(
    prompt="Generate product data",
    response_format={"type": "json_object", "schema": product_list_schema}
)

validation = validate_json_response(response.text, product_list_schema)

if validation["valid"]:
    print("Valid JSON generated!")
    data = validation["data"]
else:
    print(f"Validation failed: {validation['error']}")
```

---

## ✅ Validation

### Pydantic Integration

```python
from pydantic import BaseModel, validator
from typing import List, Optional

class Product(BaseModel):
    id: int
    name: str
    price: float
    category: Optional[str] = None
    in_stock: bool = True
    
    @validator('price')
    def validate_price(cls, v):
        if v < 0:
            raise ValueError('Price must be non-negative')
        return v

class ProductCatalog(BaseModel):
    products: List[Product]
    total_count: int
    
    @validator('total_count')
    def validate_count(cls, v, values):
        if 'products' in values and v != len(values['products']):
            raise ValueError('total_count must match number of products')
        return v

def generate_with_pydantic(prompt, model_class, client):
    """Generate JSON and validate with Pydantic"""
    
    # Convert Pydantic model to JSON schema
    schema = model_class.model_json_schema()
    
    response = client.text.generate(
        prompt=prompt,
        response_format={"type": "json_object", "schema": schema}
    )
    
    # Parse and validate with Pydantic
    data = json.loads(response.text)
    validated_data = model_class(**data)
    
    return validated_data

# Usage
catalog = generate_with_pydantic(
    prompt="Generate a product catalog with 3 items",
    model_class=ProductCatalog,
    client=client
)

print(f"Validated catalog with {catalog.total_count} products")
for product in catalog.products:
    print(f"- {product.name}: ${product.price}")
```

### Custom Validators

```python
class JSONValidator:
    """Custom JSON validation with multiple rules"""
    
    def __init__(self):
        self.validators = []
    
    def add_validator(self, validator_func):
        """Add a custom validation function"""
        self.validators.append(validator_func)
    
    def validate(self, data):
        """Run all validators"""
        errors = []
        
        for validator in self.validators:
            try:
                validator(data)
            except Exception as e:
                errors.append(str(e))
        
        return {"valid": len(errors) == 0, "errors": errors}

# Create validator for business rules
business_validator = JSONValidator()

# Add business rule validators
@business_validator.add_validator
def validate_order_totals(data):
    """Validate that order totals match item sums"""
    if "order" in data:
        order = data["order"]
        if "items" in order and "total" in order:
            calculated_total = sum(
                item.get("price", 0) * item.get("quantity", 0)
                for item in order["items"]
            )
            if abs(calculated_total - order["total"]) > 0.01:
                raise ValueError(f"Order total mismatch: {calculated_total} != {order['total']}")

@business_validator.add_validator
def validate_product_categories(data):
    """Validate product categories"""
    valid_categories = ["electronics", "clothing", "books", "home", "sports"]
    
    if "products" in data:
        for product in data["products"]:
            category = product.get("category", "").lower()
            if category and category not in valid_categories:
                raise ValueError(f"Invalid category: {category}")

# Usage
response = client.text.generate(
    prompt="Generate an order with items",
    response_format={"type": "json_object"}
)

data = json.loads(response.text)
validation = business_validator.validate(data)

if validation["valid"]:
    print("Business rules validated!")
else:
    print(f"Validation errors: {validation['errors']}")
```

---

## 💼 Real-World Examples

### API Response Generator

```python
def generate_api_response(endpoint, method, status_code, data_schema=None):
    """Generate standardized API responses"""
    
    api_response_schema = {
        "type": "object",
        "properties": {
            "status": {"type": "string"},
            "code": {"type": "integer"},
            "message": {"type": "string"},
            "timestamp": {"type": "string", "format": "date-time"},
            "data": data_schema or {"type": "object"},
            "errors": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string"},
                        "message": {"type": "string"},
                        "code": {"type": "string"}
                    }
                }
            }
        },
        "required": ["status", "code", "message", "timestamp"]
    }
    
    prompt = f"""
    Generate a {status_code} HTTP response for {method} {endpoint}
    Include appropriate message and data structure.
    """
    
    response = client.text.generate(
        prompt=prompt,
        response_format={
            "type": "json_object",
            "schema": api_response_schema
        }
    )
    
    return json.loads(response.text)

# Usage
success_response = generate_api_response(
    "/api/users", "GET", 200,
    data_schema={
        "type": "object",
        "properties": {
            "users": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer"},
                        "name": {"type": "string"},
                        "email": {"type": "string"}
                    }
                }
            },
            "total": {"type": "integer"}
        }
    }
)

error_response = generate_api_response(
    "/api/users", "POST", 400,
    data_schema={"type": "null"}
)
```

### Configuration Generator

```python
def generate_app_config(app_type, environment):
    """Generate application configuration files"""
    
    config_schema = {
        "type": "object",
        "properties": {
            "app": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "version": {"type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$"},
                    "environment": {"enum": ["development", "staging", "production"]},
                    "port": {"type": "integer", "minimum": 1, "maximum": 65535}
                },
                "required": ["name", "version", "environment"]
            },
            "database": {
                "type": "object",
                "properties": {
                    "type": {"enum": ["postgresql", "mysql", "mongodb", "redis"]},
                    "host": {"type": "string"},
                    "port": {"type": "integer"},
                    "name": {"type": "string"},
                    "pool_size": {"type": "integer", "minimum": 1}
                },
                "required": ["type", "host", "port", "name"]
            },
            "logging": {
                "type": "object",
                "properties": {
                    "level": {"enum": ["debug", "info", "warning", "error"]},
                    "format": {"type": "string"},
                    "outputs": {
                        "type": "array",
                        "items": {"enum": ["console", "file", "syslog"]}
                    }
                },
                "required": ["level", "outputs"]
            },
            "features": {
                "type": "object",
                "patternProperties": {
                    "^enable_": {"type": "boolean"}
                }
            }
        },
        "required": ["app", "database", "logging"]
    }
    
    prompt = f"""
    Generate a configuration for a {app_type} application
    running in {environment} environment.
    Include realistic settings for database, logging, and features.
    """
    
    response = client.text.generate(
        prompt=prompt,
        response_format={
            "type": "json_object",
            "schema": config_schema
        }
    )
    
    return json.loads(response.text)

# Usage
dev_config = generate_app_config("web-api", "development")
prod_config = generate_app_config("microservice", "production")

print(f"Development port: {dev_config['app']['port']}")
print(f"Production database: {prod_config['database']['type']}")
```

### Test Data Generator

```python
def generate_test_data(data_type, count=5):
    """Generate structured test data"""
    
    schemas = {
        "users": {
            "type": "object",
            "properties": {
                "users": {
                    "type": "array",
                    "minItems": count,
                    "maxItems": count,
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "integer"},
                            "username": {"type": "string", "pattern": "^user_[0-9]+$"},
                            "email": {"type": "string", "format": "email"},
                            "first_name": {"type": "string"},
                            "last_name": {"type": "string"},
                            "age": {"type": "integer", "minimum": 18, "maximum": 80},
                            "country": {"type": "string", "enum": ["US", "UK", "CA", "AU", "DE", "FR"]},
                            "created_at": {"type": "string", "format": "date-time"},
                            "is_active": {"type": "boolean"}
                        },
                        "required": ["id", "username", "email", "first_name", "last_name"]
                    }
                }
            },
            "required": ["users"]
        },
        "products": {
            "type": "object",
            "properties": {
                "products": {
                    "type": "array",
                    "minItems": count,
                    "maxItems": count,
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string", "pattern": "^PROD-[0-9]{4}$"},
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "price": {"type": "number", "minimum": 0.01},
                            "category": {"type": "string"},
                            "tags": {
                                "type": "array",
                                "items": {"type": "string"}
                            },
                            "in_stock": {"type": "boolean"},
                            "rating": {"type": "number", "minimum": 0, "maximum": 5}
                        },
                        "required": ["id", "name", "price", "category"]
                    }
                }
            },
            "required": ["products"]
        }
    }
    
    schema = schemas.get(data_type, schemas["users"])
    
    prompt = f"""
    Generate {count} realistic {data_type} records.
    Ensure all required fields are filled with appropriate values.
    Use consistent patterns for IDs and realistic data for names and emails.
    """
    
    response = client.text.generate(
        prompt=prompt,
        response_format={
            "type": "json_object",
            "schema": schema
        }
    )
    
    return json.loads(response.text)

# Usage
test_users = generate_test_data("users", count=3)
test_products = generate_test_data("products", count=4)

print(f"Generated {len(test_users['users'])} test users")
print(f"Generated {len(test_products['products'])} test products")
```

---

## 📚 Further Reading

- [Text Generation Basics](TEXT_GENERATION.md)
- [Function Calling](FUNCTION_CALLING.md)
- [Advanced Text Parameters](TEXT_ADVANCED.md)
- [Chat and Conversations](CHAT.md)
- [Error Handling](ERROR_HANDLING.md)