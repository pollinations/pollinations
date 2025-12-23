# 📊 Multiple Image Analysis

> **Compare, analyze, and process multiple images with AI vision capabilities**

---

## 📋 Table of Contents

- [Multi-Image Basics](#multi-image-basics)
- [Image Comparison](#image-comparison)
- [Batch Analysis](#batch-analysis)
- [Image Sequences](#image-sequences)
- [Advanced Patterns](#advanced-patterns)
- [Real-World Applications](#real-world-applications)

---

## 🚀 Quick Start

### Basic Multi-Image Analysis

```python
from blossom_ai import BlossomClient, MessageBuilder

with BlossomClient() as client:
    # Analyze multiple images
    messages = [
        MessageBuilder.image(
            role="user",
            text="Compare these two images and describe the differences",
            image_url="https://example.com/image1.jpg",
            detail="high"
        ),
        MessageBuilder.image(
            role="user",
            text="And this second image",
            image_url="https://example.com/image2.jpg",
            detail="high"
        )
    ]
    
    analysis = client.text.chat(messages, model="openai")
    print(analysis.text)
```

### Multiple Images in One Message

```python
# Send multiple images in a single message
messages = [
    {
        "role": "user",
        "content": [
            {"type": "text", "text": "Analyze these three images:"},
            {"type": "image_url", "image_url": {"url": "https://example.com/img1.jpg"}},
            {"type": "image_url", "image_url": {"url": "https://example.com/img2.jpg"}},
            {"type": "image_url", "image_url": {"url": "https://example.com/img3.jpg"}}
        ]
    }
]

response = client.text.chat(messages)
print(response.text)
```

---

## 🔄 Image Comparison

### Before and After Analysis

```python
def compare_before_after(before_url, after_url, client):
    """Compare before and after images"""
    
    messages = [
        MessageBuilder.image(
            role="user",
            text="Analyze the 'before' image",
            image_url=before_url,
            detail="high"
        ),
        MessageBuilder.image(
            role="user",
            text="Now analyze the 'after' image and compare with the previous one. What changed?",
            image_url=after_url,
            detail="high"
        )
    ]
    
    comparison = client.text.chat(messages)
    
    return {
        "before_url": before_url,
        "after_url": after_url,
        "analysis": comparison.text
    }

# Usage
comparison_result = compare_before_after(
    "https://example.com/renovation-before.jpg",
    "https://example.com/renovation-after.jpg",
    client
)
```

### Similarity Scoring

```python
def calculate_image_similarity(image1_url, image2_url, client):
    """Calculate similarity between two images"""
    
    messages = [
        MessageBuilder.image(
            role="user",
            text="Rate the similarity between these two images on a scale of 0-100, where 0 is completely different and 100 is identical. Consider composition, objects, colors, and overall appearance.",
            image_url=image1_url,
            detail="low"
        ),
        MessageBuilder.image(
            role="user",
            text="Second image for comparison:",
            image_url=image2_url,
            detail="low"
        )
    ]
    
    response = client.text.chat(messages)
    
    # Extract similarity score from response
    import re
    score_match = re.search(r'(\d+)', response.text)
    similarity_score = int(score_match.group(1)) if score_match else 0
    
    return {
        "similarity_score": similarity_score,
        "explanation": response.text
    }

# Compare multiple pairs
image_pairs = [
    ("https://example.com/img1.jpg", "https://example.com/img2.jpg"),
    ("https://example.com/img1.jpg", "https://example.com/img3.jpg"),
    ("https://example.com/img2.jpg", "https://example.com/img3.jpg")
]

similarities = []
for img1, img2 in image_pairs:
    similarity = calculate_image_similarity(img1, img2, client)
    similarities.append({
        "pair": (img1, img2),
        "similarity": similarity
    })
```

### Feature Comparison

```python
def compare_image_features(image1_url, image2_url, features, client):
    """Compare specific features across images"""
    
    feature_prompts = {
        "colors": "Compare the color schemes and dominant colors",
        "objects": "Identify and compare objects in both images",
        "composition": "Analyze the composition and layout",
        "lighting": "Compare the lighting conditions",
        "style": "Compare the artistic or photographic style",
        "mood": "Compare the mood and atmosphere"
    }
    
    results = {}
    
    for feature in features:
        messages = [
            MessageBuilder.image(
                role="user",
                text=f"{feature_prompts.get(feature, f'Analyze the {feature}')}. First image:",
                image_url=image1_url,
                detail="high"
            ),
            MessageBuilder.image(
                role="user",
                text="Second image:",
                image_url=image2_url,
                detail="high"
            )
        ]
        
        response = client.text.chat(messages)
        results[feature] = response.text
    
    return results

# Compare specific features
feature_comparison = compare_image_features(
    "https://example.com/photo1.jpg",
    "https://example.com/photo2.jpg",
    features=["colors", "composition", "mood"],
    client=client
)
```

---

## 📊 Batch Analysis

### Processing Multiple Images

```python
async def analyze_image_batch(image_urls, analysis_prompt, client):
    """Analyze multiple images with the same prompt"""
    
    results = []
    
    for i, image_url in enumerate(image_urls):
        messages = [
            MessageBuilder.image(
                role="user",
                text=f"{analysis_prompt} (Image {i+1}/{len(image_urls)})",
                image_url=image_url,
                detail="high"
            )
        ]
        
        response = await client.text.chat_async(messages)
        results.append({
            "image_url": image_url,
            "index": i,
            "analysis": response.text
        })
    
    return results

# Batch analyze product images
product_images = [
    "https://example.com/product1.jpg",
    "https://example.com/product2.jpg",
    "https://example.com/product3.jpg",
    "https://example.com/product4.jpg"
]

analysis_results = await analyze_image_batch(
    product_images,
    "Analyze this product image and describe its key features, quality, and potential use cases.",
    client
)
```

### Batch Comparison Matrix

```python
def create_comparison_matrix(image_urls, comparison_criteria, client):
    """Create a comparison matrix for multiple images"""
    
    matrix = {}
    
    for i, img1_url in enumerate(image_urls):
        matrix[img1_url] = {}
        
        for j, img2_url in enumerate(image_urls):
            if i != j:  # Don't compare image with itself
                messages = [
                    MessageBuilder.image(
                        role="user",
                        text=f"Compare these two images based on: {', '.join(comparison_criteria)}",
                        image_url=img1_url,
                        detail="medium"
                    ),
                    MessageBuilder.image(
                        role="user",
                        text="Compare with this image:",
                        image_url=img2_url,
                        detail="medium"
                    )
                ]
                
                response = client.text.chat(messages)
                matrix[img1_url][img2_url] = response.text
            else:
                matrix[img1_url][img2_url] = "Same image"
    
    return matrix

# Create comparison matrix
criteria = ["quality", "style", "composition", "color scheme"]
images = [
    "https://example.com/design1.jpg",
    "https://example.com/design2.jpg",
    "https://example.com/design3.jpg"
]

comparison_matrix = create_comparison_matrix(images, criteria, client)
```

### Aggregated Analysis

```python
def aggregate_image_analysis(image_urls, analysis_type, client):
    """Aggregate analysis across multiple images"""
    
    if analysis_type == "common_elements":
        prompt = "Identify elements that are common across ALL of these images. What themes, objects, or characteristics appear in every image?"
    elif analysis_type == "unique_elements":
        prompt = "Identify what makes each image unique. What elements appear in only one image?"
    elif analysis_type == "trends":
        prompt = "Analyze the collection of images and identify trends or patterns across the entire set."
    else:
        prompt = analysis_type
    
    # Build message with all images
    content = [{"type": "text", "text": prompt}]
    
    for url in image_urls:
        content.append({"type": "image_url", "image_url": {"url": url}})
    
    messages = [{"role": "user", "content": content}]
    response = client.text.chat(messages)
    
    return {
        "analysis_type": analysis_type,
        "image_count": len(image_urls),
        "result": response.text
    }

# Analyze collection
common_elements = aggregate_image_analysis(
    ["https://example.com/photo1.jpg", "https://example.com/photo2.jpg", "https://example.com/photo3.jpg"],
    "common_elements",
    client
)
```

---

## 🎬 Image Sequences

### Time Series Analysis

```python
def analyze_image_sequence(image_sequence, time_interval, client):
    """Analyze a sequence of images over time"""
    
    messages = [
        MessageBuilder.text(
            role="user",
            text=f"Analyze this sequence of images taken {time_interval} apart. Describe the changes and progression over time."
        )
    ]
    
    # Add all images to the sequence
    for i, image_url in enumerate(image_sequence):
        messages.append(
            MessageBuilder.image(
                role="user",
                text=f"Time point {i+1}:",
                image_url=image_url,
                detail="high"
            )
        )
    
    analysis = client.text.chat(messages)
    
    return {
        "sequence_length": len(image_sequence),
        "time_interval": time_interval,
        "analysis": analysis.text
    }

# Analyze construction progress
construction_sequence = [
    "https://example.com/construction-day1.jpg",
    "https://example.com/construction-day30.jpg",
    "https://example.com/construction-day60.jpg",
    "https://example.com/construction-day90.jpg"
]

progress_analysis = analyze_image_sequence(
    construction_sequence,
    "30 days",
    client
)
```

### Storytelling with Images

```python
def create_image_story(image_sequence, story_style, client):
    """Create a narrative from a sequence of images"""
    
    style_prompts = {
        "chronological": "Tell the story in chronological order based on the image sequence",
        "mystery": "Create a mystery story that connects these images",
        "adventure": "Write an adventure story that links these scenes together",
        "documentary": "Provide a documentary-style narration of events shown in these images"
    }
    
    story_prompt = style_prompts.get(story_style, style_prompts["chronological"])
    
    messages = [
        MessageBuilder.text(
            role="user",
            text=f"{story_prompt}. Create a coherent narrative that connects all these images."
        )
    ]
    
    for i, image_url in enumerate(image_sequence):
        messages.append(
            MessageBuilder.image(
                role="user",
                text=f"Scene {i+1}:",
                image_url=image_url,
                detail="high"
            )
        )
    
    story = client.text.chat(messages)
    
    return {
        "story_style": story_style,
        "image_count": len(image_sequence),
        "story": story.text
    }

# Create story from image sequence
story_images = [
    "https://example.com/story-scene1.jpg",
    "https://example.com/story-scene2.jpg",
    "https://example.com/story-scene3.jpg"
]

mystery_story = create_image_story(story_images, "mystery", client)
```

---

## 🚀 Advanced Patterns

### Multi-Modal Analysis

```python
def multimodal_analysis(image_urls, text_data, analysis_focus, client):
    """Combine image and text analysis"""
    
    messages = [
        MessageBuilder.text(
            role="user",
            text=f"Analyze the following images and text data focusing on: {analysis_focus}"
        ),
        MessageBuilder.text(
            role="user",
            text=f"Text data: {json.dumps(text_data, indent=2)}"
        )
    ]
    
    for image_url in image_urls:
        messages.append(
            MessageBuilder.image(
                role="user",
                text="Related image:",
                image_url=image_url,
                detail="high"
            )
        )
    
    analysis = client.text.chat(messages)
    
    return {
        "analysis_focus": analysis_focus,
        "image_count": len(image_urls),
        "text_data_keys": list(text_data.keys()),
        "multimodal_analysis": analysis.text
    }

# Analyze product with reviews
product_analysis = multimodal_analysis(
    image_urls=["https://example.com/product-main.jpg", "https://example.com/product-detail.jpg"],
    text_data={
        "reviews": [
            {"rating": 5, "comment": "Great quality!"},
            {"rating": 4, "comment": "Good but expensive"}
        ],
        "specifications": {
            "weight": "2.5kg",
            "dimensions": "30x20x10cm",
            "material": "aluminum"
        }
    },
    analysis_focus="How well do the product images match the described specifications and customer feedback?",
    client=client
)
```

### Confidence Scoring

```python
def analyze_with_confidence(image_urls, analysis_prompt, client):
    """Analyze images with confidence scores"""
    
    messages = [
        MessageBuilder.text(
            role="user",
            text=f"{analysis_prompt} For each image, provide a confidence score (0-100) for your analysis."
        )
    ]
    
    for i, image_url in enumerate(image_urls):
        messages.append(
            MessageBuilder.image(
                role="user",
                text=f"Image {i+1}:",
                image_url=image_url,
                detail="high"
            )
        )
    
    response = client.text.chat(messages)
    
    # Extract confidence scores
    import re
    confidence_scores = []
    for match in re.finditer(r'confidence[:\s]+(\d+)', response.text.lower()):
        confidence_scores.append(int(match.group(1)))
    
    return {
        "analysis": response.text,
        "confidence_scores": confidence_scores,
        "average_confidence": sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
    }

# Analyze with confidence
confident_analysis = analyze_with_confidence(
    ["https://example.com/photo1.jpg", "https://example.com/photo2.jpg"],
    "Identify the main objects in these images",
    client
)
```

### Dynamic Image Selection

```python
def select_relevant_images(all_images, query, max_images, client):
    """Dynamically select most relevant images for analysis"""
    
    # First, get descriptions of all images
    image_descriptions = []
    
    for image_url in all_images:
        messages = [
            MessageBuilder.image(
                role="user",
                text="Briefly describe the main content of this image in one sentence:",
                image_url=image_url,
                detail="low"
            )
        ]
        
        response = client.text.chat(messages)
        image_descriptions.append({
            "url": image_url,
            "description": response.text
        })
    
    # Then select most relevant images based on query
    selection_prompt = f"""
    Query: {query}
    
    Available images:
    {json.dumps(image_descriptions, indent=2)}
    
    Select the {max_images} most relevant images for this query.
    Return only the URLs of the selected images in JSON format.
    """
    
    selection_response = client.text.generate(
        prompt=selection_prompt,
        response_format={
            "type": "json_object",
            "schema": {
                "type": "object",
                "properties": {
                    "selected_images": {
                        "type": "array",
                        "maxItems": max_images,
                        "items": {"type": "string"}
                    }
                },
                "required": ["selected_images"]
            }
        }
    )
    
    selected_data = json.loads(selection_response.text)
    return selected_data["selected_images"]

# Select relevant images
relevant_images = select_relevant_images(
    all_images=["https://example.com/img1.jpg", "https://example.com/img2.jpg", "https://example.com/img3.jpg"],
    query="Find images showing outdoor activities",
    max_images=2,
    client=client
)
```

---

## 💼 Real-World Applications

### Product Catalog Analysis

```python
class ProductCatalogAnalyzer:
    def __init__(self, client):
        self.client = client
    
    def analyze_product_consistency(self, product_images):
        """Analyze consistency across product images"""
        
        analysis = aggregate_image_analysis(
            product_images,
            "Analyze these product images for brand consistency, quality standards, and visual coherence.",
            self.client
        )
        
        return {
            "consistency_analysis": analysis["result"],
            "recommendations": self.generate_consistency_recommendations(analysis["result"])
        }
    
    def find_similar_products(self, target_image, product_catalog, similarity_threshold=70):
        """Find similar products in catalog"""
        
        similar_products = []
        
        for product in product_catalog:
            similarity = calculate_image_similarity(
                target_image,
                product["image_url"],
                self.client
            )
            
            if similarity["similarity_score"] >= similarity_threshold:
                similar_products.append({
                    "product": product,
                    "similarity_score": similarity["similarity_score"]
                })
        
        return sorted(similar_products, key=lambda x: x["similarity_score"], reverse=True)
    
    def generate_consistency_recommendations(self, analysis_text):
        """Generate recommendations based on consistency analysis"""
        
        prompt = f"""
        Based on this product consistency analysis: {analysis_text}
        
        Generate specific recommendations for improving visual consistency:
        1. Lighting improvements
        2. Background standardization
        3. Angle and composition
        4. Color consistency
        5. Quality standards
        
        Return as structured JSON.
        """
        
        response = self.client.text.generate(
            prompt=prompt,
            response_format={"type": "json_object"}
        )
        
        return json.loads(response.text)

# Usage
analyzer = ProductCatalogAnalyzer(client)

# Analyze product consistency
product_images = [
    "https://store.com/product-1.jpg",
    "https://store.com/product-2.jpg",
    "https://store.com/product-3.jpg"
]

consistency_report = analyzer.analyze_product_consistency(product_images)
```

### Real Estate Image Analysis

```python
class RealEstateImageAnalyzer:
    def __init__(self, client):
        self.client = client
    
    def analyze_property_tour(self, property_images):
        """Analyze a complete property image tour"""
        
        # Analyze room by room
        room_analysis = {}
        
        for i, image_url in enumerate(property_images):
            messages = [
                MessageBuilder.image(
                    role="user",
                    text="Analyze this room and identify: 1) Room type, 2) Key features, 3) Condition, 4) Size estimate",
                    image_url=image_url,
                    detail="high"
                )
            ]
            
            response = self.client.text.chat(messages)
            room_analysis[f"room_{i+1}"] = response.text
        
        # Overall property analysis
        overall_analysis = aggregate_image_analysis(
            property_images,
            "Analyze this property collection and provide: Overall condition, room flow, best features, and areas needing attention",
            self.client
        )
        
        return {
            "room_analyses": room_analysis,
            "overall_analysis": overall_analysis["result"]
        }
    
    def compare_properties(self, property1_images, property2_images):
        """Compare two properties"""\n        
        # Analyze each property
        prop1_analysis = self.analyze_property_tour(property1_images)
        prop2_analysis = self.analyze_property_tour(property2_images)
        
        # Compare properties
        comparison_prompt = f"""
        Compare these two properties:
        
        Property 1 Analysis: {prop1_analysis['overall_analysis']}
        Property 2 Analysis: {prop2_analysis['overall_analysis']}
        
        Provide a detailed comparison covering:
        1. Size and layout
        2. Condition and maintenance
        3. Value proposition
        4. Suitable buyer profiles
        """
        
        comparison = self.client.text.generate(comparison_prompt)
        
        return {
            "property1": prop1_analysis,
            "property2": prop2_analysis,
            "comparison": comparison.text
        }

# Usage
analyzer = RealEstateImageAnalyzer(client)

# Analyze property tour
property_images = [
    "https://realestate.com/house-exterior.jpg",
    "https://realestate.com/living-room.jpg",
    "https://realestate.com/kitchen.jpg",
    "https://realestate.com/bedroom.jpg"
]

property_report = analyzer.analyze_property_tour(property_images)
```

### Content Moderation

```python
class ContentModerationAnalyzer:
    def __init__(self, client):
        self.client = client
    
    def moderate_image_batch(self, image_urls, moderation_categories):
        """Moderate a batch of images"""\n        
        moderation_results = []
        
        for image_url in image_urls:
            messages = [
                MessageBuilder.image(
                    role="user",
                    text=f"Moderate this image for: {', '.join(moderation_categories)}. Rate each category as safe, warning, or unsafe.",
                    image_url=image_url,
                    detail="high"
                )
            ]
            
            response = self.client.text.chat(messages)
            
            # Parse moderation results
            result = {
                "image_url": image_url,
                "analysis": response.text,
                "categories": {}
            }
            
            # Extract ratings for each category
            for category in moderation_categories:
                if f"{category}: safe" in response.text.lower():
                    result["categories"][category] = "safe"
                elif f"{category}: warning" in response.text.lower():
                    result["categories"][category] = "warning"
                elif f"{category}: unsafe" in response.text.lower():
                    result["categories"][category] = "unsafe"
                else:
                    result["categories"][category] = "unknown"
            
            moderation_results.append(result)
        
        return moderation_results
    
    def generate_moderation_report(self, moderation_results):
        """Generate summary moderation report"""
        
        total_images = len(moderation_results)
        unsafe_count = sum(
            1 for result in moderation_results
            if any(cat == "unsafe" for cat in result["categories"].values())
        )
        warning_count = sum(
            1 for result in moderation_results
            if any(cat == "warning" for cat in result["categories"].values())
            and not any(cat == "unsafe" for cat in result["categories"].values())
        )
        
        report = {
            "total_images": total_images,
            "safe_images": total_images - unsafe_count - warning_count,
            "warning_images": warning_count,
            "unsafe_images": unsafe_count,
            "compliance_rate": (total_images - unsafe_count) / total_images * 100,
            "details": moderation_results
        }
        
        return report

# Usage
moderator = ContentModerationAnalyzer(client)

user_uploaded_images = [
    "https://uploads.com/user1.jpg",
    "https://uploads.com/user2.jpg",
    "https://uploads.com/user3.jpg"
]

moderation_results = moderator.moderate_image_batch(
    user_uploaded_images,
    moderation_categories=["violence", "nudity", "spam", "copyright"]
)

report = moderator.generate_moderation_report(moderation_results)
print(f"Compliance rate: {report['compliance_rate']:.1f}%")
```

---

## 📚 Further Reading

- [Vision Analysis Basics](VISION.md)
- [Local Image Processing](VISION_LOCAL.md)
- [Multimodal Applications](MULTIMODAL_APPS.md)
- [Image Generation](IMAGE_GENERATION.md)
- [Advanced Text Analysis](TEXT_GENERATION.md)