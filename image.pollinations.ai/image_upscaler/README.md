
# Image Upscaling API

A high-performance image upscaling service using Real-ESRGAN models with multi-server architecture and distributed processing.

## Features

- **2x and 4x Image Upscaling** - Real-ESRGAN model-based enhancement
- **Face Enhancement** - Automatic face detection and enhancement during upscaling
- **Multi-Server Architecture** - 5 concurrent model servers for load balancing
- **Async Processing** - Built with Quart for async HTTP handling
- **Automatic Cleanup** - Background task removes files older than 5 minutes
- **Base64 Support** - Direct base64 image input/output
- **Validation** - File size (7MB max) and dimension (2048px max) limits, with dynamic thresholding per target resolution
- **Health Monitoring** - Status and health check endpoints

## Architecture

- **model_server.py** - RealESRGAN inference servers (port 5002+)
- **esrgan.py** - Client with round-robin server selection and image conversion
- **upscale.py** - Core upscaling pipeline, face detection, and sequential upscaling logic
- **app.py** - Quart async API server (port 8000)

## Workflow Diagrams

### Request Processing Flow

```mermaid
graph TD
    A["Client Request"] --> B["POST /upscale"]
    B --> C["Validate JSON & Parameters"]
    C -->|Invalid| D["Return 400 Error"]
    C -->|Valid| E["Download Image from URL"]
    E -->|Failed| F["Return 400 Error"]
    E -->|Success| G["Validate & Prepare Image"]
    G -->|Invalid| H["Return 400 Error"]
    G -->|Valid| I["Check File Size & Dimension Limits"]
    I -->|Exceeds Limit| J["Return 400 Error"]
    I -->|Within Limit| K["Determine Upscaling Strategy"]
    K --> L["Detect Faces (if enabled)"]
    L --> M["Apply Sequential Upscaling"]
    M --> N["Save & Respond with File Path/Base64"]
```

### Server Architecture

```mermaid
graph TB
    subgraph Client["Client Layer"]
        API["Quart API<br/>Port 8000"]
    end

    subgraph Processing["Processing Layer"]
        ESRGAN["esrgan.py<br/>Round-Robin<br/>Load Balancer"]
    end

    subgraph Inference["Inference Layer"]
        S1["Model Server 1<br/>Port 5002"]
        S2["Model Server 2<br/>Port 5003"]
        S3["Model Server 3<br/>Port 5004"]
        S4["Model Server 4<br/>Port 5005"]
        S5["Model Server 5<br/>Port 5006"]
    end

    subgraph Storage["Storage"]
        UPLOADS["uploads/<br/>File Cache"]
    end

    API --> ESRGAN
    ESRGAN --> S1
    ESRGAN --> S2
    ESRGAN --> S3
    ESRGAN --> S4
    ESRGAN --> S5
    S1 --> UPLOADS
    S2 --> UPLOADS
    S3 --> UPLOADS
    S4 --> UPLOADS
    S5 --> UPLOADS
```

### Image Processing Pipeline

```mermaid
graph LR
    A["Input Image<br/>RGB"] --> B["Face Detection"]
    B -->|Faces Found| C["Enable Face Enhancement"]
    B -->|No Faces| D["Standard Enhancement"]
    C --> E["Determine Upscaling Strategy"]
    D --> E
    E --> F["Apply Sequential Upscaling<br/>2x/4x Passes"]
    F --> G["Convert to PIL Image"]
    G --> H["Save to Disk"]
    G --> I["Encode to Base64"]
    H --> J["Return File Path<br/>& Base64"]
    I --> J
```

### Background Cleanup Task

```mermaid
graph TD
    A["Start Cleanup Task"] --> B["Sleep 5 minutes"]
    B --> C["Get Current Time"]
    C --> D["List all Files"]
    D --> E["For Each File"]
    E --> F{File Age<br/>Exceed 5 min?}
    F -->|No| G["Skip"]
    F -->|Yes| H["Delete File"]
    G --> I{More Files?}
    H --> I
    I -->|Yes| E
    I -->|No| J["Log Statistics"]
    J --> B
```

## API Endpoints

- `POST /upscale` - Upscale image (required: `img_url`, optional: `target_resolution` [2k/4k/8k], `enhance_faces` [true/false])
- `GET /health` - Health check with limits
- `GET /status` - Server and resource status
- `POST /cleanup` - Manual file cleanup

