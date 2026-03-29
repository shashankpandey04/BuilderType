# BuilderType - Real-Time Typing Speed Leaderboard

A Flask-based real-time typing speed competition platform with live leaderboards, WPM tracking, and accuracy metrics. BuilderType enables users to compete in timed rounds and see their rankings on a dynamic leaderboard.

## Features

- **Real-Time Leaderboards**: 15-minute competitive rounds with live WPM rankings
- **Performance Metrics**: Track Words Per Minute (WPM) and accuracy scores
- **Session Management**: Support for multiple concurrent typing sessions
- **Winner Snapshots**: Historical records of round winners and achievements
- **Text-to-Speech Support**: gTTS integration for audio feedback
- **Responsive UI**: Clean, modern web interface with real-time updates
- **Database Indexing**: Optimized MongoDB queries for fast leaderboard retrieval

## Project Structure

```
BuilderType/
├── app.py                 # Flask application & API endpoints
├── requirements.txt       # Python dependencies
├── static/
│   ├── app.js            # Main application logic
│   ├── leaderboard.js    # Leaderboard UI components
│   ├── style.css         # Global styles
│   └── leaderboard.css   # Leaderboard-specific styles
└── templates/
    ├── index.html        # Main typing test page
    └── leaderboard.html  # Leaderboard display page
```

## Technology Stack

- **Backend**: Flask (Python)
- **Database**: MongoDB
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Audio**: Google Text-to-Speech (gTTS)

## Installation

### Prerequisites

- Python 3.8+
- MongoDB 4.0+

### Local Setup

1. Clone the repository:
```bash
git clone https://github.com/shashankpandey04/BuilderType.git
cd BuilderType
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up MongoDB:
```bash
# If MongoDB is installed locally
mongod

# Or set MONGO_URI environment variable for remote MongoDB
export MONGO_URI="mongodb://username:password@host:port/"
```

5. Run the application:
```bash
flask run
```

6. Open your browser and navigate to:
```
http://localhost:5000
```

## Usage

### Starting a Typing Session

1. Navigate to the home page (`/`)
2. Enter your name
3. Begin typing the provided text
4. Submit when complete to record your score

### Viewing the Leaderboard

- Visit `/leaderboard` to see current rankings
- Leaderboards refresh every minute with latest scores
- Rounds are divided into 15-minute intervals
- Winners are determined by highest WPM with accuracy tiebreakers

## API Endpoints

- `GET /` - Main typing test interface
- `GET /leaderboard` - Leaderboard display page
- `POST /api/submit-score` - Submit typing score
- `GET /api/leaderboard` - Get current leaderboard data
- `GET /api/rounds` - Get round history

## Environment Variables

```bash
MONGO_URI          # MongoDB connection string (default: mongodb://localhost:27017/)
FLASK_ENV          # Flask environment (development/production)
```

---

# AWS Deployment Architecture

## Architecture Overview

BuilderType deployed on AWS uses a scalable, highly available multi-tier architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                         USERS / CDN                          │
└────────────────┬────────────────────────────────┬────────────┘
                 │                                 │
        ┌────────▼──────────┐         ┌───────────▼─────────┐
        │   Route 53 DNS    │         │ CloudFront CDN      │
        │  (Geo-routing)    │         │ (Static Assets)     │
        └────────┬──────────┘         └───────────┬─────────┘
                 │                                 │
        ┌────────▼──────────────────────────────────┐
        │    Application Load Balancer (ALB)        │
        │  (SSL/TLS Termination, Traffic Routing)   │
        └────────┬──────────────────────────────────┘
                 │
    ┌────────────┼────────────┬────────────┐
    │            │            │            │
┌───▼───┐   ┌────▼──┐   ┌────▼──┐   ┌────▼──┐
│ ECS   │   │ ECS   │   │ ECS   │   │ ECS   │
│Task 1 │   │Task 2 │   │Task 3 │   │Task N │
│Flask  │   │Flask  │   │Flask  │   │Flask  │
└───┬───┘   └───┬───┘   └───┬───┘   └───┬───┘
    │           │           │           │
    └───────────┼───────────┼───────────┘
                │
        ┌───────▼──────────┐
        │ ElastiCache      │
        │ (Redis Session)  │
        └────────┬─────────┘
                 │
        ┌────────▼──────────────┐
        │  Amazon DocumentDB    │
        │  (MongoDB-compatible) │
        │  (Multi-AZ, Replicas) │
        └──────────────────────┘
        
        ┌──────────────────────┐
        │  S3 Bucket           │
        │  (Static Assets,     │
        │   User Uploads)      │
        └──────────────────────┘

┌──────────────────────────────────────┐
│      Monitoring & Logging            │
│  ├─ CloudWatch Metrics               │
│  ├─ CloudWatch Logs                  │
│  ├─ X-Ray Tracing                    │
│  └─ SNS Alerts                       │
└──────────────────────────────────────┘
```

## Architecture Components

### 1. **DNS & Content Delivery**
- **Route 53**: DNS management with health checks and failover routing
- **CloudFront**: CDN for static assets (JS, CSS, images)
  - Caches static files close to users
  - Reduces load on origin servers
  - SSL/TLS security

### 2. **Load Balancing & Ingress**
- **Application Load Balancer (ALB)**
  - Distributes traffic across ECS tasks
  - SSL/TLS termination
  - Health checks
  - Path-based routing (API vs. static content)

