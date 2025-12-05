# API Testing Guide

## ✅ The Authentication Error is Normal!

Your API requires authentication for most endpoints. This is expected behavior.

## Quick Test - Public Endpoints (No Auth Required)

These endpoints work without authentication:

```bash
# Public games list
curl http://localhost:8000/api/games/public/

# Public accounts list
curl http://localhost:8000/api/public/accounts/

# Public leaderboard
curl http://localhost:8000/api/games/leaderboard/

# Public user profile (replace 'amenotiomoi' with a username)
curl http://localhost:8000/api/public/accounts/amenotiomoi/
```

## Getting an Authentication Token

### Option 1: Login (if you already have a user account)

```bash
curl -X POST http://localhost:8000/api/accounts/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "rajanand2624@gmail.com",
    "password": "YOUR_PASSWORD"
  }'
```

**Response:**
```json
{
  "token": "your-token-here-abc123...",
  "user": { ... }
}
```

### Option 2: Register a New User

```bash
curl -X POST http://localhost:8000/api/accounts/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "testpass123",
    "first_name": "Test",
    "last_name": "User"
  }'
```

Then verify OTP (check your email):
```bash
curl -X POST http://localhost:8000/api/accounts/verify-otp/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "123456"
  }'
```

### Option 3: Get Token from Django Admin (Quick Test)

1. Go to: http://localhost:8000/admin/authtoken/token/
2. Find or create a token for your user
3. Copy the token

Or use Django shell:
```bash
docker compose exec backend python manage.py shell
```

Then in Python:
```python
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token

User = get_user_model()
user = User.objects.get(username='amenotiomoi')
token, created = Token.objects.get_or_create(user=user)
print(token.key)
```

## Using the Token

Once you have a token, use it in requests:

```bash
# Replace YOUR_TOKEN with your actual token
TOKEN="your-token-here"

# Test authenticated endpoint
curl http://localhost:8000/api/games/ \
  -H "Authorization: Token $TOKEN"
```

Or save it to a variable:
```bash
export TOKEN="your-token-here"
curl http://localhost:8000/api/games/ \
  -H "Authorization: Token $TOKEN"
```

## Example: Complete API Test Flow

```bash
# 1. Test public endpoint (no auth needed)
curl http://localhost:8000/api/games/public/

# 2. Login to get token
curl -X POST http://localhost:8000/api/accounts/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "rajanand2624@gmail.com",
    "password": "YOUR_PASSWORD"
  }' | jq -r '.token' > token.txt

# 3. Use token for authenticated requests
TOKEN=$(cat token.txt)
curl http://localhost:8000/api/games/ \
  -H "Authorization: Token $TOKEN"

# 4. Get your profile
curl http://localhost:8000/api/accounts/me/ \
  -H "Authorization: Token $TOKEN"
```

## Public vs Protected Endpoints

### ✅ Public (No Auth Required)
- `GET /api/games/public/` - Public games list
- `GET /api/public/accounts/` - Public user list
- `GET /api/public/accounts/{username}/` - Public user profile
- `GET /api/games/leaderboard/` - Leaderboards
- `POST /api/accounts/register/` - Register new user
- `POST /api/accounts/login/` - Login
- `POST /api/accounts/verify-otp/` - Verify OTP

### 🔒 Protected (Auth Required)
- `GET /api/games/` - Your games list
- `POST /api/games/` - Create new game
- `GET /api/accounts/me/` - Your profile
- `GET /api/social/friends/` - Your friends
- All game actions (move, finish, etc.)

## Testing with Browser/Postman

### Browser
1. Install a browser extension like "ModHeader" or "Requestly"
2. Add header: `Authorization: Token YOUR_TOKEN`
3. Visit: http://localhost:8000/api/games/

### Postman
1. Create a new request
2. Go to "Authorization" tab
3. Select "Token" type
4. Enter your token
5. Make requests

## Quick Test Script

Save this as `test-api.sh`:

```bash
#!/bin/bash
BASE_URL="http://localhost:8000"

echo "=== Testing Public Endpoints ==="
echo "1. Public games:"
curl -s "$BASE_URL/api/games/public/" | jq '.' | head -20

echo -e "\n2. Public accounts:"
curl -s "$BASE_URL/api/public/accounts/" | jq '.' | head -20

echo -e "\n=== Testing with Authentication ==="
echo "Enter your email:"
read EMAIL
echo "Enter your password:"
read -s PASSWORD

# Login
RESPONSE=$(curl -s -X POST "$BASE_URL/api/accounts/login/" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo $RESPONSE | jq -r '.token')

if [ "$TOKEN" != "null" ] && [ ! -z "$TOKEN" ]; then
  echo "✅ Login successful!"
  echo "Token: $TOKEN"
  
  echo -e "\n3. Your games:"
  curl -s "$BASE_URL/api/games/" \
    -H "Authorization: Token $TOKEN" | jq '.' | head -20
  
  echo -e "\n4. Your profile:"
  curl -s "$BASE_URL/api/accounts/me/" \
    -H "Authorization: Token $TOKEN" | jq '.'
else
  echo "❌ Login failed:"
  echo $RESPONSE | jq '.'
fi
```

Make it executable and run:
```bash
chmod +x test-api.sh
./test-api.sh
```

## Summary

1. ✅ **Authentication errors are normal** - most endpoints require auth
2. ✅ **Public endpoints work** - test those first
3. ✅ **Get a token** - login or use admin panel
4. ✅ **Use token** - add `Authorization: Token YOUR_TOKEN` header
5. ✅ **Test protected endpoints** - games, profile, etc.

Your API is working correctly! 🎉