### 3. **Compute Layer**
- **ECS on Fargate** (Recommended) or **ECS on EC2**
  - Containerized Flask application
  - Auto-scaling based on CPU/Memory metrics
  - Task definition handles:
    - Flask app startup
    - Environment variables (MONGO_URI)
    - Container port mapping (typically 5000)
  - Multi-AZ deployment for high availability (min 2 tasks, max 10)

### 4. **Session Management**
- **ElastiCache (Redis)**
  - Stores user session data
  - Caches leaderboard queries for 1-minute intervals
  - Multi-AZ for failover protection
  - Reduces database load

### 5. **Database Layer**
- **Amazon DocumentDB** (MongoDB-compatible)
  - Fully managed NoSQL database
  - Automatic backups and point-in-time recovery
  - Multi-AZ replication
  - Collections: `scores`, `snapshots`, `lb_meta`
  - Handles indexes and high-frequency writes
  - VPC isolation for security

### 6. **Storage**
- **S3 Bucket**
  - Static assets as backup
  - User-generated content (if applicable)
  - Logs and backups
  - Versioning enabled
  - Lifecycle policies for cost optimization

### 7. **Monitoring & Logging**
- **CloudWatch**: Metrics, logs, and alarms
- **X-Ray**: Distributed tracing for performance analysis
- **SNS**: Notifications for alerts and errors

---

## Deployment Architecture (Detailed)

### VPC Configuration

```
┌─────────────────────────────────────────────────┐
│              VPC (10.0.0.0/16)                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Public Subnets (ALB)                          │
│  ├─ us-east-1a: 10.0.1.0/24                   │
│  └─ us-east-1b: 10.0.2.0/24                   │
│                                                 │
│  Private Subnets (ECS Tasks)                   │
│  ├─ us-east-1a: 10.0.10.0/24                  │
│  └─ us-east-1b: 10.0.11.0/24                  │
│                                                 │
│  Database Subnets (DocumentDB)                 │
│  ├─ us-east-1a: 10.0.20.0/24                  │
│  └─ us-east-1b: 10.0.21.0/24                  │
│                                                 │
│  ElastiCache Subnets (Redis)                   │
│  ├─ us-east-1a: 10.0.30.0/24                  │
│  └─ us-east-1b: 10.0.31.0/24                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Security Groups

| Component | Inbound | Outbound |
|-----------|---------|----------|
| ALB | 80 (HTTP), 443 (HTTPS) from 0.0.0.0/0 | All |
| ECS Tasks | 5000 from ALB SG | All |
| DocumentDB | 27017 from ECS SG | None |
| Redis | 6379 from ECS SG | None |

---

## Deployment Steps

### 1. **Containerization**
Create `Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["flask", "run", "--host=0.0.0.0"]
```

### 2. **ECR Repository**
```bash
aws ecr create-repository --repository-name buildertype
docker build -t buildertype:latest .
docker tag buildertype:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/buildertype:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/buildertype:latest
```

### 3. **ECS Task Definition**
```json
{
  "family": "buildertype",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "buildertype",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/buildertype:latest",
      "portMappings": [{"containerPort": 5000}],
      "environment": [
        {"name": "MONGO_URI", "value": "mongodb+srv://user:password@docdb.region.docdb.amazonaws.com:27017/?retryWrites=false"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/buildertype",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 4. **ECS Service Configuration**
- **Launch Type**: Fargate
- **Number of Tasks**: 2-10 (Auto-scaling)
- **Load Balancer**: ALB
- **Health Check Path**: `/`
- **Container Port**: 5000
- **Target Group**: `buildertype-tg`

### 5. **Auto Scaling Policy**
```
Target Tracking Scaling:
- Target CPU Utilization: 70%
- Target Memory Utilization: 80%
- Scale-up Cooldown: 60 seconds
- Scale-down Cooldown: 300 seconds
```

---

## Cost Optimization

| Component | Strategy |
|-----------|----------|
| ECS | Use Fargate Spot for non-critical workloads (-90% cost) |
| DocumentDB | On-demand pricing, consider reserved instances for predictable load |
| ElastiCache | Use smaller instance for dev/test environments |
| Data Transfer | Use VPC endpoints to avoid NAT Gateway costs |
| Monitoring | Use CloudWatch Logs Insights for cost-effective log analysis |

---

## High Availability & Disaster Recovery

| Aspect | Implementation |
|--------|----------------|
| **Multi-AZ** | ECS tasks deployed across 2+ AZs |
| **Database Failover** | DocumentDB Multi-AZ with automatic failover |
| **Backups** | Automated daily backups to S3 |
| **RTO/RPO** | <5 min RTO, <1 min RPO with cross-region replica |
| **Health Checks** | ALB performs health checks every 30 seconds |

---

## Performance Metrics

Expected metrics on this architecture:

| Metric | Target | Approach |
|--------|--------|----------|
| Response Time (p99) | <500ms | Redis caching, CDN |
| QPS Capacity | 1000+ | Auto-scaling ECS + DocumentDB |
| Availability | 99.95% | Multi-AZ redundancy |
| Leaderboard Refresh | <1 min | ElastiCache invalidation |

---

## Development to Production Workflow

1. **Development**: Local Flask + MongoDB
2. **Testing**: ECS on EC2 or Fargate with test data
3. **Staging**: Full AWS stack, production-like configuration
4. **Production**: Multi-AZ ECS Fargate + DocumentDB with monitoring
5. **CI/CD**: GitHub Actions → ECR → ECS Deployment

---

## Additional Resources

- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/)
- [DocumentDB Documentation](https://docs.aws.amazon.com/documentdb/)
- [Application Load Balancer Guide](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/)
- [CloudFront Distribution Setup](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/)

---

## License

MIT License

## Author

Shashank Pandey